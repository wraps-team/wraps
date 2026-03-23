import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Context, S3Event } from "aws-lambda";

type HttpHandlerOptions = {
  requestTimeout: number;
  connectionTimeout: number;
};

type S3GetObjectInput = {
  Bucket: string;
  Key: string;
};

type S3PutObjectInput = {
  Bucket: string;
  Key: string;
  Body: string | Buffer;
  ContentType: string;
};

type EventBridgeEntry = {
  Source: string;
  DetailType: string;
  Detail: string;
};

type PutEventsInput = {
  Entries: EventBridgeEntry[];
};

type AddressValue = {
  address?: string;
  name?: string;
};

type AddressHeader = {
  value: AddressValue[];
};

type ParsedAttachment = {
  filename?: string;
  contentType?: string;
  size: number;
  content: Buffer;
  contentDisposition?: string;
  cid?: string | null;
};

type ParsedMailLike = {
  headers?: Map<string, unknown>;
  attachments?: ParsedAttachment[];
  html?: string | false;
  to?: AddressHeader | AddressHeader[];
  from?: AddressHeader;
  cc?: AddressHeader | AddressHeader[];
  subject?: string;
  date?: Date;
  text?: string;
  messageId?: string;
};

type StoredAttachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  s3Key: string;
  contentDisposition: string;
  cid: string | null;
};

type StoredEmail = {
  emailId: string;
  messageId: string;
  receivingDomain: string | null;
  from: { address: string; name: string };
  to: Array<{ address: string; name: string }>;
  cc: Array<{ address: string; name: string }>;
  subject: string;
  date: string;
  html: string | null;
  htmlTruncated: boolean;
  text: string | null;
  headers: Record<string, unknown>;
  attachments: StoredAttachment[];
  spamVerdict: unknown;
  virusVerdict: unknown;
  rawS3Key: string;
  receivedAt: string;
};

type TransformableBody = {
  transformToString: () => Promise<string>;
};

type GetObjectResponse = {
  Body?: TransformableBody;
};

type AsyncCommandHandler = (command: unknown) => Promise<unknown>;
type ParseHandler = (raw: string | undefined) => Promise<ParsedMailLike>;

const createdHttpHandlers: Array<{ options: HttpHandlerOptions }> = [];
const createdS3Configs: Array<Record<string, unknown>> = [];
const createdEventBridgeConfigs: Array<Record<string, unknown>> = [];

const s3SendMock = vi.fn<AsyncCommandHandler>();
const eventBridgeSendMock = vi.fn<AsyncCommandHandler>();
const simpleParserMock = vi.fn<ParseHandler>();
const randomUUIDMock = vi.fn<() => string>();

class MockNodeHttpHandler {
  constructor(public options: HttpHandlerOptions) {
    createdHttpHandlers.push(this);
  }
}

class MockS3Client {
  send = s3SendMock;

  constructor(config: Record<string, unknown>) {
    createdS3Configs.push(config);
  }
}

class MockEventBridgeClient {
  send = eventBridgeSendMock;

  constructor(config: Record<string, unknown>) {
    createdEventBridgeConfigs.push(config);
  }
}

class MockGetObjectCommand {
  constructor(public input: S3GetObjectInput) {}
}

class MockPutObjectCommand {
  constructor(public input: S3PutObjectInput) {}
}

class MockPutEventsCommand {
  constructor(public input: PutEventsInput) {}
}

vi.mock("node:crypto", () => ({
  randomUUID: () => randomUUIDMock(),
}));

vi.mock("@smithy/node-http-handler", () => ({
  NodeHttpHandler: MockNodeHttpHandler,
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: MockS3Client,
  GetObjectCommand: MockGetObjectCommand,
  PutObjectCommand: MockPutObjectCommand,
}));

vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: MockEventBridgeClient,
  PutEventsCommand: MockPutEventsCommand,
}));

