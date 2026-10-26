import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import type { Context, S3Event } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeReplyToken } from "../../src/reply-token.js";

const s3Mock = mockClient(S3Client);
const ebMock = mockClient(EventBridgeClient);
const ssmMock = mockClient(SSMClient);

const PARSED_BUCKET = "parsed-bucket";
const INTERNAL_FAILURE = /InternalFailure/;

type EmailFixture = {
  to?: Array<{ address: string }>;
  cc?: Array<{ address: string }>;
  from?: { address: string; name?: string };
  headers?: [string, unknown][];
  subject?: string;
  html?: string;
  text?: string;
};

const parsedState: { queue: EmailFixture[] } = { queue: [] };

function parseFromFixture(fx: EmailFixture) {
  const headers = new Map<string, unknown>(fx.headers ?? []);
  const toValue = (fx.to ?? []).map((a) => ({ address: a.address, name: "" }));
  const ccValue = (fx.cc ?? []).map((a) => ({ address: a.address, name: "" }));
  const fromValue = fx.from
    ? [{ address: fx.from.address, name: fx.from.name ?? "" }]
    : [];
  return {
    messageId: "<msg@example.com>",
    subject: fx.subject ?? "",
    from: fx.from ? { value: fromValue } : undefined,
    to:
      toValue.length > 0
        ? { value: toValue, text: toValue.map((t) => t.address).join(", ") }
        : undefined,
    cc:
      ccValue.length > 0
        ? { value: ccValue, text: ccValue.map((t) => t.address).join(", ") }
        : undefined,
    html: fx.html ?? "<p>hi</p>",
    text: fx.text ?? "hi",
    headers,
    attachments: [],
    date: new Date("2026-01-01T00:00:00Z"),
  };
}

vi.mock("mailparser", () => ({
  simpleParser: vi.fn(async () => {
    const fx = parsedState.queue.shift() ?? {};
    return parseFromFixture(fx);
  }),
}));

function singleS3Event(key = "raw/abc", eventTime?: string): S3Event {
  return {
    Records: [
      {
        ...(eventTime ? { eventTime } : {}),
        s3: { bucket: { name: "raw-bucket" }, object: { key } },
      },
    ],
  } as unknown as S3Event;
}

function multiS3Event(keys: string[]): S3Event {
  return {
    Records: keys.map((key) => ({
      s3: { bucket: { name: "raw-bucket" }, object: { key } },
    })),
  } as unknown as S3Event;
}

function makeCtx(): Context {
  return { awsRequestId: "req-1" } as unknown as Context;
}

async function capturedPut(idx = 0): Promise<{
  source?: string;
  detailType?: string;
  rawDetail: string;
  detail: Record<string, unknown>;
}> {
  const calls = ebMock.commandCalls(PutEventsCommand);
  if (calls.length <= idx) {
    throw new Error(`no EventBridge PutEvents call at idx ${idx}`);
  }
  const entry = calls[idx].args[0].input.Entries?.[0];
  return {
    source: entry?.Source,
    detailType: entry?.DetailType,
    rawDetail: entry?.Detail ?? "",
    detail: JSON.parse(entry?.Detail ?? "{}") as Record<string, unknown>,
  };
}

function capturedParsedObject(): { key: string; body: string } {
  const call = s3Mock
    .commandCalls(PutObjectCommand)
    .find((c) => c.args[0].input.Key?.startsWith("parsed/"));
  if (!call) {
    throw new Error("no parsed/ PutObject call");
  }
  return {
    key: call.args[0].input.Key as string,
    body: call.args[0].input.Body as string,
  };
}

async function runHandler(event: S3Event = singleS3Event()) {
  const { handler } = await import("./index.ts");
  await handler(event, makeCtx());
}

