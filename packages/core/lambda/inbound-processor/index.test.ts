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
import type { Context, S3Event, SESEvent } from "aws-lambda";
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

async function runHandler(event: S3Event | SESEvent = singleS3Event()) {
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

function sesEvent(opts: {
  messageId?: string;
  timestamp?: string;
  recipients?: string[];
}): SESEvent {
  return {
    Records: [
      {
        eventSource: "aws:ses",
        eventVersion: "1.0",
        ses: {
          mail: { messageId: opts.messageId ?? "abc123" },
          receipt: {
            timestamp: opts.timestamp ?? "2026-03-04T05:06:07.890Z",
            recipients: opts.recipients ?? ["inbox@support.foo.com"],
          },
        },
      },
    ],
  } as unknown as SESEvent;
}

describe("inbound-processor — SES Lambda action event", () => {
  it("reads the raw object under mail/, takes receivedAt from the receipt and lowercases envelopeRecipients", async () => {
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: "inbox@support.foo.com" }],
      },
    ];

    await runHandler(
      sesEvent({
        messageId: "msg42",
        timestamp: "2026-03-04T05:06:07.890Z",
        recipients: ["Inbox@Support.Foo.com", "other@support.foo.com"],
      })
    );

    const get = s3Mock.commandCalls(GetObjectCommand)[0].args[0].input;
    expect(get).toEqual({ Bucket: PARSED_BUCKET, Key: "mail/msg42" });
    const parsed = JSON.parse(capturedParsedObject().body);
    const ev = await capturedPut();
    for (const doc of [parsed, ev.detail]) {
      expect(doc.rawS3Key).toBe("mail/msg42");
      expect(doc.receivedAt).toBe("2026-03-04T05:06:07.890Z");
      expect(doc.envelopeRecipients).toEqual([
        "inbox@support.foo.com",
        "other@support.foo.com",
      ]);
    }
  });

  it("derives the same emailId when the same SES record is retried", async () => {
    const ids: unknown[] = [];
    for (let i = 0; i < 2; i++) {
      parsedState.queue = [{ from: { address: "a@external.com" } }];
      await runHandler(sesEvent({ messageId: "same" }));
      ids.push(JSON.parse(capturedParsedObject().body).emailId);
      s3Mock.resetHistory();
    }
    expect(ids[1]).toBe(ids[0]);
  });

  it("sets receivingDomain from the envelope when the address is in no header (Bcc)", async () => {
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: "someone@elsewhere.com" }],
      },
    ];

    await runHandler(sesEvent({ recipients: ["Bcc@Support.Foo.com"] }));

    const ev = await capturedPut();
    expect(ev.detail.receivingDomain).toBe("support.foo.com");
  });

  it("finds the reply token through the envelope when no header names it", async () => {
    const secret = Buffer.alloc(32, 0x5a);
    process.env.REPLY_SECRET_PARAMETER_PREFIX = "/wraps/email/reply-secret/";
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Value: JSON.stringify({ kid: 1, current: secret.toString("base64") }),
      },
    });
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
        to: [{ address: "list@elsewhere.com" }],
        headers: [],
      },
    ];

    await runHandler(
      sesEvent({
        recipients: [`${token}@r.mail.support.foo.com`],
      })
    );

    const ev = await capturedPut();
    expect((ev.detail.replyToken as { status: string }).status).toBe("valid");
    expect(ev.detail.receivingDomain).toBe("r.mail.support.foo.com");
  });

  it("decodes a reply token from the envelope with its case preserved", async () => {
    const secret = Buffer.alloc(32, 0x5a);
    process.env.REPLY_SECRET_PARAMETER_PREFIX = "/wraps/email/reply-secret/";
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Value: JSON.stringify({ kid: 1, current: secret.toString("base64") }),
      },
    });
    const token = encodeReplyToken({
      kid: 1,
      convId: Buffer.alloc(8, 0x77),
      sendId: Buffer.alloc(8, 0x88),
      exp: 0,
      secret,
    });
    expect(token).not.toBe(token.toLowerCase());
    parsedState.queue = [{ from: { address: "s@external.com" }, headers: [] }];

    await runHandler(
      sesEvent({
        recipients: [`${token}@R.Mail.Support.Foo.com`],
      })
    );

    const ev = await capturedPut();
    expect((ev.detail.replyToken as { status: string }).status).toBe("valid");
    expect(ev.detail.envelopeRecipients).toEqual([
      `${token.toLowerCase()}@r.mail.support.foo.com`,
    ]);
  });

  it("lets the envelope win the reply-token lookup over a header naming another r.mail.* address", async () => {
    const secret = Buffer.alloc(32, 0x5a);
    process.env.REPLY_SECRET_PARAMETER_PREFIX = "/wraps/email/reply-secret/";
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Value: JSON.stringify({ kid: 1, current: secret.toString("base64") }),
      },
    });
    const envToken = encodeReplyToken({
      kid: 1,
      convId: Buffer.alloc(8, 0x01),
      sendId: Buffer.alloc(8, 0x02),
      exp: 0,
      secret,
    });
    const headerToken = encodeReplyToken({
      kid: 1,
      convId: Buffer.alloc(8, 0x03),
      sendId: Buffer.alloc(8, 0x04),
      exp: 0,
      secret,
    });
    parsedState.queue = [
      {
        from: { address: "s@external.com" },
        to: [{ address: `${headerToken}@r.mail.other.example.com` }],
        headers: [["x-original-to", `${headerToken}@r.mail.other.example.com`]],
      },
    ];

    await runHandler(
      sesEvent({ recipients: [`${envToken}@r.mail.support.foo.com`] })
    );

    const ev = await capturedPut();
    const rt = ev.detail.replyToken as { status: string; sendId: string };
    expect(rt.status).toBe("valid");
    expect(ev.detail.receivingDomain).toBe("r.mail.support.foo.com");
    // Only the envelope's sending domain was looked up.
    const names = ssmMock
      .commandCalls(GetParameterCommand)
      .map((c) => c.args[0].input.Name);
    expect(names).toHaveLength(1);
    expect(names[0]).toContain("support.foo.com");
    expect(names[0]).not.toContain("other.example.com");
  });

  it("strips the mail/ prefix in the messageId fallback", async () => {
    const { handler } = await import("./index.ts");
    parsedState.queue = [{ from: { address: "a@external.com" } }];
    const { simpleParser } = await import("mailparser");
    vi.mocked(simpleParser).mockResolvedValueOnce({
      ...parseFromFixture({ from: { address: "a@external.com" } }),
      messageId: undefined,
    } as never);
    await handler(sesEvent({ messageId: "fallback1" }), makeCtx());
    expect(JSON.parse(capturedParsedObject().body).messageId).toBe("fallback1");
  });

  it("logs 'raw object not readable' with bucket and key, then rethrows", async () => {
    s3Mock.on(GetObjectCommand).rejects(new Error("AccessDenied"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(runHandler(sesEvent({ messageId: "gone" }))).rejects.toThrow(
        "AccessDenied"
      );
      const lines = errSpy.mock.calls.map((c) => String(c[0]));
      const line = lines.find((l) => l.includes("raw object not readable"));
      expect(line).toContain(PARSED_BUCKET);
      expect(line).toContain("mail/gone");
      expect(s3Mock.commandCalls(GetObjectCommand).length).toBe(1);
    } finally {
      errSpy.mockRestore();
    }
  });
});

