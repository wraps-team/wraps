import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentPolicy,
  EnforcerRequest,
} from "../../src/agent-enforcer-contract.js";
import { createHandler } from "./index.ts";

const ddbMock = mockClient(DynamoDBDocumentClient);
const sesMock = mockClient(SESv2Client);

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sesClient = new SESv2Client({});

const AGENT_ADDRESS = "agent@bot.example.com";

const DEFAULT_POLICY: AgentPolicy = {
  maxPerHour: 20,
  maxPerDay: 100,
  allowedRecipients: ["ok@example.com"],
  allowedRecipientDomains: ["allowed.com"],
};

function configItem(overrides?: {
  killed?: boolean;
  emailAddress?: string;
  policy?: Partial<AgentPolicy>;
}) {
  return {
    pk: "CONFIG#a1",
    sk: "CONFIG",
    killed: overrides?.killed ?? false,
    emailAddress: overrides?.emailAddress ?? AGENT_ADDRESS,
    policy: { ...DEFAULT_POLICY, ...overrides?.policy },
  };
}

/** The caller is bound to its per-agent Lambda alias (SEC-2), never the payload. */
function agentContext(agentId = "a1") {
  return {
    invokedFunctionArn: `arn:aws:lambda:us-east-1:123456789012:function:wraps-agent-enforcer:agent-${agentId}`,
  };
}

/** The platform assume-role invokes the unqualified function (execute only). */
function platformContext(qualifier?: string) {
  const base =
    "arn:aws:lambda:us-east-1:123456789012:function:wraps-agent-enforcer";
  return { invokedFunctionArn: qualifier ? `${base}:${qualifier}` : base };
}

function sendEvent(to = "ok@example.com", agentId = "a1"): EnforcerRequest {
  return {
    action: "send",
    agentId,
    payload: {
      from: AGENT_ADDRESS,
      to,
      subject: "hi",
      html: "<p>hi</p>",
      text: "hi",
    },
  };
}

function executeEvent(): EnforcerRequest {
  return {
    action: "execute",
    agentId: "a1",
    approvalId: "ap-9",
    payload: {
      from: AGENT_ADDRESS,
      to: "ok@example.com",
      subject: "hi",
      html: "<p>hi</p>",
      text: "hi",
    },
  };
}

function makeHandler(fetchImpl?: typeof fetch) {
  return createHandler({ dynamo, sesClient, fetchImpl });
}

function approvalFetch(approvalId: string) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ approvalId }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
  ) as unknown as typeof fetch;
}

class ConditionalCheckFailedException extends Error {
  override name = "ConditionalCheckFailedException";
}

