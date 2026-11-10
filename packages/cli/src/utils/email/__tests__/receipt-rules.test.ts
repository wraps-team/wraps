import {
  CreateReceiptRuleCommand,
  CreateReceiptRuleSetCommand,
  DeleteReceiptRuleCommand,
  DescribeActiveReceiptRuleSetCommand,
  DescribeReceiptRuleCommand,
  type ReceiptRule,
  SESClient,
  SetActiveReceiptRuleSetCommand,
  UpdateReceiptRuleCommand,
} from "@aws-sdk/client-ses";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activeRuleSetMatchesExpected,
  addDomainToReceiptRule,
  createReceiptRule,
  describeRuleSetDeactivation,
  inboundRuleActions,
  RECEIPT_RULE_RETRY_DELAYS_MS,
  REPLACE_NO_RULE_SET,
  readActiveReceiptRuleSet,
  receiptRuleRetryHooks,
  receiptRuleTriggerOf,
  removeDomainFromReceiptRule,
  setActiveReceiptRuleSet,
  syncReceiptRuleTrigger,
  wouldDeactivateAnotherRuleSet,
} from "../receipt-rules.js";

const ses = mockClient(SESClient);

const REGION = "us-east-1";
const ACCOUNT = "123456789012";
const BUCKET = "wraps-inbound-123456789012-us-east-1";
const PROCESSOR_ARN =
  "arn:aws:lambda:us-east-1:123456789012:function:wraps-inbound-email-processor";

const LEGACY_ACTIONS = [
  { S3Action: { BucketName: BUCKET, ObjectKeyPrefix: "raw/" } },
];
const NEW_ACTIONS = [
  { S3Action: { BucketName: BUCKET, ObjectKeyPrefix: "mail/" } },
  { LambdaAction: { FunctionArn: PROCESSOR_ARN, InvocationType: "Event" } },
];

function existingRule(overrides: Partial<ReceiptRule> = {}): ReceiptRule {
  return {
    Name: "wraps-inbound-catch-all",
    Enabled: true,
    ScanEnabled: true,
    TlsPolicy: "Require",
    Recipients: ["inbound.example.com", "r.mail.example.com"],
    Actions: LEGACY_ACTIONS,
    ...overrides,
  };
}

function notFound(name = "RuleDoesNotExistException") {
  const error = new Error("not found");
  error.name = name;
  return error;
}

function sesError(name: string) {
  const error = new Error(name);
  error.name = name;
  return error;
}

function updateInputs() {
  return ses.commandCalls(UpdateReceiptRuleCommand).map((c) => c.args[0].input);
}

const sleeps: number[] = [];