describe("inbound-processor — S3 event after the SES Lambda action change", () => {
  it("leaves S3 records unchanged and without envelopeRecipients", async () => {
    parsedState.queue = [
      {
        from: { address: "sender@external.com" },
        to: [{ address: "inbox@support.foo.com" }],
      },
    ];

    await runHandler(singleS3Event("raw/legacy1", "2026-01-02T03:04:05.678Z"));

    const parsed = JSON.parse(capturedParsedObject().body);
    expect(parsed.rawS3Key).toBe("raw/legacy1");
    expect(parsed.receivedAt).toBe("2026-01-02T03:04:05.678Z");
    expect("envelopeRecipients" in parsed).toBe(false);
    const ev = await capturedPut();
    expect("envelopeRecipients" in ev.detail).toBe(false);
    expect(ev.detail.receivingDomain).toBe("support.foo.com");
  });

  it("skips the AMAZON_SES_SETUP_NOTIFICATION key and keeps going", async () => {
    parsedState.queue = [{ from: { address: "a@external.com" } }];

    await runHandler(
      multiS3Event(["raw/AMAZON_SES_SETUP_NOTIFICATION", "raw/real"])
    );

    const keys = s3Mock
      .commandCalls(GetObjectCommand)
      .map((c) => c.args[0].input.Key);
    expect(keys).toEqual(["raw/real"]);
    expect(ebMock.commandCalls(PutEventsCommand).length).toBe(1);
  });

  it("logs and rethrows a malformed record instead of throwing outside the try", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(
        runHandler({ Records: [{}] } as unknown as S3Event)
      ).rejects.toThrow();
      expect(
        errSpy.mock.calls.some((c) =>
          String(c[0]).includes("Error processing inbound email")
        )
      ).toBe(true);
    } finally {
      errSpy.mockRestore();
    }
  });

  it("strips the raw/ prefix in the messageId fallback", async () => {
    const { simpleParser } = await import("mailparser");
    vi.mocked(simpleParser).mockResolvedValueOnce({
      ...parseFromFixture({ from: { address: "a@external.com" } }),
      messageId: undefined,
    } as never);
    await runHandler(singleS3Event("raw/legacy2"));
    expect(JSON.parse(capturedParsedObject().body).messageId).toBe("legacy2");
  });
});

