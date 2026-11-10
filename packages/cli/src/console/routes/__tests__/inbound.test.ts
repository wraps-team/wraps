import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();

vi.mock("@aws-sdk/client-s3", () => {
  class ListObjectsV2Command {
    input: unknown;
    kind = "list";
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class GetObjectCommand {
    input: unknown;
    kind = "get";
    constructor(input: unknown) {
      this.input = input;
    }
  }
  class S3Client {
    send = send;
  }
  return { GetObjectCommand, ListObjectsV2Command, S3Client };
});

import { createInboundRouter } from "../inbound.js";

type Handler = (req: unknown, res: unknown) => Promise<unknown>;

function listHandler(): Handler {
  const router = createInboundRouter({
    region: "us-east-1",
    inboundBucketName: "bucket",
  } as never);
  const layer = (
    router as unknown as {
      stack: Array<{
        route?: { path: string; stack: Array<{ handle: Handler }> };
      }>;
    }
  ).stack.find((l) => l.route?.path === "/");
  if (!layer?.route) {
    throw new Error("list route not found");
  }
  return layer.route.stack[0].handle;
}

function body(data: Record<string, unknown>) {
  return { Body: { transformToString: async () => JSON.stringify(data) } };
}

const BASE = {
  from: { address: "a@example.com", name: "" },
  to: [{ address: "b@example.com", name: "" }],
  subject: "s",
  receivedAt: "2026-10-01T00:00:00.000Z",
  attachments: [],
  spamVerdict: "PASS",
  virusVerdict: "PASS",
};

describe("console inbound list route", () => {
  beforeEach(() => {
    send.mockReset();
  });

  it("copies envelopeRecipients when stored and leaves it out for legacy mail", async () => {
    send
      .mockResolvedValueOnce({
        Contents: [{ Key: "parsed/e1.json" }, { Key: "parsed/e2.json" }],
      })
      .mockResolvedValueOnce(
        body({
          ...BASE,
          emailId: "e1",
          envelopeRecipients: ["b@example.com", "bcc@example.com"],
        })
      )
      .mockResolvedValueOnce(body({ ...BASE, emailId: "e2" }));

    let payload: { emails: Array<Record<string, unknown>> } | undefined;
    const res = {
      json: (value: typeof payload) => {
        payload = value;
      },
      status: () => res,
    };
    await listHandler()({ query: {} }, res);

    const emails = payload?.emails ?? [];
    expect(emails[0].envelopeRecipients).toEqual([
      "b@example.com",
      "bcc@example.com",
    ]);
    // JSON.stringify drops undefined, so the key is absent on the wire.
    expect(JSON.parse(JSON.stringify(emails[1]))).not.toHaveProperty(
      "envelopeRecipients"
    );
  });
});