beforeEach(() => {
  ses.reset();
  sleeps.length = 0;
  vi.spyOn(receiptRuleRetryHooks, "sleep").mockImplementation(async (ms) => {
    sleeps.push(ms);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("inboundRuleActions", () => {
  it("s3-notification: the raw/ S3 action alone", () => {
    expect(
      inboundRuleActions(REGION, ACCOUNT, BUCKET, "s3-notification")
    ).toEqual(LEGACY_ACTIONS);
  });

  it("ses-lambda-action: mail/ S3 action, then an Event LambdaAction on the fixed processor ARN", () => {
    expect(
      inboundRuleActions(REGION, ACCOUNT, BUCKET, "ses-lambda-action")
    ).toEqual(NEW_ACTIONS);
  });
});

describe("receiptRuleTriggerOf", () => {
  it("classifies each shape", () => {
    expect(receiptRuleTriggerOf(null)).toBe("missing");
    expect(receiptRuleTriggerOf(existingRule())).toBe("s3-notification");
    expect(receiptRuleTriggerOf(existingRule({ Actions: NEW_ACTIONS }))).toBe(
      "ses-lambda-action"
    );
    expect(
      receiptRuleTriggerOf(
        existingRule({ Actions: [...LEGACY_ACTIONS, NEW_ACTIONS[1]] })
      )
    ).toBe("unknown");
  });
});

describe("createReceiptRule", () => {
  it("creates the rule in the new mode when none exists (fresh init)", async () => {
    ses.on(DescribeReceiptRuleCommand).rejects(notFound());
    ses.on(CreateReceiptRuleCommand).resolves({});

    await createReceiptRule(
      REGION,
      ACCOUNT,
      "inbound.example.com",
      BUCKET,
      "ses-lambda-action"
    );

    const creates = ses.commandCalls(CreateReceiptRuleCommand);
    expect(creates).toHaveLength(1);
    expect(creates[0].args[0].input).toEqual({
      RuleSetName: "wraps-inbound-rules",
      Rule: {
        Name: "wraps-inbound-catch-all",
        Enabled: true,
        ScanEnabled: true,
        Recipients: ["inbound.example.com"],
        Actions: NEW_ACTIONS,
      },
    });
    expect(ses.commandCalls(UpdateReceiptRuleCommand)).toHaveLength(0);
  });

  it("updates an existing rule in place: merges Recipients, keeps flags, sets the actions, never deletes", async () => {
    ses.on(DescribeReceiptRuleCommand).resolves({ Rule: existingRule() });
    ses.on(UpdateReceiptRuleCommand).resolves({});

    await createReceiptRule(
      REGION,
      ACCOUNT,
      "support.example.com",
      BUCKET,
      "s3-notification"
    );

    expect(updateInputs()).toEqual([
      {
        RuleSetName: "wraps-inbound-rules",
        Rule: {
          Name: "wraps-inbound-catch-all",
          Recipients: [
            "inbound.example.com",
            "r.mail.example.com",
            "support.example.com",
          ],
          Enabled: true,
          ScanEnabled: true,
          TlsPolicy: "Require",
          Actions: LEGACY_ACTIONS,
        },
      },
    ]);
    expect(ses.commandCalls(DeleteReceiptRuleCommand)).toHaveLength(0);
    expect(ses.commandCalls(CreateReceiptRuleCommand)).toHaveLength(0);
  });

  it("does not duplicate a domain already on the rule", async () => {
    ses.on(DescribeReceiptRuleCommand).resolves({ Rule: existingRule() });
    ses.on(UpdateReceiptRuleCommand).resolves({});

    await createReceiptRule(
      REGION,
      ACCOUNT,
      "inbound.example.com",
      BUCKET,
      "ses-lambda-action"
    );

    expect(updateInputs()[0].Rule?.Recipients).toEqual([
      "inbound.example.com",
      "r.mail.example.com",
    ]);
    expect(updateInputs()[0].Rule?.Actions).toEqual(NEW_ACTIONS);
  });

  it("retries InvalidLambdaFunctionException on the create path, then succeeds", async () => {
    ses.on(DescribeReceiptRuleCommand).rejects(notFound());
    ses
      .on(CreateReceiptRuleCommand)
      .rejectsOnce(sesError("InvalidLambdaFunctionException"))
      .rejectsOnce(sesError("InvalidS3ConfigurationException"))
      .resolves({});

    await createReceiptRule(
      REGION,
      ACCOUNT,
      "inbound.example.com",
      BUCKET,
      "ses-lambda-action"
    );

    expect(ses.commandCalls(CreateReceiptRuleCommand)).toHaveLength(3);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it("gives up after about 30 s of retries and throws the SES error", async () => {
    ses.on(DescribeReceiptRuleCommand).rejects(notFound());
    ses
      .on(CreateReceiptRuleCommand)
      .rejects(sesError("InvalidLambdaFunctionException"));

    await expect(
      createReceiptRule(
        REGION,
        ACCOUNT,
        "inbound.example.com",
        BUCKET,
        "ses-lambda-action"
      )
    ).rejects.toMatchObject({ name: "InvalidLambdaFunctionException" });

    expect(sleeps).toEqual(RECEIPT_RULE_RETRY_DELAYS_MS);
    expect(sleeps.reduce((a, b) => a + b, 0)).toBe(30_000);
    expect(ses.commandCalls(CreateReceiptRuleCommand)).toHaveLength(
      RECEIPT_RULE_RETRY_DELAYS_MS.length + 1
    );
  });

  it("does not retry other errors", async () => {
    ses.on(DescribeReceiptRuleCommand).rejects(notFound());
    ses.on(CreateReceiptRuleCommand).rejects(sesError("AccessDenied"));

    await expect(
      createReceiptRule(
        REGION,
        ACCOUNT,
        "inbound.example.com",
        BUCKET,
        "ses-lambda-action"
      )
    ).rejects.toMatchObject({ name: "AccessDenied" });
    expect(ses.commandCalls(CreateReceiptRuleCommand)).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });
});

describe("syncReceiptRuleTrigger", () => {
  it("replaces only the actions, sending the whole described rule", async () => {
    ses.on(DescribeReceiptRuleCommand).resolves({
      Rule: existingRule({ Enabled: false, ScanEnabled: false }),
    });
    ses.on(UpdateReceiptRuleCommand).resolves({});

    await syncReceiptRuleTrigger(REGION, ACCOUNT, BUCKET, "ses-lambda-action");

    expect(updateInputs()).toEqual([
      {
        RuleSetName: "wraps-inbound-rules",
        Rule: {
          Name: "wraps-inbound-catch-all",
          Recipients: ["inbound.example.com", "r.mail.example.com"],
          Enabled: false,
          ScanEnabled: false,
          TlsPolicy: "Require",
          Actions: NEW_ACTIONS,
        },
      },
    ]);
  });

  it("retries InvalidLambdaFunctionException while the SES permission propagates", async () => {
    ses.on(DescribeReceiptRuleCommand).resolves({ Rule: existingRule() });
    ses
      .on(UpdateReceiptRuleCommand)
      .rejectsOnce(sesError("InvalidLambdaFunctionException"))
      .resolves({});

    await syncReceiptRuleTrigger(REGION, ACCOUNT, BUCKET, "ses-lambda-action");

    expect(ses.commandCalls(UpdateReceiptRuleCommand)).toHaveLength(2);
    expect(sleeps).toEqual([1000]);
  });

  it("throws when the rule does not exist", async () => {
    ses.on(DescribeReceiptRuleCommand).rejects(notFound());
    await expect(
      syncReceiptRuleTrigger(REGION, ACCOUNT, BUCKET, "ses-lambda-action")
    ).rejects.toThrow(/does not exist/);
    expect(ses.commandCalls(UpdateReceiptRuleCommand)).toHaveLength(0);
  });

  it("refuses to send an update with empty Recipients", async () => {
    ses.on(DescribeReceiptRuleCommand).resolves({
      Rule: existingRule({ Recipients: [] }),
    });
    await expect(
      syncReceiptRuleTrigger(REGION, ACCOUNT, BUCKET, "ses-lambda-action")
    ).rejects.toThrow(/no recipients/);
    expect(ses.commandCalls(UpdateReceiptRuleCommand)).toHaveLength(0);
  });
});

describe("addDomainToReceiptRule", () => {
  it("appends the domain and keeps the existing actions and flags", async () => {
    ses.on(DescribeReceiptRuleCommand).resolves({
      Rule: existingRule({ Actions: NEW_ACTIONS }),
    });
    ses.on(UpdateReceiptRuleCommand).resolves({});

    await addDomainToReceiptRule(
      REGION,
      ACCOUNT,
      "support.example.com",
      BUCKET,
      "s3-notification"
    );

    expect(updateInputs()).toEqual([
      {
        RuleSetName: "wraps-inbound-rules",
        Rule: {
          Name: "wraps-inbound-catch-all",
          Recipients: [
            "inbound.example.com",
            "r.mail.example.com",
            "support.example.com",
          ],
          Enabled: true,
          ScanEnabled: true,
          TlsPolicy: "Require",
          Actions: NEW_ACTIONS,
        },
      },
    ]);
  });

  it("remove the last domain, then add one in the new mode: the recreated rule keeps the Lambda action", async () => {
    // remove: the rule holds only this domain, so it is deleted
    ses
      .on(DescribeReceiptRuleCommand)
      .resolvesOnce({
        Rule: existingRule({
          Recipients: ["inbound.example.com"],
          Actions: NEW_ACTIONS,
        }),
      })
      .rejects(notFound());
    ses.on(DeleteReceiptRuleCommand).resolves({});
    ses.on(CreateReceiptRuleSetCommand).resolves({});
    ses.on(CreateReceiptRuleCommand).resolves({});
    ses.on(DescribeActiveReceiptRuleSetCommand).resolves({
      Metadata: { Name: "wraps-inbound-rules" },
    });
    ses.on(SetActiveReceiptRuleSetCommand).resolves({});

    await removeDomainFromReceiptRule(REGION, "inbound.example.com");
    expect(ses.commandCalls(DeleteReceiptRuleCommand)).toHaveLength(1);

    await addDomainToReceiptRule(
      REGION,
      ACCOUNT,
      "support.example.com",
      BUCKET,
      "ses-lambda-action",
      REPLACE_NO_RULE_SET
    );

    const creates = ses.commandCalls(CreateReceiptRuleCommand);
    expect(creates).toHaveLength(1);
    expect(creates[0].args[0].input.Rule).toEqual({
      Name: "wraps-inbound-catch-all",
      Enabled: true,
      ScanEnabled: true,
      Recipients: ["support.example.com"],
      Actions: NEW_ACTIONS,
    });
  });
});

describe("removeDomainFromReceiptRule", () => {
  it("removes one domain and sends the whole rule", async () => {
    ses.on(DescribeReceiptRuleCommand).resolves({
      Rule: existingRule({ Actions: NEW_ACTIONS }),
    });
    ses.on(UpdateReceiptRuleCommand).resolves({});

    await removeDomainFromReceiptRule(REGION, "r.mail.example.com");

    expect(updateInputs()).toEqual([
      {
        RuleSetName: "wraps-inbound-rules",
        Rule: {
          Name: "wraps-inbound-catch-all",
          Recipients: ["inbound.example.com"],
          Enabled: true,
          ScanEnabled: true,
          TlsPolicy: "Require",
          Actions: NEW_ACTIONS,
        },
      },
    ]);
  });
});

describe("readActiveReceiptRuleSet", () => {
  it("tells an active set, none active and unreadable apart", async () => {
    ses
      .on(DescribeActiveReceiptRuleSetCommand)
      .resolvesOnce({ Metadata: { Name: "customer-rules" } })
      .resolvesOnce({})
      .rejectsOnce(sesError("AccessDenied"));

    expect(await readActiveReceiptRuleSet(REGION)).toEqual({
      readable: true,
      name: "customer-rules",
    });
    expect(await readActiveReceiptRuleSet(REGION)).toEqual({
      readable: true,
      name: null,
    });
    expect(await readActiveReceiptRuleSet(REGION)).toEqual({
      readable: false,
      error: "AccessDenied",
    });
  });
});

describe("plan 048: activating wraps-inbound-rules only over a consented set", () => {
  const OURS = { readable: true, name: "wraps-inbound-rules" } as const;
  const NONE = { readable: true, name: null } as const;
  const CUSTOMER = { readable: true, name: "customer-rules" } as const;
  const OTHER = { readable: true, name: "other-rules" } as const;
  const UNREADABLE = { readable: false, error: "AccessDenied" } as const;

  it("wouldDeactivateAnotherRuleSet: another set or unreadable, never none or ours", () => {
    expect(wouldDeactivateAnotherRuleSet(NONE)).toBe(false);
    expect(wouldDeactivateAnotherRuleSet(OURS)).toBe(false);
    expect(wouldDeactivateAnotherRuleSet(CUSTOMER)).toBe(true);
    expect(wouldDeactivateAnotherRuleSet(UNREADABLE)).toBe(true);
  });

  it.each([
    // [current, expected, allowed]
    [NONE, NONE, true],
    [NONE, CUSTOMER, true],
    [OURS, NONE, true],
    [OURS, UNREADABLE, true],
    [CUSTOMER, CUSTOMER, true],
    [CUSTOMER, NONE, false],
    [CUSTOMER, OURS, false],
    [OTHER, CUSTOMER, false],
    [CUSTOMER, UNREADABLE, false],
    [UNREADABLE, UNREADABLE, true],
    [UNREADABLE, NONE, false],
    [UNREADABLE, CUSTOMER, false],
  ] as const)(
    "activeRuleSetMatchesExpected(current %o, expected %o) is %s",
    (current, expected, allowed) => {
      expect(activeRuleSetMatchesExpected(current, expected)).toBe(allowed);
    }
  );

  it("activates over the consented set, reading it with DescribeActiveReceiptRuleSet first", async () => {
    ses
      .on(DescribeActiveReceiptRuleSetCommand)
      .resolves({ Metadata: { Name: "customer-rules" } });
    ses.on(SetActiveReceiptRuleSetCommand).resolves({});

    const before = await setActiveReceiptRuleSet(
      REGION,
      "wraps-inbound-rules",
      CUSTOMER
    );

    expect(before).toEqual(CUSTOMER);
    expect(
      ses.commandCalls(SetActiveReceiptRuleSetCommand)[0].args[0].input
    ).toEqual({ RuleSetName: "wraps-inbound-rules" });
  });

  it("refuses without activating when another set became active after the preflight saw none", async () => {
    ses
      .on(DescribeActiveReceiptRuleSetCommand)
      .resolves({ Metadata: { Name: "customer-rules" } });
    ses.on(SetActiveReceiptRuleSetCommand).resolves({});

    await expect(
      setActiveReceiptRuleSet(REGION, "wraps-inbound-rules", NONE)
    ).rejects.toMatchObject({
      code: "RECEIPT_RULE_SET_CONFLICT",
      message: expect.stringContaining("customer-rules"),
      suggestion: expect.stringContaining("--replace-active-rule-set"),
    });
    expect(ses.commandCalls(SetActiveReceiptRuleSetCommand)).toHaveLength(0);
  });

  it("refuses when the active set changed from the one the user agreed to replace", async () => {
    ses
      .on(DescribeActiveReceiptRuleSetCommand)
      .resolves({ Metadata: { Name: "other-rules" } });

    await expect(
      setActiveReceiptRuleSet(REGION, "wraps-inbound-rules", CUSTOMER)
    ).rejects.toMatchObject({
      code: "RECEIPT_RULE_SET_CONFLICT",
      message: expect.stringContaining("not the set you agreed to replace"),
    });
    expect(ses.commandCalls(SetActiveReceiptRuleSetCommand)).toHaveLength(0);
  });

  it("an unreadable active set at activation refuses unless the consent was also given unread", async () => {
    ses
      .on(DescribeActiveReceiptRuleSetCommand)
      .rejects(sesError("AccessDenied"));
    ses.on(SetActiveReceiptRuleSetCommand).resolves({});

    await expect(
      setActiveReceiptRuleSet(REGION, "wraps-inbound-rules", NONE)
    ).rejects.toMatchObject({
      code: "RECEIPT_RULE_SET_CONFLICT",
      message: expect.stringContaining("AccessDenied"),
    });
    expect(ses.commandCalls(SetActiveReceiptRuleSetCommand)).toHaveLength(0);

    const before = await setActiveReceiptRuleSet(
      REGION,
      "wraps-inbound-rules",
      UNREADABLE
    );
    expect(before).toEqual(UNREADABLE);
    expect(ses.commandCalls(SetActiveReceiptRuleSetCommand)).toHaveLength(1);
  });

  it("no set active, or ours: unchanged (activates silently, or not at all when ours already is)", async () => {
    ses
      .on(DescribeActiveReceiptRuleSetCommand)
      .resolvesOnce({})
      .resolvesOnce({ Metadata: { Name: "wraps-inbound-rules" } });
    ses.on(SetActiveReceiptRuleSetCommand).resolves({});

    expect(
      await setActiveReceiptRuleSet(REGION, "wraps-inbound-rules", NONE)
    ).toEqual(NONE);
    expect(ses.commandCalls(SetActiveReceiptRuleSetCommand)).toHaveLength(1);

    expect(
      await setActiveReceiptRuleSet(REGION, "wraps-inbound-rules", NONE)
    ).toEqual(OURS);
    expect(ses.commandCalls(SetActiveReceiptRuleSetCommand)).toHaveLength(1);
  });

  it("addDomainToReceiptRule's create fallback refuses to activate over a set nobody agreed to replace", async () => {
    ses.on(DescribeReceiptRuleCommand).rejects(notFound());
    ses.on(CreateReceiptRuleSetCommand).resolves({});
    ses.on(CreateReceiptRuleCommand).resolves({});
    ses
      .on(DescribeActiveReceiptRuleSetCommand)
      .resolves({ Metadata: { Name: "customer-rules" } });
    ses.on(SetActiveReceiptRuleSetCommand).resolves({});

    await expect(
      addDomainToReceiptRule(
        REGION,
        ACCOUNT,
        "support.example.com",
        BUCKET,
        "ses-lambda-action",
        REPLACE_NO_RULE_SET
      )
    ).rejects.toMatchObject({ code: "RECEIPT_RULE_SET_CONFLICT" });
    expect(ses.commandCalls(SetActiveReceiptRuleSetCommand)).toHaveLength(0);

    await addDomainToReceiptRule(
      REGION,
      ACCOUNT,
      "support.example.com",
      BUCKET,
      "ses-lambda-action",
      CUSTOMER
    );
    expect(ses.commandCalls(SetActiveReceiptRuleSetCommand)).toHaveLength(1);
  });

  it("describeRuleSetDeactivation names the set, or the read error, for --preview", () => {
    expect(describeRuleSetDeactivation(NONE)).toBeNull();
    expect(describeRuleSetDeactivation(OURS)).toBeNull();
    expect(describeRuleSetDeactivation(CUSTOMER)).toContain(
      "would deactivate the active receipt rule set customer-rules"
    );
    expect(describeRuleSetDeactivation(UNREADABLE)).toContain("AccessDenied");
  });
});
