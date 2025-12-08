import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchArchivedEmail } from "../email-archive.js";

// Mock the archive utility
vi.mock("../../../utils/archive.js", () => ({
  getArchivedEmail: vi.fn(),
}));

import { getArchivedEmail } from "../../../utils/archive.js";

describe("Email Archive Service", () => {
  const mockMessageId = "test-message-123";
  const mockOptions = {
    region: "us-east-1",
    archiveArn:
      "arn:aws:ses:us-east-1:123456789012:archive/wraps-email-archive",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchArchivedEmail", () => {
    it("should fetch archived email successfully", async () => {
      const mockEmail = {
        messageId: mockMessageId,
        from: "sender@example.com",
        to: "recipient@example.com",
        subject: "Test Email",
        html: "<html><body><h1>Hello</h1></body></html>",
        text: "Hello",
        attachments: [],
        headers: {
          "content-type": "text/html; charset=utf-8",
        },
        timestamp: new Date("2025-01-14T00:00:00Z"),
        metadata: {
          senderIp: "192.168.1.1",
          tlsProtocol: "TLSv1.2",
        },
      };

      vi.mocked(getArchivedEmail).mockResolvedValue(mockEmail);

      const result = await fetchArchivedEmail(mockMessageId, mockOptions);

      expect(result).toEqual(mockEmail);
      expect(getArchivedEmail).toHaveBeenCalledWith(
        mockOptions.archiveArn,
        {
          from: undefined,
          to: undefined,
          subject: undefined,
          timestamp: undefined,
        },
        mockOptions.region
      );
    });

    it("should return null when email is not found", async () => {
      const error = new Error("Email not found");
      vi.mocked(getArchivedEmail).mockRejectedValue(error);

      const result = await fetchArchivedEmail(mockMessageId, mockOptions);

      expect(result).toBeNull();
    });

    it("should return null for ResourceNotFoundException", async () => {
      const error = new Error("ResourceNotFoundException: Archive not found");
      vi.mocked(getArchivedEmail).mockRejectedValue(error);

      const result = await fetchArchivedEmail(mockMessageId, mockOptions);

      expect(result).toBeNull();
    });

    it("should rethrow other errors", async () => {
      const error = new Error("Network error");
      vi.mocked(getArchivedEmail).mockRejectedValue(error);

      await expect(
        fetchArchivedEmail(mockMessageId, mockOptions)
      ).rejects.toThrow("Network error");
    });

    it("should handle emails with attachments", async () => {
      const mockEmail = {
        messageId: mockMessageId,
        from: "sender@example.com",
        to: "recipient@example.com",
        subject: "Email with Attachments",
        html: "<html><body>Email content</body></html>",
        attachments: [
          {
            filename: "document.pdf",
            contentType: "application/pdf",
            size: 1024,
          },
          {
            filename: "image.png",
            contentType: "image/png",
            size: 2048,
          },
        ],
        headers: {},
        timestamp: new Date(),
      };

      vi.mocked(getArchivedEmail).mockResolvedValue(mockEmail);

      const result = await fetchArchivedEmail(mockMessageId, mockOptions);

      expect(result?.attachments).toHaveLength(2);
      expect(result?.attachments[0].filename).toBe("document.pdf");
      expect(result?.attachments[1].contentType).toBe("image/png");
    });

    it("should handle emails with SMTP metadata", async () => {
      const mockEmail = {
        messageId: mockMessageId,
        from: "sender@example.com",
        to: "recipient@example.com",
        subject: "Test",
        attachments: [],
        headers: {},
        timestamp: new Date(),
        metadata: {
          senderIp: "192.168.1.100",
          tlsProtocol: "TLSv1.3",
          tlsCipherSuite: "ECDHE-RSA-AES256-GCM-SHA384",
          senderHostname: "mail.example.com",
        },
      };

      vi.mocked(getArchivedEmail).mockResolvedValue(mockEmail);

      const result = await fetchArchivedEmail(mockMessageId, mockOptions);

      expect(result?.metadata?.senderIp).toBe("192.168.1.100");
      expect(result?.metadata?.tlsProtocol).toBe("TLSv1.3");
      expect(result?.metadata?.tlsCipherSuite).toBe(
        "ECDHE-RSA-AES256-GCM-SHA384"
      );
      expect(result?.metadata?.senderHostname).toBe("mail.example.com");
    });

    it("should handle emails with HTML only", async () => {
      const mockEmail = {
        messageId: mockMessageId,
        from: "sender@example.com",
        to: "recipient@example.com",
        subject: "HTML Only",
        html: "<html><body><h1>HTML Content</h1></body></html>",
        attachments: [],
        headers: {},
        timestamp: new Date(),
      };

      vi.mocked(getArchivedEmail).mockResolvedValue(mockEmail);

      const result = await fetchArchivedEmail(mockMessageId, mockOptions);

      expect(result?.html).toBeDefined();
      expect(result?.text).toBeUndefined();
    });

    it("should handle emails with text only", async () => {
      const mockEmail = {
        messageId: mockMessageId,
        from: "sender@example.com",
        to: "recipient@example.com",
        subject: "Text Only",
        text: "Plain text content",
        attachments: [],
        headers: {},
        timestamp: new Date(),
      };

      vi.mocked(getArchivedEmail).mockResolvedValue(mockEmail);

      const result = await fetchArchivedEmail(mockMessageId, mockOptions);

      expect(result?.text).toBeDefined();
      expect(result?.html).toBeUndefined();
    });

    it("should handle emails with both HTML and text", async () => {
      const mockEmail = {
        messageId: mockMessageId,
        from: "sender@example.com",
        to: "recipient@example.com",
        subject: "Multipart",
        html: "<html><body><p>HTML version</p></body></html>",
        text: "Plain text version",
        attachments: [],
        headers: {},
        timestamp: new Date(),
      };

      vi.mocked(getArchivedEmail).mockResolvedValue(mockEmail);

      const result = await fetchArchivedEmail(mockMessageId, mockOptions);

      expect(result?.html).toContain("HTML version");
      expect(result?.text).toContain("Plain text version");
    });

    it("should log fetch attempt", async () => {
      const consoleSpy = vi.spyOn(console, "log");
      const mockEmail = {
        messageId: mockMessageId,
        from: "test@test.com",
        to: "recipient@test.com",
        subject: "Test",
        attachments: [],
        headers: {},
        timestamp: new Date(),
      };

      vi.mocked(getArchivedEmail).mockResolvedValue(mockEmail);

      await fetchArchivedEmail(mockMessageId, mockOptions);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Fetching archived email:",
        expect.objectContaining({
          messageId: mockMessageId,
          archiveArn: mockOptions.archiveArn,
          region: mockOptions.region,
        })
      );
    });

    it("should log successful fetch", async () => {
      const consoleSpy = vi.spyOn(console, "log");
      const mockEmail = {
        messageId: mockMessageId,
        from: "test@test.com",
        to: "recipient@test.com",
        subject: "Test",
        html: "<html>test</html>",
        text: "test",
        attachments: [{ contentType: "application/pdf", size: 1024 }],
        headers: {},
        timestamp: new Date(),
      };

      vi.mocked(getArchivedEmail).mockResolvedValue(mockEmail);

      await fetchArchivedEmail(mockMessageId, mockOptions);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Archived email fetched successfully:",
        expect.objectContaining({
          messageId: mockMessageId,
          hasHtml: true,
          hasText: true,
          attachmentCount: 1,
        })
      );
    });

    it("should log when email is not found", async () => {
      const consoleSpy = vi.spyOn(console, "log");
      const error = new Error("Email not found");
      vi.mocked(getArchivedEmail).mockRejectedValue(error);

      await fetchArchivedEmail(mockMessageId, mockOptions);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Archived email not found:",
        mockMessageId
      );
    });

    it("should log errors for non-not-found cases", async () => {
      const consoleSpy = vi.spyOn(console, "error");
      const error = new Error("AWS Service Error");
      vi.mocked(getArchivedEmail).mockRejectedValue(error);

      await expect(
        fetchArchivedEmail(mockMessageId, mockOptions)
      ).rejects.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Error fetching archived email:",
        error
      );
    });

    it("should handle different regions", async () => {
      const mockEmail = {
        messageId: mockMessageId,
        from: "test@test.com",
        to: "recipient@test.com",
        subject: "Test",
        attachments: [],
        headers: {},
        timestamp: new Date(),
      };

      vi.mocked(getArchivedEmail).mockResolvedValue(mockEmail);

      const optionsEuWest = {
        ...mockOptions,
        region: "eu-west-1",
      };

      await fetchArchivedEmail(mockMessageId, optionsEuWest);

      expect(getArchivedEmail).toHaveBeenCalledWith(
        expect.any(String),
        {
          from: undefined,
          to: undefined,
          subject: undefined,
          timestamp: undefined,
        },
        "eu-west-1"
      );
    });

    it("should preserve all email headers", async () => {
      const mockEmail = {
        messageId: mockMessageId,
        from: "test@test.com",
        to: "recipient@test.com",
        subject: "Test",
        attachments: [],
        headers: {
          "x-custom-header": "custom-value",
          "reply-to": "noreply@example.com",
          "content-type": "text/html; charset=utf-8",
        },
        timestamp: new Date(),
      };

      vi.mocked(getArchivedEmail).mockResolvedValue(mockEmail);

      const result = await fetchArchivedEmail(mockMessageId, mockOptions);

      expect(result?.headers["x-custom-header"]).toBe("custom-value");
      expect(result?.headers["reply-to"]).toBe("noreply@example.com");
      expect(result?.headers["content-type"]).toBe("text/html; charset=utf-8");
    });
  });
});