beforeEach(() => {
  ddbMock.reset();
  sesMock.reset();
  process.env.POLICY_TABLE = "wraps-email-agent-policy";
  process.env.CONFIG_SET = "wraps-email-tracking";
  process.env.WRAPS_API_URL = "https://api.wraps.dev";
  process.env.WRAPS_AGENT_WEBHOOK_SECRET = "secret-key";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("agent-enforcer — send under cap + allowlisted", () => {
  it("sends via SES and returns {status:'sent'}, matching the payload", async () => {
    ddbMock.on(GetCommand).resolves({ Item: configItem() });
    ddbMock.on(UpdateCommand).resolves({});
    sesMock.on(SendEmailCommand).resolves({ MessageId: "msg-1" });

    const handler = makeHandler();
    const res = await handler(sendEvent(), agentContext("a1"));

    expect(res).toEqual({ status: "sent", messageId: "msg-1" });
    expect(sesMock.commandCalls(SendEmailCommand)).toHaveLength(1);
    const sent = sesMock.commandCalls(SendEmailCommand)[0].args[0].input;
    // TQ-3: the email actually sent mirrors the payload, not hardcoded fields.
    expect(sent.FromEmailAddress).toBe(AGENT_ADDRESS);
    expect(sent.Destination?.ToAddresses).toEqual(["ok@example.com"]);
    expect(sent.Content?.Simple?.Subject?.Data).toBe("hi");
    expect(sent.Content?.Simple?.Body?.Html?.Data).toBe("<p>hi</p>");
    expect(sent.Content?.Simple?.Body?.Text?.Data).toBe("hi");
    expect(sent.ConfigurationSetName).toBe("wraps-email-tracking");
    expect(sent.EmailTags).toEqual([{ Name: "agentId", Value: "a1" }]);
  });
});

describe("agent-enforcer — caller-bound identity (SEC-2)", () => {
  it("uses the caller's alias identity, ignoring a forged payload agentId", async () => {
    ddbMock.on(GetCommand).resolves({ Item: configItem() });
    ddbMock.on(UpdateCommand).resolves({});
    sesMock.on(SendEmailCommand).resolves({ MessageId: "msg-1" });

    // Payload claims to be a different (victim) agent; caller alias is a1.
    const forged = sendEvent("ok@example.com", "victim-agent");
    const handler = makeHandler();
    const res = await handler(forged, agentContext("a1"));

    expect(res.status).toBe("sent");
    // CONFIG is read under the CALLER identity, not the forged payload agentId.
    const configReads = ddbMock
      .commandCalls(GetCommand)
      .map((c) => c.args[0].input.Key);
    expect(configReads).toContainEqual({ pk: "CONFIG#a1", sk: "CONFIG" });
    expect(configReads).not.toContainEqual({
      pk: "CONFIG#victim-agent",
      sk: "CONFIG",
    });
    // Counters + tags are the caller's too.
    const update = ddbMock.commandCalls(UpdateCommand)[0].args[0].input;
    expect(update.Key?.pk).toBe("HOUR#a1");
    const sent = sesMock.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(sent.EmailTags).toEqual([{ Name: "agentId", Value: "a1" }]);
  });

  it("blocks 'send' from an unqualified (platform) caller", async () => {
    ddbMock.on(GetCommand).resolves({ Item: configItem() });

    const handler = makeHandler();
    const res = await handler(sendEvent(), platformContext());

    expect(res).toEqual({
      status: "blocked",
      reason: "unauthorized action for caller",
    });
    // Rejected before any DynamoDB read.
    expect(ddbMock.commandCalls(GetCommand)).toHaveLength(0);
  });

  it("blocks 'execute' from an agent-qualified caller", async () => {
    const handler = makeHandler();
    const res = await handler(executeEvent(), agentContext("a1"));

    expect(res).toEqual({
      status: "blocked",
      reason: "unauthorized action for caller",
    });
    expect(ddbMock.commandCalls(GetCommand)).toHaveLength(0);
  });
});

describe("agent-enforcer — sender pinning (SEC-3)", () => {
  it("blocks a send whose from is not the agent's own address, no SES", async () => {
    ddbMock.on(GetCommand).resolves({ Item: configItem() });
    ddbMock.on(UpdateCommand).resolves({});
    sesMock.on(SendEmailCommand).resolves({ MessageId: "nope" });

    const spoof = sendEvent();
    spoof.payload!.from = "ceo@example.com";
    const handler = makeHandler();
    const res = await handler(spoof, agentContext("a1"));

    expect(res).toEqual({
      status: "blocked",
      reason: "from must be the agent's own address",
    });
    expect(sesMock.commandCalls(SendEmailCommand)).toHaveLength(0);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it("matches the pinned address case-insensitively", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: configItem({ emailAddress: "Agent@Bot.Example.com" }),
    });
    ddbMock.on(UpdateCommand).resolves({});
    sesMock.on(SendEmailCommand).resolves({ MessageId: "msg-1" });

    const handler = makeHandler();
    const res = await handler(sendEvent(), agentContext("a1"));

    expect(res.status).toBe("sent");
  });
});

describe("agent-enforcer — recipient validation (COR-6)", () => {
  it("blocks a multi-recipient / malformed 'to', no SES, no cap write", async () => {
    ddbMock.on(GetCommand).resolves({ Item: configItem() });
    ddbMock.on(UpdateCommand).resolves({});
    sesMock.on(SendEmailCommand).resolves({ MessageId: "nope" });

    const handler = makeHandler();
    const res = await handler(
      sendEvent("a@example.com, b@example.com"),
      agentContext("a1")
    );

    expect(res).toEqual({ status: "blocked", reason: "invalid recipient" });
    expect(sesMock.commandCalls(SendEmailCommand)).toHaveLength(0);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });
});

describe("agent-enforcer — recipient not on allowlist", () => {
  it("skips SES, POSTs the webhook, returns pending_approval with approvalId", async () => {
    ddbMock.on(GetCommand).resolves({ Item: configItem() });
    ddbMock.on(UpdateCommand).resolves({});
    sesMock.on(SendEmailCommand).resolves({ MessageId: "should-not-send" });

    const fetchImpl = approvalFetch("ap-1");
    const handler = makeHandler(fetchImpl);
    const res = await handler(
      sendEvent("stranger@notallowed.com"),
      agentContext("a1")
    );

    expect(res.status).toBe("pending_approval");
    expect(res.approvalId).toBe("ap-1");
    expect(sesMock.commandCalls(SendEmailCommand)).toHaveLength(0);
    // No cap consumed for a non-allowlisted recipient (allowlist precedes caps).
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe("https://api.wraps.dev/v1/agents/webhook");
    expect(init.headers["x-wraps-agent-key"]).toBe("secret-key");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      agentId: "a1",
      event: "pending_approval",
      reason: "recipient not on allowlist",
    });
    expect(body.payload.to).toBe("stranger@notallowed.com");
  });
});