beforeEach(() => {
  s3Mock.reset();
  ebMock.reset();
  ssmMock.reset();
  parsedState.queue = [];

  s3Mock.on(GetObjectCommand).callsFake(() => ({
    Body: {
      transformToString: async () => "From: a@example.com\r\n\r\nhello",
    },
  }));
  s3Mock.on(PutObjectCommand).resolves({});
  ebMock.on(PutEventsCommand).resolves({ FailedEntryCount: 0, Entries: [] });

  process.env.BUCKET_NAME = PARSED_BUCKET;
  // biome-ignore lint/performance/noDelete: process.env coerces `= undefined` to the string "undefined" (truthy). Actual key removal is required so `Boolean(process.env.REPLY_SECRET_PARAMETER_PREFIX)` is false in the feature-disabled tests.
  delete process.env.REPLY_SECRET_PARAMETER_PREFIX;
  // A 1 MB-limit Region; tests that need the 256 KB limit override it.
  process.env.AWS_REGION = "eu-west-1";

  // Fresh module — re-initializes the module-scope domainSecretCache per test.
  vi.resetModules();
});

afterEach(() => {
  // biome-ignore lint/performance/noDelete: see above — string "undefined" is truthy.
  delete process.env.REPLY_SECRET_PARAMETER_PREFIX;
});

describe("inbound-processor — non-reply recipient", () => {
  it("emits replyToken: null and autoReply: false for a non r.mail.* recipient", async () => {
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: "inbox@support.foo.com" }],
        headers: [],
      },
    ];

    await runHandler();

    const ev = await capturedPut();
    expect(ev.source).toBe("wraps.inbound");
    expect(ev.detail.replyToken).toBeNull();
    expect(ev.detail.autoReply).toBe(false);
  });
});