describe("buildEventDetail — envelopeRecipients", () => {
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
    rawS3Key: "mail/1",
    receivedAt: "2026-01-01T00:00:00.000Z",
    replyToken: null,
    autoReply: false,
  };
  const addrs = (n: number) =>
    Array.from({ length: n }, (_, i) => `user${i}@x.com`);

  it("keeps the field whole at every trim stage, including the last resort", async () => {
    const { buildEventDetail } = await import("./index.ts");
    const envelopeRecipients = addrs(3);
    // Stage 1: text dropped.
    const textStage = buildEventDetail(
      { ...base, envelopeRecipients, text: "t".repeat(5000) },
      "parsed/inb_1.json",
      "wraps.inbound",
      2000
    );
    expect(textStage.truncatedFields).toEqual(["text"]);
    expect(JSON.parse(textStage.detail).envelopeRecipients).toEqual(
      envelopeRecipients
    );
    // Stage 3: to/cc dropped.
    const toStage = buildEventDetail(
      {
        ...base,
        envelopeRecipients,
        to: Array.from({ length: 500 }, (_, i) => ({
          address: `to${i}@x.com`,
          name: "",
        })),
      },
      "parsed/inb_1.json",
      "wraps.inbound",
      4000
    );
    expect(toStage.truncatedFields).toEqual(["attachments", "recipients"]);
    expect(JSON.parse(toStage.detail).envelopeRecipients).toEqual(
      envelopeRecipients
    );
    // Last resort: unbounded from.name.
    const last = buildEventDetail(
      {
        ...base,
        envelopeRecipients,
        from: { address: "a@x.com", name: "n".repeat(10_000) },
      },
      "parsed/inb_1.json",
      "wraps.inbound",
      4000
    );
    const parsed = JSON.parse(last.detail);
    expect(last.truncatedFields.at(-1)).toBe("envelope");
    expect(last.truncatedFields).not.toContain("envelopeRecipients");
    expect(parsed.envelopeRecipients).toEqual(envelopeRecipients);
    expect(parsed.envelopeRecipientCount).toBeUndefined();
  });

  it("cuts to the first 100 addresses at the last resort and says so", async () => {
    const { buildEventDetail } = await import("./index.ts");
    const envelopeRecipients = addrs(150);
    const { detail, truncatedFields } = buildEventDetail(
      {
        ...base,
        envelopeRecipients,
        from: { address: "a@x.com", name: "n".repeat(20_000) },
      },
      "parsed/inb_1.json",
      "wraps.inbound",
      8000
    );
    const parsed = JSON.parse(detail);
    expect(parsed.envelopeRecipients).toEqual(envelopeRecipients.slice(0, 100));
    expect(parsed.envelopeRecipientCount).toBe(150);
    expect(truncatedFields).toEqual(
      expect.arrayContaining(["envelope", "envelopeRecipients"])
    );
    expect(parsed.truncatedFields).toEqual(truncatedFields);
    expect(parsed.truncated).toBe(true);
  });

  it("keeps exactly 100 addresses at the last resort: no cut, no count, no label", async () => {
    const { buildEventDetail } = await import("./index.ts");
    const envelopeRecipients = addrs(100);
    const { detail, truncatedFields } = buildEventDetail(
      {
        ...base,
        envelopeRecipients,
        from: { address: "a@x.com", name: "n".repeat(20_000) },
      },
      "parsed/inb_1.json",
      "wraps.inbound",
      8000
    );
    const parsed = JSON.parse(detail);
    expect(truncatedFields.at(-1)).toBe("envelope");
    expect(truncatedFields).not.toContain("envelopeRecipients");
    expect(parsed.envelopeRecipients).toEqual(envelopeRecipients);
    expect(parsed.envelopeRecipientCount).toBeUndefined();
  });

  it("omits the field when the email has none", async () => {
    const { buildEventDetail } = await import("./index.ts");
    const { detail } = buildEventDetail(
      { ...base, from: { address: "a@x.com", name: "n".repeat(20_000) } },
      "parsed/inb_1.json",
      "wraps.inbound",
      4000
    );
    expect("envelopeRecipients" in JSON.parse(detail)).toBe(false);
  });
});