vi.mock("mailparser", () => ({
  simpleParser: (raw: string | undefined) => simpleParserMock(raw),
}));

function makeEvent(key = "raw%2Fmessage+1"): S3Event {
  return {
    Records: [
      {
        s3: {
          bucket: { name: "raw-bucket" },
          object: { key },
        },
      },
    ],
  } as unknown as S3Event;
}

function makeContext(): Context {
  return {
    awsRequestId: "req-123",
  } as unknown as Context;
}

function getGetObjectCommand(): MockGetObjectCommand {
  const command = s3SendMock.mock.calls[0]?.[0];
  if (!(command instanceof MockGetObjectCommand)) {
    throw new Error("Expected first S3 command to be GetObjectCommand");
  }
  return command;
}

function getPutObjectCommand(index: number): MockPutObjectCommand {
  const command = s3SendMock.mock.calls[index]?.[0];
  if (!(command instanceof MockPutObjectCommand)) {
    throw new Error(`Expected S3 command ${index} to be PutObjectCommand`);
  }
  return command;
}

function getPutEventsCommand(): MockPutEventsCommand {
  const command = eventBridgeSendMock.mock.calls[0]?.[0];
  if (!(command instanceof MockPutEventsCommand)) {
    throw new Error("Expected EventBridge command to be PutEventsCommand");
  }
  return command;
}

function parseStoredEmail(command: MockPutObjectCommand): StoredEmail {
  if (typeof command.input.Body !== "string") {
    throw new Error("Expected parsed email body to be a JSON string");
  }
  return JSON.parse(command.input.Body) as StoredEmail;
}

async function loadInboundProcessor() {
  vi.resetModules();
  process.env.BUCKET_NAME = "parsed-bucket";
  process.env.INBOUND_EVENT_SOURCE = "wraps.test";
  return import("../lambda/inbound-processor/index.ts");
}