describe("inbound-processor — reply-threading branch", () => {
  const secret = Buffer.alloc(32, 0x5a);
  const prefix = "/wraps/email/reply-secret/";

  beforeEach(() => {
    process.env.REPLY_SECRET_PARAMETER_PREFIX = prefix;
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Value: JSON.stringify({ kid: 1, current: secret.toString("base64") }),
      },
    });
  });

  it("emits status: valid with conversationId/sendId when token verifies", async () => {
    const convId = Buffer.alloc(8, 0x01);
    const sendId = Buffer.alloc(8, 0x02);
    const token = encodeReplyToken({
      kid: 1,
      convId,
      sendId,
      exp: 0,
      secret,
    });
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: `${token}@r.mail.support.foo.com` }],
        headers: [],
      },
    ];

    await runHandler();

    const ev = await capturedPut();
    const rt = ev.detail.replyToken as {
      status: string;
      conversationId: string;
      sendId: string;
    };
    expect(rt.status).toBe("valid");
    expect(typeof rt.conversationId).toBe("string");
    expect(typeof rt.sendId).toBe("string");
  });

  it("emits status: invalid-signature when HMAC does not match; does not leak ids", async () => {
    const token = encodeReplyToken({
      kid: 1,
      convId: Buffer.alloc(8, 0x11),
      sendId: Buffer.alloc(8, 0x22),
      exp: 0,
      secret: Buffer.alloc(32, 0xee),
    });
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: `${token}@r.mail.support.foo.com` }],
        headers: [],
      },
    ];

    await runHandler();

    const ev = await capturedPut();
    const rt = ev.detail.replyToken as {
      status: string;
      conversationId: unknown;
      sendId: unknown;
    };
    expect(rt.status).toBe("invalid-signature");
    expect(rt.conversationId).toBeNull();
    expect(rt.sendId).toBeNull();
  });

  it("prefers X-Original-To header over To: for recipient derivation", async () => {
    const token = encodeReplyToken({
      kid: 1,
      convId: Buffer.alloc(8, 0x33),
      sendId: Buffer.alloc(8, 0x44),
      exp: 0,
      secret,
    });
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: "not-a-reply@support.foo.com" }],
        headers: [["x-original-to", `${token}@r.mail.support.foo.com`]],
      },
    ];

    await runHandler();

    const ev = await capturedPut();
    const rt = ev.detail.replyToken as { status: string };
    expect(rt.status).toBe("valid");
    expect(ev.detail.receivingDomain).toBe("r.mail.support.foo.com");
  });

  it("sets autoReply: true for Auto-Submitted: auto-replied headers", async () => {
    parsedState.queue = [
      {
        from: { address: "vacation@external.com" },
        to: [{ address: "inbox@support.foo.com" }],
        headers: [["auto-submitted", "auto-replied"]],
      },
    ];

    await runHandler();

    const ev = await capturedPut();
    expect(ev.detail.autoReply).toBe(true);
  });

  it("reuses the per-domain cache: two records for the same domain → one SSM fetch", async () => {
    const token = encodeReplyToken({
      kid: 1,
      convId: Buffer.alloc(8, 0x55),
      sendId: Buffer.alloc(8, 0x66),
      exp: 0,
      secret,
    });
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: `${token}@r.mail.support.foo.com` }],
        headers: [],
      },
      {
        from: { address: "sender@external.com" },
        to: [{ address: `${token}@r.mail.support.foo.com` }],
        headers: [],
      },
    ];

    await runHandler(multiS3Event(["raw/a", "raw/b"]));

    const getCalls = ssmMock.commandCalls(GetParameterCommand);
    expect(getCalls.length).toBe(1);
  });

  it("per-domain cache: different sending domains → separate SSM fetches", async () => {
    const token1 = encodeReplyToken({
      kid: 1,
      convId: Buffer.alloc(8, 0xa1),
      sendId: Buffer.alloc(8, 0xa2),
      exp: 0,
      secret,
    });
    const token2 = encodeReplyToken({
      kid: 1,
      convId: Buffer.alloc(8, 0xb1),
      sendId: Buffer.alloc(8, 0xb2),
      exp: 0,
      secret,
    });
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: `${token1}@r.mail.support.foo.com` }],
        headers: [],
      },
      {
        from: { address: "sender@external.com" },
        to: [{ address: `${token2}@r.mail.sales.foo.com` }],
        headers: [],
      },
    ];

    await runHandler(multiS3Event(["raw/a", "raw/b"]));

    const getCalls = ssmMock.commandCalls(GetParameterCommand);
    expect(getCalls.length).toBe(2);
    const names = getCalls.map((c) => c.args[0].input.Name).sort();
    expect(names).toEqual([
      `${prefix}sales.foo.com`,
      `${prefix}support.foo.com`,
    ]);
  });

  it("emits status: unknown-domain when SSM value is malformed JSON", async () => {
    const token = encodeReplyToken({
      kid: 1,
      convId: Buffer.alloc(8, 0x01),
      sendId: Buffer.alloc(8, 0x02),
      exp: 0,
      secret,
    });
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: `${token}@r.mail.support.foo.com` }],
        headers: [],
      },
    ];
    ssmMock.reset();
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: { Value: "not-valid-json{" },
    });

    await runHandler();

    const ev = await capturedPut();
    const rt = ev.detail.replyToken as { status: string };
    expect(rt.status).toBe("unknown-domain");
  });

  it("emits status: unknown-domain when SSM value is missing required fields", async () => {
    const token = encodeReplyToken({
      kid: 1,
      convId: Buffer.alloc(8, 0x11),
      sendId: Buffer.alloc(8, 0x22),
      exp: 0,
      secret,
    });
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: `${token}@r.mail.support.foo.com` }],
        headers: [],
      },
    ];
    ssmMock.reset();
    // Missing `kid` and `current` — e.g. an operator mis-edited the param.
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: { Value: JSON.stringify({ foo: "bar" }) },
    });

    await runHandler();

    const ev = await capturedPut();
    const rt = ev.detail.replyToken as { status: string };
    expect(rt.status).toBe("unknown-domain");
  });

  it("emits status: unknown-domain when SSM returns ParameterNotFound", async () => {
    const token = encodeReplyToken({
      kid: 1,
      convId: Buffer.alloc(8, 0xcc),
      sendId: Buffer.alloc(8, 0xdd),
      exp: 0,
      secret,
    });
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: `${token}@r.mail.unknown.foo.com` }],
        headers: [],
      },
    ];
    ssmMock.reset();
    class ParameterNotFound extends Error {
      override name = "ParameterNotFound";
    }
    ssmMock.on(GetParameterCommand).rejects(new ParameterNotFound("nope"));

    await runHandler();

    const ev = await capturedPut();
    const rt = ev.detail.replyToken as { status: string };
    expect(rt.status).toBe("unknown-domain");
  });

  it("emits status: unknown-domain for malformed sending domain; never calls SSM", async () => {
    // Recipient host contains a slash — stripping `r.mail.` leaves a domain
    // that would produce a path-traversal SSM parameter name. The handler
    // must reject it without issuing a GetParameterCommand (which would fail
    // with ValidationException and trigger retry/DLQ).
    const token = encodeReplyToken({
      kid: 1,
      convId: Buffer.alloc(8, 0xab),
      sendId: Buffer.alloc(8, 0xcd),
      exp: 0,
      secret,
    });
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: `${token}@r.mail.foo%2Fbar.com` }],
        headers: [],
      },
    ];

    await runHandler();

    const getCalls = ssmMock.commandCalls(GetParameterCommand);
    expect(getCalls.length).toBe(0);
    const ev = await capturedPut();
    const rt = ev.detail.replyToken as { status: string };
    expect(rt.status).toBe("unknown-domain");
  });

  it("emits status: unknown-domain for path-traversal sending domain", async () => {
    const token = encodeReplyToken({
      kid: 1,
      convId: Buffer.alloc(8, 0x11),
      sendId: Buffer.alloc(8, 0x22),
      exp: 0,
      secret,
    });
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: `${token}@r.mail...foo.com` }],
        headers: [],
      },
    ];

    await runHandler();

    const getCalls = ssmMock.commandCalls(GetParameterCommand);
    expect(getCalls.length).toBe(0);
    const ev = await capturedPut();
    const rt = ev.detail.replyToken as { status: string };
    expect(rt.status).toBe("unknown-domain");
  });

  it("verifies tokens signed by non-sequential previous kid when SSM stores previousKid explicitly", async () => {
    // SSM blob uses non-sequential kids (5 current, 3 previous) — could occur
    // if an operator hand-edits the parameter. buildSecretsMap must honor the
    // explicit previousKid rather than assuming `kid - 1`.
    const currentSecret = Buffer.alloc(32, 0xaa);
    const previousSecret = Buffer.alloc(32, 0xbb);
    ssmMock.reset();
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Value: JSON.stringify({
          kid: 5,
          current: currentSecret.toString("base64"),
          previous: previousSecret.toString("base64"),
          previousKid: 3,
        }),
      },
    });

    // Token signed with the previous key (kid=3), which skipped kid=4.
    const token = encodeReplyToken({
      kid: 3,
      convId: Buffer.alloc(8, 0x33),
      sendId: Buffer.alloc(8, 0x44),
      exp: 0,
      secret: previousSecret,
    });
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: `${token}@r.mail.support.foo.com` }],
        headers: [],
      },
    ];

    await runHandler();

    const ev = await capturedPut();
    const rt = ev.detail.replyToken as { status: string };
    expect(rt.status).toBe("valid");
  });

  it("normalizes mixed-case recipient domains to lowercase for SSM lookup", async () => {
    // SSM params are stored at lowercase (created by CLI), but SES/mailparser
    // may preserve case in the recipient address. The Lambda must lowercase
    // the sending domain so `@r.mail.SUPPORT.FOO.com` finds
    // `/wraps/email/reply-secret/support.foo.com`.
    const token = encodeReplyToken({
      kid: 1,
      convId: Buffer.alloc(8, 0x77),
      sendId: Buffer.alloc(8, 0x88),
      exp: 0,
      secret,
    });
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: `${token}@r.mail.SUPPORT.FOO.com` }],
        headers: [],
      },
    ];

    await runHandler();

    const getCalls = ssmMock.commandCalls(GetParameterCommand);
    expect(getCalls.length).toBe(1);
    expect(getCalls[0].args[0].input.Name).toBe(`${prefix}support.foo.com`);
    const ev = await capturedPut();
    const rt = ev.detail.replyToken as { status: string };
    expect(rt.status).toBe("valid");
  });

  it("strips the r.mail. prefix to compute SSM parameter name", async () => {
    const token = encodeReplyToken({
      kid: 1,
      convId: Buffer.alloc(8, 0x77),
      sendId: Buffer.alloc(8, 0x88),
      exp: 0,
      secret,
    });
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: `${token}@r.mail.support.foo.com` }],
        headers: [],
      },
    ];

    await runHandler();

    const getCalls = ssmMock.commandCalls(GetParameterCommand);
    expect(getCalls.length).toBe(1);
    expect(getCalls[0].args[0].input.Name).toBe(`${prefix}support.foo.com`);
  });
});

