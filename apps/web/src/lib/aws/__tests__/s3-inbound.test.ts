import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB module
const mockFindFirst = vi.fn();
vi.mock("@wraps/db", () => ({
  db: {
    query: {
      awsAccount: {
        findFirst: (...args: unknown[]) => mockFindFirst(...args),
      },
    },
  },
}));

// Mock the credential cache
const mockGetOrAssumeRole = vi.fn();
vi.mock("../credential-cache", () => ({
  getOrAssumeRole: (...args: unknown[]) => mockGetOrAssumeRole(...args),
}));

// Mock the S3 client
const mockS3Send = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn(function (this: { send: typeof mockS3Send }) {
    this.send = mockS3Send;
  }),
  ListObjectsV2Command: vi.fn(function (
    this: { input: unknown },
    input: unknown
  ) {
    this.input = input;
  }),
  GetObjectCommand: vi.fn(function (this: { input: unknown }, input: unknown) {
    this.input = input;
  }),
}));

// Import after mocks are set up
import { getInboundEmail, listInboundEmails } from "../s3-inbound";

const MOCK_ACCOUNT = {
  id: "acc-1",
  roleArn: "arn:aws:iam::123456789012:role/wraps",
  externalId: "ext-123",
  region: "us-east-1",
  features: {
    email: {
      inboundBucketName: "my-inbound-bucket",
    },
  },
};

const MOCK_CREDENTIALS = {
  accessKeyId: "AKIA_TEST",
  secretAccessKey: "secret-test",
  sessionToken: "session-test",
};

function makeParsedEmailJson(overrides: Record<string, unknown> = {}) {
  return {
    emailId: "email-001",
    messageId: "<msg@example.com>",
    from: { address: "sender@example.com", name: "Sender" },
    to: [{ address: "recipient@example.com", name: "Recipient" }],
    cc: [],
    subject: "Test Subject",
    date: "2025-01-15T10:00:00Z",
    html: "<p>Hello</p>",
    htmlTruncated: false,
    text: "Hello",
    headers: {},
    attachments: [
      {
        id: "att-1",
        filename: "doc.pdf",
        contentType: "application/pdf",
        size: 1024,
        s3Key: "attachments/email-001/att-1-doc.pdf",
      },
    ],
    spamVerdict: "PASS",
    virusVerdict: "PASS",
    rawS3Key: "raw/abc123",
    receivedAt: "2025-01-15T10:00:00Z",
    ...overrides,
  };
}

function mockS3Body(data: unknown) {
  return {
    Body: {
      transformToString: () => Promise.resolve(JSON.stringify(data)),
    },
  };
}

