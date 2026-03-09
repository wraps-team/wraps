/**
 * SSRF Guard Tests
 *
 * Verifies that validatePublicUrl() and isPrivateHost() correctly block
 * requests to private, reserved, and link-local IP ranges/hostnames.
 */

import { describe, expect, it } from "vitest";
import { isPrivateHost, validatePublicUrl } from "../ssrf-guard";

describe("isPrivateHost", () => {
  describe("blocks reserved hostnames", () => {
    it("blocks localhost", () => {
      expect(isPrivateHost("localhost")).toBe(true);
    });

    it("blocks GCP metadata endpoint", () => {
      expect(isPrivateHost("metadata.google.internal")).toBe(true);
    });

    it("is case-insensitive for hostnames", () => {
      expect(isPrivateHost("LOCALHOST")).toBe(true);
    });
  });

  describe("blocks loopback addresses", () => {
    it("blocks 127.0.0.1", () => {
      expect(isPrivateHost("127.0.0.1")).toBe(true);
    });

    it("blocks 127.255.255.255", () => {
      expect(isPrivateHost("127.255.255.255")).toBe(true);
    });
  });

  describe("blocks private 10.0.0.0/8", () => {
    it("blocks 10.0.0.1", () => {
      expect(isPrivateHost("10.0.0.1")).toBe(true);
    });

    it("blocks 10.255.255.255", () => {
      expect(isPrivateHost("10.255.255.255")).toBe(true);
    });
  });

  describe("blocks private 172.16.0.0/12", () => {
    it("blocks 172.16.0.1", () => {
      expect(isPrivateHost("172.16.0.1")).toBe(true);
    });

    it("blocks 172.31.255.255", () => {
      expect(isPrivateHost("172.31.255.255")).toBe(true);
    });

    it("does not block 172.15.x (outside range)", () => {
      expect(isPrivateHost("172.15.0.1")).toBe(false);
    });

    it("does not block 172.32.x (outside range)", () => {
      expect(isPrivateHost("172.32.0.1")).toBe(false);
    });
  });

  describe("blocks private 192.168.0.0/16", () => {
    it("blocks 192.168.0.1", () => {
      expect(isPrivateHost("192.168.0.1")).toBe(true);
    });

    it("blocks 192.168.255.255", () => {
      expect(isPrivateHost("192.168.255.255")).toBe(true);
    });
  });

  describe("blocks AWS EC2 metadata (link-local 169.254.0.0/16)", () => {
    it("blocks 169.254.169.254 (IMDS)", () => {
      expect(isPrivateHost("169.254.169.254")).toBe(true);
    });

    it("blocks 169.254.0.1", () => {
      expect(isPrivateHost("169.254.0.1")).toBe(true);
    });
  });

  describe("blocks unspecified 0.0.0.0/8", () => {
    it("blocks 0.0.0.0", () => {
      expect(isPrivateHost("0.0.0.0")).toBe(true);
    });
  });

  describe("blocks IPv6 private addresses", () => {
    it("blocks ::1 loopback", () => {
      expect(isPrivateHost("::1")).toBe(true);
    });

    it("blocks fc00:: ULA", () => {
      expect(isPrivateHost("fc00::1")).toBe(true);
    });

    it("blocks fd00:: ULA", () => {
      expect(isPrivateHost("fd00::1")).toBe(true);
    });

    it("blocks fe80:: link-local", () => {
      expect(isPrivateHost("fe80::1")).toBe(true);
    });
  });

  describe("allows public addresses", () => {
    it("allows 8.8.8.8", () => {
      expect(isPrivateHost("8.8.8.8")).toBe(false);
    });

    it("allows 1.1.1.1", () => {
      expect(isPrivateHost("1.1.1.1")).toBe(false);
    });

    it("allows example.com", () => {
      expect(isPrivateHost("example.com")).toBe(false);
    });

    it("allows wraps.dev", () => {
      expect(isPrivateHost("wraps.dev")).toBe(false);
    });
  });
});

describe("validatePublicUrl", () => {
  describe("rejects invalid URLs", () => {
    it("rejects non-URL strings", () => {
      const result = validatePublicUrl("not-a-url");
      expect(result.valid).toBe(false);
    });

    it("rejects empty string", () => {
      const result = validatePublicUrl("");
      expect(result.valid).toBe(false);
    });
  });

  describe("rejects non-HTTP schemes", () => {
    it("rejects file:// URLs", () => {
      const result = validatePublicUrl("file:///etc/passwd");
      expect(result.valid).toBe(false);
    });

    it("rejects ftp:// URLs", () => {
      const result = validatePublicUrl("ftp://example.com/file");
      expect(result.valid).toBe(false);
    });

    it("rejects javascript: URLs", () => {
      const result = validatePublicUrl("javascript:alert(1)");
      expect(result.valid).toBe(false);
    });

    it("rejects data: URLs", () => {
      const result = validatePublicUrl("data:text/html,<h1>test</h1>");
      expect(result.valid).toBe(false);
    });
  });

  describe("rejects URLs targeting private hosts", () => {
    it("rejects http://localhost", () => {
      const result = validatePublicUrl("http://localhost/api/secret");
      expect(result.valid).toBe(false);
    });

    it("rejects http://127.0.0.1", () => {
      const result = validatePublicUrl("http://127.0.0.1/");
      expect(result.valid).toBe(false);
    });

    it("rejects http://169.254.169.254 (AWS IMDS)", () => {
      const result = validatePublicUrl(
        "http://169.254.169.254/latest/meta-data/"
      );
      expect(result.valid).toBe(false);
    });

    it("rejects http://10.0.0.1", () => {
      const result = validatePublicUrl("http://10.0.0.1/internal");
      expect(result.valid).toBe(false);
    });

    it("rejects http://192.168.1.1", () => {
      const result = validatePublicUrl("http://192.168.1.1/admin");
      expect(result.valid).toBe(false);
    });

    it("rejects http://172.16.0.1", () => {
      const result = validatePublicUrl("http://172.16.0.1/");
      expect(result.valid).toBe(false);
    });
  });

  describe("accepts valid public URLs", () => {
    it("accepts https://example.com", () => {
      const result = validatePublicUrl("https://example.com/image.png");
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.parsedUrl.hostname).toBe("example.com");
      }
    });

    it("accepts http://example.com", () => {
      const result = validatePublicUrl("http://example.com/image.jpg");
      expect(result.valid).toBe(true);
    });

    it("accepts URLs with ports on public hosts", () => {
      const result = validatePublicUrl("https://cdn.example.com:8080/img.png");
      expect(result.valid).toBe(true);
    });

    it("returns the parsed URL on success", () => {
      const result = validatePublicUrl("https://images.wraps.dev/logo.png?v=2");
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.parsedUrl).toBeInstanceOf(URL);
        expect(result.parsedUrl.protocol).toBe("https:");
      }
    });
  });
});
