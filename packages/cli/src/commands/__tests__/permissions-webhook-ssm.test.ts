import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setJsonMode } from "../../utils/shared/json-output.js";

vi.mock("../../telemetry/events.js", () => ({
  trackCommand: vi.fn(),
}));

import { permissions } from "../permissions.js";

type Statement = {
  Sid: string;
  Action: string[];
  Resource: string | string[];
  Condition?: Record<string, Record<string, string | string[]>>;
};

type Preset = "starter" | "production" | "enterprise" | undefined;
type Service = "email" | "sms" | "cdn" | undefined;

/** Run `wraps permissions --json` and return the raw JSON line it printed. */
async function rawPolicyOutput(
  preset: Preset,
  service: Service
): Promise<string> {
  const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
  await permissions({ json: true, preset, service });
  const line = log.mock.calls
    .map((c) => c[0])
    .find(
      (a) => typeof a === "string" && a.includes('"command":"permissions"')
    );
  log.mockRestore();
  return line as string;
}

async function policyFor(
  preset: Preset,
  service: Service = "email"
): Promise<Statement[]> {
  return JSON.parse(await rawPolicyOutput(preset, service)).data.policy
    .Statement;
}

const NEW_SIDS = [
  "EventBridgeWebhookDestinations",
  "EventBridgeConnectionSecrets",
  "EventBridgeApiDestinationsServiceRole",
  "ReplyThreadingSecret",
  "ReplyThreadingSecretDescribe",
];

// AmazonEventBridgeFullAccess v7, Sid IAMCreateServiceLinkedRoleForApiDestinations
const SLR_RESOURCE =
  "arn:aws:iam::*:role/aws-service-role/apidestinations.events.amazonaws.com/AWSServiceRoleForAmazonEventBridgeApiDestinations";
const SLR_CONDITION = {
  StringEquals: {
    "iam:AWSServiceName": "apidestinations.events.amazonaws.com",
  },
};

function resources(stmt: Statement): string[] {
  return Array.isArray(stmt.Resource) ? stmt.Resource : [stmt.Resource];
}

beforeEach(() => {
  setJsonMode(true);
});

afterEach(() => {
  setJsonMode(false);
});