describe("inbound processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-23T10:00:00.000Z"));
    createdHttpHandlers.length = 0;
    createdS3Configs.length = 0;
    createdEventBridgeConfigs.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.BUCKET_NAME;
    delete process.env.INBOUND_EVENT_SOURCE;
  });

  it("configures AWS clients with explicit retries and HTTP timeouts", async () => {
    await loadInboundProcessor();

    expect(createdHttpHandlers).toHaveLength(1);
    expect(createdHttpHandlers[0]?.options).toEqual({
      requestTimeout: 10_000,
      connectionTimeout: 5000,
    });

    expect(createdS3Configs).toHaveLength(1);
    expect(createdEventBridgeConfigs).toHaveLength(1);
    expect(createdS3Configs[0]).toMatchObject({
      requestHandler: createdHttpHandlers[0],
      maxAttempts: 5,
    });
    expect(createdEventBridgeConfigs[0]).toMatchObject({
      requestHandler: createdHttpHandlers[0],
      maxAttempts: 5,
    });
  });

  it("stores parsed emails, sanitizes attachment keys, and publishes the inbound event", async () => {
    randomUUIDMock
      .mockReturnValueOnce("batch-id-0000")
      .mockReturnValueOnce("12345678-90ab-cdef-1234-567890abcdef");

    const rawMessage: GetObjectResponse = {
      Body: {
        transformToString: async () => "raw mime message",
      },
    };

    s3SendMock
      .mockResolvedValueOnce(rawMessage)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    eventBridgeSendMock.mockResolvedValueOnce({});

    simpleParserMock.mockResolvedValueOnce({
      headers: new Map<string, unknown>([
        ["x-ses-spam-verdict", "PASS"],
        ["x-ses-virus-verdict", "PASS"],
        ["list", { unsubscribe: { url: "https://example.com/unsubscribe" } }],
      ]),
      attachments: [
        {
          filename: "../bad file?.pdf",
          contentType: "application/pdf",
          size: 4,
          content: Buffer.from("test"),
          contentDisposition: "attachment",
          cid: "<cid-1>",
        },
      ],
      html: "x".repeat(200 * 1024 + 25),
      to: {
        value: [{ address: "reply@inbound.wraps.dev", name: "Reply" }],
      },
      from: {
        value: [{ address: "sender@example.com", name: "Sender" }],
      },
      cc: {
        value: [{ address: "cc@example.com", name: "CC" }],
      },
      subject: "Hello inbound",
      date: new Date("2026-03-20T09:00:00.000Z"),
      text: "Hello text",
      messageId: "<message-id@example.com>",
    });

    const { handler } = await loadInboundProcessor();
    const result = await handler(makeEvent(), makeContext());

    expect(result.statusCode).toBe(200);
    expect(s3SendMock).toHaveBeenCalledTimes(3);
    expect(eventBridgeSendMock).toHaveBeenCalledTimes(1);

    expect(getGetObjectCommand().input).toEqual({
      Bucket: "raw-bucket",
      Key: "raw/message 1",
    });

    const attachmentCommand = getPutObjectCommand(1);
    expect(attachmentCommand.input).toEqual({
      Bucket: "parsed-bucket",
      Key: "attachments/inb_1234567890ab/att_0-.._bad_file_.pdf",
      Body: Buffer.from("test"),
      ContentType: "application/pdf",
    });

    const parsedEmailCommand = getPutObjectCommand(2);
    expect(parsedEmailCommand.input.Key).toBe("parsed/inb_1234567890ab.json");
    expect(parsedEmailCommand.input.ContentType).toBe("application/json");

    const parsedEmail = parseStoredEmail(parsedEmailCommand);
    expect(parsedEmail).toMatchObject({
      emailId: "inb_1234567890ab",
      messageId: "<message-id@example.com>",
      receivingDomain: "inbound.wraps.dev",
      from: { address: "sender@example.com", name: "Sender" },
      to: [{ address: "reply@inbound.wraps.dev", name: "Reply" }],
      cc: [{ address: "cc@example.com", name: "CC" }],
      subject: "Hello inbound",
      date: "2026-03-20T09:00:00.000Z",
      htmlTruncated: true,
      text: "Hello text",
      spamVerdict: "PASS",
      virusVerdict: "PASS",
      rawS3Key: "raw/message 1",
      receivedAt: "2026-03-23T10:00:00.000Z",
    });
    expect(parsedEmail.html).toHaveLength(200 * 1024);
    expect(parsedEmail.headers.list).toEqual({
      unsubscribe: { url: "https://example.com/unsubscribe" },
    });
    expect(parsedEmail.attachments).toEqual([
      {
        id: "att_0",
        filename: "../bad file?.pdf",
        contentType: "application/pdf",
        size: 4,
        s3Key: "attachments/inb_1234567890ab/att_0-.._bad_file_.pdf",
        contentDisposition: "attachment",
        cid: "<cid-1>",
      },
    ]);

    const eventCommand = getPutEventsCommand();
    expect(eventCommand.input.Entries).toHaveLength(1);
    expect(eventCommand.input.Entries[0]).toEqual({
      Source: "wraps.test",
      DetailType: "email.received",
      Detail: JSON.stringify(parsedEmail),
    });
  });

  it("rethrows parsing failures to trigger Lambda retries", async () => {
    randomUUIDMock.mockReturnValueOnce("batch-id-0000");
    s3SendMock.mockResolvedValueOnce({
      Body: {
        transformToString: async () => "raw mime message",
      },
    });
    simpleParserMock.mockRejectedValueOnce(new Error("parse failed"));

    const { handler } = await loadInboundProcessor();

    await expect(handler(makeEvent(), makeContext())).rejects.toThrow(
      "parse failed"
    );
    expect(s3SendMock).toHaveBeenCalledTimes(1);
    expect(eventBridgeSendMock).not.toHaveBeenCalled();
  });
});