describe("inbound-processor — feature-disabled path", () => {
  it("never calls SSM and always emits replyToken: null when prefix env is unset", async () => {
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: "something@r.mail.support.foo.com" }],
        headers: [],
      },
    ];

    await runHandler();

    const ev = await capturedPut();
    expect(ev.detail.replyToken).toBeNull();
    expect(ssmMock.commandCalls(GetParameterCommand).length).toBe(0);
  });
});

describe("inbound-processor — EventBridge entry size", () => {
  const MB = 1024 * 1024;

  async function entryBytes(): Promise<number> {
    const { putEventsEntrySize } = await import("./index.ts");
    const ev = await capturedPut();
    return putEventsEntrySize({
      Source: ev.source ?? "",
      DetailType: ev.detailType ?? "",
      Detail: ev.rawDetail,
    });
  }

  it("sends a small mail unchanged: detail equals the parsed JSON in S3", async () => {
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: "inbox@support.foo.com" }],
        subject: "hello",
      },
    ];

    await runHandler();

    const ev = await capturedPut();
    expect(ev.rawDetail).toBe(capturedParsedObject().body);
    expect(ev.detail.truncated).toBeUndefined();
    expect(ev.detail.parsedS3Key).toBeUndefined();
    expect(ev.detail.html).toBe("<p>hi</p>");
    expect(ev.detail.text).toBe("hi");
  });

  it("trims a huge text body under the limit and points at the parsed JSON", async () => {
    const hugeText = "x".repeat(2 * MB);
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: "inbox@support.foo.com" }],
        cc: [{ address: "cc@support.foo.com" }],
        subject: "big one",
        text: hugeText,
        headers: [["x-ses-spam-verdict", "PASS"]],
      },
    ];

    await runHandler(singleS3Event("raw/big"));

    const { maxEventEntryBytes } = await import("./index.ts");
    const ev = await capturedPut();
    const parsedObject = capturedParsedObject();
    expect(await entryBytes()).toBeLessThanOrEqual(maxEventEntryBytes());
    expect(maxEventEntryBytes()).toBeLessThan(MB);
    expect(ev.detail.truncated).toBe(true);
    expect(ev.detail.parsedS3Key).toBe(parsedObject.key);
    expect(ev.detail.parsedS3Key).toBe(`parsed/${ev.detail.emailId}.json`);
    // Only the oversized field goes; the small html stays inline.
    expect(ev.detail.truncatedFields).toEqual(["text"]);
    expect(ev.detail.text).toBeNull();
    expect(ev.detail.html).toBe("<p>hi</p>");
    expect(ev.detail.htmlTruncated).toBe(false);
    // Identifying fields survive.
    expect(ev.detail.rawS3Key).toBe("raw/big");
    expect(ev.detail.subject).toBe("big one");
    expect(ev.detail.from).toEqual({
      address: "sender@external.com",
      name: "",
    });
    expect(ev.detail.to).toEqual([
      { address: "inbox@support.foo.com", name: "" },
    ]);
    expect(ev.detail.cc).toEqual([{ address: "cc@support.foo.com", name: "" }]);
    expect(ev.detail.spamVerdict).toBe("PASS");
    expect(ev.detail.headers).toEqual({ "x-ses-spam-verdict": "PASS" });
    expect(ev.detail.replyToken).toBeNull();
    expect(ev.detail.autoReply).toBe(false);
    // S3 keeps the full email.
    expect(JSON.parse(parsedObject.body).text).toBe(hugeText);
  });

  it("counts UTF-8 bytes, not characters", async () => {
    // 400k CJK chars: under 1 MB in characters, 1.2 MB in UTF-8 bytes.
    const cjkText = "中".repeat(400_000);
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: "inbox@support.foo.com" }],
        text: cjkText,
      },
    ];

    await runHandler();

    const { maxEventEntryBytes } = await import("./index.ts");
    const ev = await capturedPut();
    expect(cjkText.length).toBeLessThan(maxEventEntryBytes());
    expect(ev.detail.truncated).toBe(true);
    expect(ev.detail.text).toBeNull();
    expect(await entryBytes()).toBeLessThanOrEqual(maxEventEntryBytes());
  });

  it("uses the 256 KB limit in Regions without the 1 MB increase, dropping the largest body field", async () => {
    process.env.AWS_REGION = "mx-central-1";
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: "inbox@support.foo.com" }],
        html: `<p>${"y".repeat(160 * 1024)}</p>`,
        text: "z".repeat(150 * 1024),
      },
    ];

    await runHandler();

    const { maxEventEntryBytes } = await import("./index.ts");
    const ev = await capturedPut();
    expect(maxEventEntryBytes()).toBeLessThan(256 * 1024);
    expect(await entryBytes()).toBeLessThanOrEqual(maxEventEntryBytes());
    expect(ev.detail.truncatedFields).toEqual(["html"]);
    expect(ev.detail.html).toBeNull();
    expect(ev.detail.text).toBe("z".repeat(150 * 1024));
  });

  it("keeps a ~300 KB mail inline in a 1 MB Region", async () => {
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: "inbox@support.foo.com" }],
        html: `<p>${"y".repeat(150 * 1024)}</p>`,
        text: "z".repeat(150 * 1024),
      },
    ];

    await runHandler();

    const ev = await capturedPut();
    expect(ev.detail.truncated).toBeUndefined();
    expect(ev.rawDetail).toBe(capturedParsedObject().body);
  });

  it("throws when PutEvents reports a failed entry, so the Lambda retries", async () => {
    ebMock.reset();
    ebMock.on(PutEventsCommand).resolves({
      FailedEntryCount: 1,
      Entries: [
        {
          ErrorCode: "InternalFailure",
          ErrorMessage: "Internal Service Failure",
        },
      ],
    });
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: "inbox@support.foo.com" }],
      },
    ];

    await expect(runHandler()).rejects.toThrow(INTERNAL_FAILURE);
  });
});