describe("permissions: webhook connections and reply-threading secret (plan 047)", () => {
  const withFeature: Array<[Preset, Service]> = [
    ["production", "email"],
    ["enterprise", "email"],
    [undefined, "email"],
    [undefined, undefined],
    ["production", undefined],
    ["enterprise", undefined],
  ];

  it.each(withFeature)(
    "preset %s / service %s includes every new statement",
    async (preset, service) => {
      const sids = (await policyFor(preset, service)).map((s) => s.Sid);
      expect(sids).toEqual(expect.arrayContaining(NEW_SIDS));
    }
  );

  const withoutFeature: Array<[Preset, Service]> = [
    ["starter", "email"],
    ["starter", "sms"],
    ["starter", "cdn"],
    ["starter", undefined],
    [undefined, "sms"],
    [undefined, "cdn"],
    ["enterprise", "sms"],
    ["enterprise", "cdn"],
  ];

  it.each(withoutFeature)(
    "preset %s / service %s has none of them",
    async (preset, service) => {
      const sids = (await policyFor(preset, service)).map((s) => s.Sid);
      for (const sid of NEW_SIDS) {
        expect(sids).not.toContain(sid);
      }
    }
  );

  it("the SLR statement appears exactly where the webhook statement does", async () => {
    for (const [preset, service] of [...withFeature, ...withoutFeature]) {
      const sids = (await policyFor(preset, service)).map((s) => s.Sid);
      expect(sids.includes("EventBridgeApiDestinationsServiceRole")).toBe(
        sids.includes("EventBridgeWebhookDestinations")
      );
    }
  });

  it("connection and API destination actions are scoped to wraps-* resources", async () => {
    const stmt = (await policyFor("production")).find(
      (s) => s.Sid === "EventBridgeWebhookDestinations"
    );
    expect(stmt?.Action).toEqual([
      "events:CreateConnection",
      "events:DescribeConnection",
      "events:UpdateConnection",
      "events:DeleteConnection",
      "events:CreateApiDestination",
      "events:DescribeApiDestination",
      "events:UpdateApiDestination",
      "events:DeleteApiDestination",
    ]);
    expect(stmt?.Resource).toEqual([
      "arn:aws:events:*:*:connection/wraps-*",
      "arn:aws:events:*:*:api-destination/wraps-*",
    ]);
    expect(stmt?.Condition).toBeUndefined();
  });

  it("Secrets Manager actions match AWS's documented set and only reach our connections' secrets", async () => {
    const statements = await policyFor("production");
    const stmt = statements.find(
      (s) => s.Sid === "EventBridgeConnectionSecrets"
    );
    expect(stmt?.Action).toEqual([
      "secretsmanager:CreateSecret",
      "secretsmanager:UpdateSecret",
      "secretsmanager:DeleteSecret",
      "secretsmanager:GetSecretValue",
      "secretsmanager:PutSecretValue",
    ]);
    expect(stmt?.Resource).toEqual([
      "arn:aws:secretsmanager:*:*:secret:events!connection/wraps-*",
    ]);
    const secretResources = statements
      .filter((s) => s.Action.some((a) => a.startsWith("secretsmanager:")))
      .flatMap(resources);
    expect(secretResources).toEqual([
      "arn:aws:secretsmanager:*:*:secret:events!connection/wraps-*",
    ]);
  });

  it("the service-linked-role statement copies AWS's resource and condition", async () => {
    const stmt = (await policyFor("production")).find(
      (s) => s.Sid === "EventBridgeApiDestinationsServiceRole"
    );
    expect(stmt?.Action).toEqual(["iam:CreateServiceLinkedRole"]);
    expect(stmt?.Resource).toBe(SLR_RESOURCE);
    expect(stmt?.Condition).toEqual(SLR_CONDITION);
  });

  it("the condition appears verbatim in the generated policy JSON", async () => {
    const raw = await rawPolicyOutput(undefined, undefined);
    expect(raw).toContain(
      '"Condition":{"StringEquals":{"iam:AWSServiceName":"apidestinations.events.amazonaws.com"}}'
    );
  });

  it("no other statement carries a Condition", async () => {
    const statements = await policyFor(undefined, undefined);
    const withCondition = statements
      .filter((s) => s.Condition !== undefined)
      .map((s) => s.Sid);
    expect(withCondition).toEqual(["EventBridgeApiDestinationsServiceRole"]);
  });

  it("reply-threading SSM actions are scoped to /wraps/email/reply-secret/*", async () => {
    const stmt = (await policyFor("production")).find(
      (s) => s.Sid === "ReplyThreadingSecret"
    );
    expect(stmt?.Action).toEqual([
      "ssm:PutParameter",
      "ssm:GetParameter",
      "ssm:DeleteParameter",
      "ssm:AddTagsToResource",
      "ssm:RemoveTagsFromResource",
      "ssm:ListTagsForResource",
    ]);
    expect(stmt?.Resource).toEqual([
      "arn:aws:ssm:*:*:parameter/wraps/email/reply-secret/*",
    ]);
  });

  it("only ssm:DescribeParameters (metadata, no resource type) is on *", async () => {
    const statements = await policyFor(undefined, undefined);
    const describe = statements.find(
      (s) => s.Sid === "ReplyThreadingSecretDescribe"
    );
    expect(describe?.Action).toEqual(["ssm:DescribeParameters"]);
    expect(describe?.Resource).toBe("*");

    const ssmOnStar = statements
      .filter((s) => resources(s).includes("*"))
      .flatMap((s) => s.Action)
      .filter((a) => a.startsWith("ssm:"));
    expect(ssmOnStar).toEqual(["ssm:DescribeParameters"]);

    const secretsOnStar = statements
      .filter((s) => resources(s).includes("*"))
      .flatMap((s) => s.Action)
      .filter((a) => a.startsWith("secretsmanager:"));
    expect(secretsOnStar).toEqual([]);
  });

  it("no new grant needs KMS (aws/ssm is AWS managed; connection secrets use an AWS owned key)", async () => {
    const actions = (await policyFor(undefined, undefined)).flatMap(
      (s) => s.Action
    );
    expect(actions.filter((a) => a.startsWith("kms:"))).toEqual([]);
  });

  it("every Sid in the full policy is unique (buildPolicy drops repeats silently)", async () => {
    const sids = (await policyFor(undefined, undefined)).map((s) => s.Sid);
    expect(new Set(sids).size).toBe(sids.length);
  });
});