describe("agent-enforcer — hourly cap reached", () => {
  it("inspects the conditional write and flags to pending_approval", async () => {
    ddbMock.on(GetCommand).resolves({ Item: configItem() });
    // Conditional write fails: cap already reached. The item is not mutated.
    ddbMock
      .on(UpdateCommand)
      .rejects(new ConditionalCheckFailedException("cap"));
    sesMock.on(SendEmailCommand).resolves({ MessageId: "should-not-send" });

    const fetchImpl = approvalFetch("ap-2");
    const handler = makeHandler(fetchImpl);
    const res = await handler(sendEvent("ok@example.com"), agentContext("a1"));

    expect(res.status).toBe("pending_approval");
    expect(res.approvalId).toBe("ap-2");
    expect(res.reason).toBe("hourly cap reached");
    expect(sesMock.commandCalls(SendEmailCommand)).toHaveLength(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // TQ-2: the cap is enforced by the conditional UpdateItem, not read-modify-write.
    const calls = ddbMock.commandCalls(UpdateCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0].args[0].input;
    expect(input.Key?.pk).toBe("HOUR#a1");
    expect(input.ConditionExpression).toBe(
      "attribute_not_exists(sends) OR sends < :cap"
    );
    expect(input.ExpressionAttributeValues?.[":cap"]).toBe(20);
  });

  it("propagates a non-conditional DynamoDB error (never a false 'cap reached')", async () => {
    ddbMock.on(GetCommand).resolves({ Item: configItem() });
    const throttle = new Error("throughput exceeded");
    throttle.name = "ProvisionedThroughputExceededException";
    ddbMock.on(UpdateCommand).rejects(throttle);

    const fetchImpl = approvalFetch("nope");
    const handler = makeHandler(fetchImpl);

    // A transient AWS error must surface as a Lambda failure (retryable), NOT be
    // silently swallowed into a "cap reached" policy decision (TQ-2 negative path).
    await expect(
      handler(sendEvent("ok@example.com"), agentContext("a1"))
    ).rejects.toThrow("throughput exceeded");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("agent-enforcer — daily cap reached (COR-9)", () => {
  it("flags for the daily cap and compensates the hourly slot it consumed", async () => {
    ddbMock.on(GetCommand).resolves({ Item: configItem() });
    ddbMock.on(UpdateCommand).callsFake((input) => {
      // Hour increment succeeds; day increment is at the cap.
      if (String(input.Key?.pk).startsWith("DAY#")) {
        throw new ConditionalCheckFailedException("day");
      }
      return {};
    });
    sesMock.on(SendEmailCommand).resolves({ MessageId: "should-not-send" });

    const fetchImpl = approvalFetch("ap-3");
    const handler = makeHandler(fetchImpl);
    const res = await handler(sendEvent("ok@example.com"), agentContext("a1"));

    expect(res.status).toBe("pending_approval");
    expect(res.reason).toBe("daily cap reached");
    expect(res.approvalId).toBe("ap-3");
    expect(sesMock.commandCalls(SendEmailCommand)).toHaveLength(0);

    const updates = ddbMock
      .commandCalls(UpdateCommand)
      .map((c) => c.args[0].input);
    const dayUpdate = updates.find((u) => String(u.Key?.pk).startsWith("DAY#"));
    expect(dayUpdate?.ExpressionAttributeValues?.[":cap"]).toBe(100);
    // COR-9: the hourly slot is incremented THEN given back — net zero.
    const hourUpdates = updates.filter((u) =>
      String(u.Key?.pk).startsWith("HOUR#")
    );
    expect(hourUpdates).toHaveLength(2);
    expect(hourUpdates[0].UpdateExpression).toContain("+ :one");
    expect(hourUpdates[1].UpdateExpression).toBe("SET sends = sends - :one");
  });
});

describe("agent-enforcer — cap <= 0 blocks every send (COR-7)", () => {
  it("flags a maxPerHour:0 policy before writing any counter", async () => {
    ddbMock
      .on(GetCommand)
      .resolves({ Item: configItem({ policy: { maxPerHour: 0 } }) });
    ddbMock.on(UpdateCommand).resolves({});
    sesMock.on(SendEmailCommand).resolves({ MessageId: "nope" });

    const fetchImpl = approvalFetch("ap-0");
    const handler = makeHandler(fetchImpl);
    const res = await handler(sendEvent("ok@example.com"), agentContext("a1"));

    expect(res.status).toBe("pending_approval");
    expect(res.reason).toBe("hourly cap reached");
    // Never one free send: zero counter writes, zero SES.
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
    expect(sesMock.commandCalls(SendEmailCommand)).toHaveLength(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("agent-enforcer — killed agent (kill-switch supremacy)", () => {
  it("blocks the send: no SES, no cap write, no webhook", async () => {
    ddbMock.on(GetCommand).resolves({ Item: configItem({ killed: true }) });
    ddbMock.on(UpdateCommand).resolves({});
    sesMock.on(SendEmailCommand).resolves({ MessageId: "should-not-send" });

    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const handler = makeHandler(fetchImpl);
    const res = await handler(sendEvent("ok@example.com"), agentContext("a1"));

    expect(res.status).toBe("blocked");
    expect(sesMock.commandCalls(SendEmailCommand)).toHaveLength(0);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

/** Route GetCommand by key: OUTCOME → idempotency probe, CONFIG → policy. */
function routeExecuteReads(opts: {
  outcome?: Record<string, unknown> | null;
  config?: Record<string, unknown>;
}) {
  ddbMock.on(GetCommand).callsFake((input) => {
    if (String(input.Key?.pk).startsWith("OUTCOME#")) {
      return opts.outcome ? { Item: opts.outcome } : {};
    }
    return { Item: opts.config ?? configItem() };
  });
}

describe("agent-enforcer — execute on killed agent", () => {
  it("refuses to send (kill-switch wins the race) and writes no outcome", async () => {
    routeExecuteReads({ outcome: null, config: configItem({ killed: true }) });
    ddbMock.on(PutCommand).resolves({});
    sesMock.on(SendEmailCommand).resolves({ MessageId: "should-not-send" });

    const handler = makeHandler();
    const res = await handler(executeEvent(), platformContext());

    expect(res.status).toBe("blocked");
    expect(sesMock.commandCalls(SendEmailCommand)).toHaveLength(0);
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
  });
});

describe("agent-enforcer — execute on live agent", () => {
  it("sends and writes an OUTCOME item with the messageId and agentId", async () => {
    routeExecuteReads({ outcome: null });
    ddbMock.on(PutCommand).resolves({});
    sesMock.on(SendEmailCommand).resolves({ MessageId: "msg-exec" });

    const handler = makeHandler();
    const res = await handler(executeEvent(), platformContext());

    expect(res).toEqual({ status: "sent", messageId: "msg-exec" });
    const puts = ddbMock.commandCalls(PutCommand);
    expect(puts).toHaveLength(1);
    const item = puts[0].args[0].input.Item;
    expect(item?.pk).toBe("OUTCOME#ap-9");
    expect(item?.sk).toBe("OUTCOME");
    expect(item?.status).toBe("sent");
    expect(item?.messageId).toBe("msg-exec");
    expect(item?.agentId).toBe("a1");
  });
});

describe("agent-enforcer — execute idempotency (convention 4)", () => {
  it("two executes for the same approvalId send once; the second replays the stored outcome", async () => {
    let stored: Record<string, unknown> | undefined;
    ddbMock.on(GetCommand).callsFake((input) => {
      if (String(input.Key?.pk).startsWith("OUTCOME#")) {
        return stored ? { Item: stored } : {};
      }
      return { Item: configItem() };
    });
    ddbMock.on(PutCommand).callsFake((input) => {
      stored = input.Item;
      return {};
    });
    sesMock.on(SendEmailCommand).resolves({ MessageId: "msg-exec" });

    const handler = makeHandler();
    const first = await handler(executeEvent(), platformContext());
    const second = await handler(executeEvent(), platformContext());

    expect(first).toEqual({ status: "sent", messageId: "msg-exec" });
    expect(second.status).toBe("sent");
    expect(second.messageId).toBe("msg-exec");
    // Exactly one SES send and one OUTCOME write across both invocations.
    expect(sesMock.commandCalls(SendEmailCommand)).toHaveLength(1);
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(1);
  });
});

describe("agent-enforcer — status poll", () => {
  it("returns the stored OUTCOME verdict for the owning agent", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        pk: "OUTCOME#ap-9",
        sk: "OUTCOME",
        agentId: "a1",
        status: "sent",
        messageId: "msg-done",
      },
    });

    const handler = makeHandler();
    const res = await handler(
      { action: "status", agentId: "a1", approvalId: "ap-9" },
      agentContext("a1")
    );

    expect(res).toEqual({
      status: "sent",
      messageId: "msg-done",
      reason: undefined,
    });
  });

  it("returns {status:'unknown'} for an approvalId owned by another agent (SEC-9)", async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        pk: "OUTCOME#ap-9",
        sk: "OUTCOME",
        agentId: "other-agent",
        status: "sent",
        messageId: "leak",
      },
    });

    const handler = makeHandler();
    const res = await handler(
      { action: "status", agentId: "a1", approvalId: "ap-9" },
      agentContext("a1")
    );

    expect(res).toEqual({ status: "unknown" });
  });

  it("returns {status:'unknown'} for an unknown approvalId", async () => {
    ddbMock.on(GetCommand).resolves({});

    const handler = makeHandler();
    const res = await handler(
      { action: "status", agentId: "a1", approvalId: "nope" },
      agentContext("a1")
    );

    expect(res).toEqual({ status: "unknown" });
  });
});

describe("agent-enforcer — reply-to and threading headers", () => {
  it("sends with replyTo and sets ReplyToAddresses", async () => {
    ddbMock.on(GetCommand).resolves({ Item: configItem() });
    ddbMock.on(UpdateCommand).resolves({});
    sesMock.on(SendEmailCommand).resolves({ MessageId: "msg-1" });

    const event = sendEvent();
    event.payload!.replyTo = "human@example.com";
    const handler = makeHandler();
    const res = await handler(event, agentContext("a1"));

    expect(res.status).toBe("sent");
    const sent = sesMock.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(sent.ReplyToAddresses).toEqual(["human@example.com"]);
  });

  it("sends with inReplyTo + references and sets Content.Simple.Headers", async () => {
    ddbMock.on(GetCommand).resolves({ Item: configItem() });
    ddbMock.on(UpdateCommand).resolves({});
    sesMock.on(SendEmailCommand).resolves({ MessageId: "msg-1" });

    const event = sendEvent();
    event.payload!.inReplyTo = "<abc@mail.example.com>";
    event.payload!.references = "<abc@mail.example.com> <def@mail.example.com>";
    const handler = makeHandler();
    const res = await handler(event, agentContext("a1"));

    expect(res.status).toBe("sent");
    const sent = sesMock.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(sent.Content?.Simple?.Headers).toEqual([
      { Name: "In-Reply-To", Value: "<abc@mail.example.com>" },
      {
        Name: "References",
        Value: "<abc@mail.example.com> <def@mail.example.com>",
      },
    ]);
  });

  it("omits ReplyToAddresses and Headers keys entirely when none of the three fields are set", async () => {
    ddbMock.on(GetCommand).resolves({ Item: configItem() });
    ddbMock.on(UpdateCommand).resolves({});
    sesMock.on(SendEmailCommand).resolves({ MessageId: "msg-1" });

    const handler = makeHandler();
    const res = await handler(sendEvent(), agentContext("a1"));

    expect(res.status).toBe("sent");
    const sent = sesMock.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(sent).not.toHaveProperty("ReplyToAddresses");
    expect(sent.Content?.Simple).not.toHaveProperty("Headers");
  });

  it("blocks a multi-address replyTo before consuming any cap", async () => {
    ddbMock.on(GetCommand).resolves({ Item: configItem() });
    ddbMock.on(UpdateCommand).resolves({});
    sesMock.on(SendEmailCommand).resolves({ MessageId: "nope" });

    const event = sendEvent();
    event.payload!.replyTo = "a@b.com, c@d.com";
    const handler = makeHandler();
    const res = await handler(event, agentContext("a1"));

    expect(res).toEqual({ status: "blocked", reason: "invalid reply-to" });
    expect(sesMock.commandCalls(SendEmailCommand)).toHaveLength(0);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it("blocks a CRLF header-injection attempt in inReplyTo, no SES, no counter write", async () => {
    ddbMock.on(GetCommand).resolves({ Item: configItem() });
    ddbMock.on(UpdateCommand).resolves({});
    sesMock.on(SendEmailCommand).resolves({ MessageId: "nope" });

    const event = sendEvent();
    event.payload!.inReplyTo =
      "<abc@mail.example.com>\r\nBcc: attacker@evil.com";
    const handler = makeHandler();
    const res = await handler(event, agentContext("a1"));

    expect(res).toEqual({ status: "blocked", reason: "invalid in-reply-to" });
    expect(sesMock.commandCalls(SendEmailCommand)).toHaveLength(0);
    expect(ddbMock.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it("blocks the same malformed replyTo on an execute event too", async () => {
    routeExecuteReads({ outcome: null });
    ddbMock.on(PutCommand).resolves({});
    sesMock.on(SendEmailCommand).resolves({ MessageId: "should-not-send" });

    const event = executeEvent();
    event.payload!.replyTo = "a@b.com, c@d.com";
    const handler = makeHandler();
    const res = await handler(event, platformContext());

    expect(res).toEqual({ status: "blocked", reason: "invalid reply-to" });
    expect(sesMock.commandCalls(SendEmailCommand)).toHaveLength(0);
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
  });
});