describe("buildEventDetail", () => {
  const base = {
    emailId: "inb_1",
    messageId: "<m@x>",
    receivingDomain: "x.com",
    from: { address: "a@x.com", name: "" },
    to: [{ address: "b@x.com", name: "" }],
    cc: [],
    subject: "s",
    date: "2026-01-01T00:00:00.000Z",
    html: null,
    htmlTruncated: false,
    text: null,
    headers: {},
    attachments: [],
    spamVerdict: null,
    virusVerdict: null,
    rawS3Key: "raw/1",
    receivedAt: "2026-01-01T00:00:00.000Z",
    replyToken: null,
    autoReply: false,
  };

  it("drops attachments after the body fields, keeping their count", async () => {
    const { buildEventDetail } = await import("./index.ts");
    const attachments = Array.from({ length: 2000 }, (_, i) => ({
      id: `att_${i}`,
      filename: `file-${i}-${"n".repeat(100)}.pdf`,
      contentType: "application/pdf",
      size: 1,
      s3Key: `attachments/inb_1/att_${i}-file.pdf`,
      contentDisposition: "attachment",
      cid: null,
    }));
    const { detail, truncatedFields } = buildEventDetail(
      { ...base, text: "t".repeat(1000), attachments },
      "parsed/inb_1.json",
      "wraps.inbound",
      64 * 1024
    );
    const parsed = JSON.parse(detail);
    // html and headers were already empty, so they are not listed.
    expect(truncatedFields).toEqual(["text", "attachments"]);
    expect(parsed.htmlTruncated).toBe(false);
    expect(parsed.attachments).toEqual([]);
    expect(parsed.attachmentCount).toBe(2000);
    expect(parsed.to).toEqual(base.to);
    expect(parsed.parsedS3Key).toBe("parsed/inb_1.json");
  });
});