describe("s3-inbound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrAssumeRole.mockResolvedValue(MOCK_CREDENTIALS);
  });

  describe("listInboundEmails", () => {
    it("should throw when account is not found", async () => {
      mockFindFirst.mockResolvedValue(null);

      await expect(
        listInboundEmails({ awsAccountId: "nonexistent" })
      ).rejects.toThrow("AWS account not found");
    });

    it("should return empty when account has no inbound bucket", async () => {
      mockFindFirst.mockResolvedValue({
        ...MOCK_ACCOUNT,
        features: { email: {} },
      });

      const result = await listInboundEmails({ awsAccountId: "acc-1" });
      expect(result.emails).toEqual([]);
    });

    it("should list and parse emails from S3", async () => {
      mockFindFirst.mockResolvedValue(MOCK_ACCOUNT);

      const email1 = makeParsedEmailJson({
        emailId: "email-001",
        subject: "First",
      });
      const email2 = makeParsedEmailJson({
        emailId: "email-002",
        subject: "Second",
        attachments: [],
      });

      // ListObjectsV2 response
      mockS3Send.mockResolvedValueOnce({
        Contents: [
          { Key: "parsed/email-001.json", LastModified: new Date(), Size: 500 },
          { Key: "parsed/email-002.json", LastModified: new Date(), Size: 300 },
        ],
        NextContinuationToken: "next-token-abc",
      });

      // GetObject for each email
      mockS3Send
        .mockResolvedValueOnce(mockS3Body(email1))
        .mockResolvedValueOnce(mockS3Body(email2));

      const result = await listInboundEmails({
        awsAccountId: "acc-1",
        limit: 10,
      });

      expect(result.emails).toHaveLength(2);
      expect(result.emails[0].emailId).toBe("email-001");
      expect(result.emails[0].subject).toBe("First");
      expect(result.emails[0].hasAttachments).toBe(true);
      expect(result.emails[0].attachmentCount).toBe(1);
      expect(result.emails[1].emailId).toBe("email-002");
      expect(result.emails[1].hasAttachments).toBe(false);
      expect(result.emails[1].attachmentCount).toBe(0);
      expect(result.nextToken).toBe("next-token-abc");
    });

    it("should carry envelopeRecipients when stored and leave it undefined when absent", async () => {
      mockFindFirst.mockResolvedValue(MOCK_ACCOUNT);

      mockS3Send.mockResolvedValueOnce({
        Contents: [
          { Key: "parsed/email-001.json", LastModified: new Date(), Size: 500 },
          { Key: "parsed/email-002.json", LastModified: new Date(), Size: 300 },
        ],
      });
      mockS3Send
        .mockResolvedValueOnce(
          mockS3Body(
            makeParsedEmailJson({
              emailId: "email-001",
              envelopeRecipients: ["a@example.com", "bcc@example.com"],
            })
          )
        )
        .mockResolvedValueOnce(
          mockS3Body(makeParsedEmailJson({ emailId: "email-002" }))
        );

      const result = await listInboundEmails({
        awsAccountId: "acc-1",
        limit: 10,
      });

      expect(result.emails[0].envelopeRecipients).toEqual([
        "a@example.com",
        "bcc@example.com",
      ]);
      expect(result.emails[1].envelopeRecipients).toBeUndefined();
    });

    it("should filter out non-JSON files from S3 listing", async () => {
      mockFindFirst.mockResolvedValue(MOCK_ACCOUNT);

      mockS3Send.mockResolvedValueOnce({
        Contents: [
          { Key: "parsed/email-001.json", LastModified: new Date(), Size: 500 },
          { Key: "parsed/.DS_Store", LastModified: new Date(), Size: 10 },
          {
            Key: "parsed/email-002.json.bak",
            LastModified: new Date(),
            Size: 100,
          },
        ],
      });

      const email1 = makeParsedEmailJson();
      mockS3Send.mockResolvedValueOnce(mockS3Body(email1));

      const result = await listInboundEmails({ awsAccountId: "acc-1" });

      // Only the .json file should be fetched
      expect(result.emails).toHaveLength(1);
      // ListObjectsV2 + 1 GetObject (not 3)
      expect(mockS3Send).toHaveBeenCalledTimes(2);
    });

    it("should skip individual emails that fail to parse", async () => {
      mockFindFirst.mockResolvedValue(MOCK_ACCOUNT);

      mockS3Send.mockResolvedValueOnce({
        Contents: [
          {
            Key: "parsed/email-good.json",
            LastModified: new Date(),
            Size: 500,
          },
          { Key: "parsed/email-bad.json", LastModified: new Date(), Size: 500 },
        ],
      });

      const goodEmail = makeParsedEmailJson({ emailId: "email-good" });
      mockS3Send
        .mockResolvedValueOnce(mockS3Body(goodEmail))
        .mockRejectedValueOnce(new Error("S3 read error"));

      const result = await listInboundEmails({ awsAccountId: "acc-1" });

      // Only the successful email should be in results
      expect(result.emails).toHaveLength(1);
      expect(result.emails[0].emailId).toBe("email-good");
    });

    it("should return empty for NoSuchBucket errors", async () => {
      mockFindFirst.mockResolvedValue(MOCK_ACCOUNT);

      const error = new Error("NoSuchBucket");
      error.name = "NoSuchBucket";
      mockS3Send.mockRejectedValueOnce(error);

      const result = await listInboundEmails({ awsAccountId: "acc-1" });
      expect(result.emails).toEqual([]);
    });

    it("should pass limit and continuationToken to S3", async () => {
      mockFindFirst.mockResolvedValue(MOCK_ACCOUNT);

      mockS3Send.mockResolvedValueOnce({ Contents: [] });

      await listInboundEmails({
        awsAccountId: "acc-1",
        limit: 25,
        continuationToken: "token-xyz",
      });

      const listCommand = mockS3Send.mock.calls[0][0];
      expect(listCommand.input.MaxKeys).toBe(25);
      expect(listCommand.input.ContinuationToken).toBe("token-xyz");
      expect(listCommand.input.Prefix).toBe("parsed/");
    });
  });

  describe("getInboundEmail", () => {
    it("should throw when account is not found", async () => {
      mockFindFirst.mockResolvedValue(null);

      await expect(
        getInboundEmail({ awsAccountId: "nonexistent", emailId: "email-001" })
      ).rejects.toThrow("AWS account not found");
    });

    it("should return null when account has no inbound bucket", async () => {
      mockFindFirst.mockResolvedValue({
        ...MOCK_ACCOUNT,
        features: { email: {} },
      });

      const result = await getInboundEmail({
        awsAccountId: "acc-1",
        emailId: "email-001",
      });
      expect(result).toBeNull();
    });

    it("should fetch and return parsed email", async () => {
      mockFindFirst.mockResolvedValue(MOCK_ACCOUNT);

      const email = makeParsedEmailJson({ emailId: "email-001" });
      mockS3Send.mockResolvedValueOnce(mockS3Body(email));

      const result = await getInboundEmail({
        awsAccountId: "acc-1",
        emailId: "email-001",
      });

      expect(result).not.toBeNull();
      expect(result?.emailId).toBe("email-001");
      expect(result?.subject).toBe("Test Subject");
      expect(result?.from.address).toBe("sender@example.com");
      expect(result?.attachments).toHaveLength(1);

      // Verify it fetched the correct key
      const getCommand = mockS3Send.mock.calls[0][0];
      expect(getCommand.input.Key).toBe("parsed/email-001.json");
      expect(getCommand.input.Bucket).toBe("my-inbound-bucket");
    });

    it("should return envelopeRecipients on the detail when stored", async () => {
      mockFindFirst.mockResolvedValue(MOCK_ACCOUNT);
      mockS3Send.mockResolvedValueOnce(
        mockS3Body(
          makeParsedEmailJson({ envelopeRecipients: ["bcc@example.com"] })
        )
      );

      const result = await getInboundEmail({
        awsAccountId: "acc-1",
        emailId: "email-001",
      });

      expect(result?.envelopeRecipients).toEqual(["bcc@example.com"]);
    });

    it("should return null for NoSuchKey errors", async () => {
      mockFindFirst.mockResolvedValue(MOCK_ACCOUNT);

      const error = new Error("NoSuchKey") as Error & { name: string };
      error.name = "NoSuchKey";
      mockS3Send.mockRejectedValueOnce(error);

      const result = await getInboundEmail({
        awsAccountId: "acc-1",
        emailId: "nonexistent-email",
      });
      expect(result).toBeNull();
    });

    it("should rethrow non-NoSuchKey errors", async () => {
      mockFindFirst.mockResolvedValue(MOCK_ACCOUNT);

      const error = new Error("Access Denied");
      error.name = "AccessDenied";
      mockS3Send.mockRejectedValueOnce(error);

      await expect(
        getInboundEmail({ awsAccountId: "acc-1", emailId: "email-001" })
      ).rejects.toThrow("Access Denied");
    });

    it("should assume role with correct parameters", async () => {
      mockFindFirst.mockResolvedValue(MOCK_ACCOUNT);

      const email = makeParsedEmailJson();
      mockS3Send.mockResolvedValueOnce(mockS3Body(email));

      await getInboundEmail({
        awsAccountId: "acc-1",
        emailId: "email-001",
      });

      expect(mockGetOrAssumeRole).toHaveBeenCalledWith({
        roleArn: "arn:aws:iam::123456789012:role/wraps",
        externalId: "ext-123",
        region: "us-east-1",
      });
    });
  });
});