describe("inbound-processor — envelope fallback", () => {
  it("sends a bounded envelope when an unbounded field like from.name is huge", async () => {
    process.env.AWS_REGION = "eu-west-1";
    parsedState.queue = [
      {
        from: {
          address: "sender@external.com",
          name: "n".repeat(2 * 1024 * 1024),
        },
        to: [{ address: "inbox@support.foo.com" }],
      },
    ];

    await runHandler(singleS3Event("raw/huge-name"));

    const { maxEventEntryBytes, putEventsEntrySize } = await import(
      "./index.ts"
    );
    const ev = await capturedPut();
    expect(
      putEventsEntrySize({
        Source: ev.source ?? "",
        DetailType: ev.detailType ?? "",
        Detail: ev.rawDetail,
      })
    ).toBeLessThanOrEqual(maxEventEntryBytes());
    expect(ev.detail.truncated).toBe(true);
    expect(ev.detail.rawS3Key).toBe("raw/huge-name");
    expect(ev.detail.parsedS3Key).toBe(capturedParsedObject().key);
    expect(ev.detail.from).toBeUndefined();
    expect(ev.detail.replyToken).toBeNull();
    expect((ev.detail.truncatedFields as string[]).at(-1)).toBe("envelope");
  });
});

describe("inbound-processor — retry-stable ids and timestamps", () => {
  const FIXTURE: EmailFixture = {
    from: { address: "sender@external.com" },
    to: [{ address: "inbox@support.foo.com" }],
    headers: [],
  };
  const EMAIL_ID_SHAPE = /^inb_[0-9a-f]{16}$/;
  const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

  // Runs the handler once and returns what it wrote, then clears call history
  // so the next invocation (a simulated retry) is read in isolation.
  async function invokeAndCapture(event: S3Event) {
    parsedState.queue = [{ ...FIXTURE }];
    await runHandler(event);
    const parsedObject = capturedParsedObject();
    const ev = await capturedPut();
    s3Mock.resetHistory();
    ebMock.resetHistory();
    return {
      parsedKey: parsedObject.key,
      parsedBody: JSON.parse(parsedObject.body) as Record<string, unknown>,
      eventDetail: ev.detail,
    };
  }

  it("derives the same emailId and parsed key when the same raw object is retried", async () => {
    const first = await invokeAndCapture(singleS3Event("raw/retry-me"));
    const second = await invokeAndCapture(singleS3Event("raw/retry-me"));

    expect(second.parsedBody.emailId).toBe(first.parsedBody.emailId);
    expect(second.parsedKey).toBe(first.parsedKey);
    expect(first.parsedKey).toBe(`parsed/${first.parsedBody.emailId}.json`);
    expect(second.eventDetail.emailId).toBe(first.eventDetail.emailId);
    expect(first.eventDetail.emailId).toBe(first.parsedBody.emailId);
  });

  it("derives different emailIds for different raw objects", async () => {
    const a = await invokeAndCapture(singleS3Event("raw/one"));
    const b = await invokeAndCapture(singleS3Event("raw/two"));

    expect(a.parsedBody.emailId).not.toBe(b.parsedBody.emailId);
    expect(a.parsedKey).not.toBe(b.parsedKey);
  });

  it("emits an emailId of the form inb_ plus 16 hex chars", async () => {
    const { parsedBody, eventDetail } = await invokeAndCapture(
      singleS3Event("raw/shape")
    );

    expect(parsedBody.emailId).toMatch(EMAIL_ID_SHAPE);
    expect(eventDetail.emailId).toMatch(EMAIL_ID_SHAPE);
  });

  it("uses the S3 record eventTime as receivedAt on every attempt", async () => {
    const eventTime = "2026-01-02T03:04:05.678Z";
    const first = await invokeAndCapture(singleS3Event("raw/timed", eventTime));
    const second = await invokeAndCapture(
      singleS3Event("raw/timed", eventTime)
    );

    expect(first.parsedBody.receivedAt).toBe(eventTime);
    expect(second.parsedBody.receivedAt).toBe(eventTime);
    expect(first.eventDetail.receivedAt).toBe(eventTime);
    expect(second.eventDetail.receivedAt).toBe(eventTime);
  });

  it("normalises a non-canonical eventTime to UTC ISO-8601", async () => {
    const { parsedBody } = await invokeAndCapture(
      singleS3Event("raw/offset", "2026-01-02T04:04:05.678+01:00")
    );

    expect(parsedBody.receivedAt).toBe("2026-01-02T03:04:05.678Z");
  });

  it("falls back to a valid ISO receivedAt when the record has no eventTime", async () => {
    const before = Date.now();
    const { parsedBody } = await invokeAndCapture(singleS3Event("raw/untimed"));
    const after = Date.now();

    const receivedAt = parsedBody.receivedAt as string;
    expect(receivedAt).toMatch(ISO_UTC);
    expect(Date.parse(receivedAt)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(receivedAt)).toBeLessThanOrEqual(after);
  });
});
