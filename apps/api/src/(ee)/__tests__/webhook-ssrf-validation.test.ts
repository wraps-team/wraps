import { beforeEach, describe, expect, it, vi } from "vitest";
import { isBlockedIp, validateWebhookUrl } from "../workers/workflow-processor";

// Mock dns.lookup to control resolved addresses
vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

async function mockDnsLookup(address: string) {
  const dns = await import("node:dns/promises");
  vi.mocked(dns.lookup).mockResolvedValue({ address, family: 4 });
}

describe("isBlockedIp", () => {
  it("blocks IMDS/link-local (169.254.x.x)", () => {
    expect(isBlockedIp("169.254.169.254")).toBe("link-local/IMDS");
    expect(isBlockedIp("169.254.0.1")).toBe("link-local/IMDS");
  });

  it("blocks loopback (127.x.x.x)", () => {
    expect(isBlockedIp("127.0.0.1")).toBe("loopback");
    expect(isBlockedIp("127.255.255.255")).toBe("loopback");
  });

  it("blocks unspecified (0.x.x.x)", () => {
    expect(isBlockedIp("0.0.0.0")).toBe("unspecified");
  });

  it("blocks private 10.0.0.0/8", () => {
    expect(isBlockedIp("10.0.0.1")).toBe("private (10/8)");
    expect(isBlockedIp("10.255.255.255")).toBe("private (10/8)");
  });

  it("blocks private 172.16.0.0/12", () => {
    expect(isBlockedIp("172.16.0.1")).toBe("private (172.16/12)");
    expect(isBlockedIp("172.31.255.255")).toBe("private (172.16/12)");
  });

  it("does not block 172.15.x or 172.32.x", () => {
    expect(isBlockedIp("172.15.0.1")).toBeNull();
    expect(isBlockedIp("172.32.0.1")).toBeNull();
  });

  it("blocks private 192.168.0.0/16", () => {
    expect(isBlockedIp("192.168.0.1")).toBe("private (192.168/16)");
    expect(isBlockedIp("192.168.255.255")).toBe("private (192.168/16)");
  });

  it("allows public IPs", () => {
    expect(isBlockedIp("8.8.8.8")).toBeNull();
    expect(isBlockedIp("1.1.1.1")).toBeNull();
    expect(isBlockedIp("93.184.216.34")).toBeNull();
  });

  it("blocks IPv6 loopback (::1, ::)", () => {
    expect(isBlockedIp("::1")).toBe("loopback");
    expect(isBlockedIp("::")).toBe("loopback");
  });

  it("blocks IPv6 link-local (fe80:)", () => {
    expect(isBlockedIp("fe80::1")).toBe("link-local");
  });

  it("blocks IPv6 ULA (fd/fc)", () => {
    expect(isBlockedIp("fd00::1")).toBe("private (ULA)");
    expect(isBlockedIp("fc00::1")).toBe("private (ULA)");
  });

  // --- Gap: IPv4-mapped IPv6 ---
  it("blocks IPv4-mapped IPv6 private addresses", () => {
    expect(isBlockedIp("::ffff:127.0.0.1")).toBeTruthy();
    expect(isBlockedIp("::ffff:169.254.169.254")).toBeTruthy();
    expect(isBlockedIp("::ffff:10.0.0.1")).toBeTruthy();
    expect(isBlockedIp("::ffff:192.168.1.1")).toBeTruthy();
  });

  // --- Gap: AWS VPC/CGN range ---
  it("blocks AWS VPC/CGN range (100.64.0.0/10)", () => {
    expect(isBlockedIp("100.64.0.1")).toBeTruthy();
    expect(isBlockedIp("100.127.255.255")).toBeTruthy();
  });

  it("does not block public 100.x outside CGN range", () => {
    expect(isBlockedIp("100.63.255.255")).toBeNull();
    expect(isBlockedIp("100.128.0.1")).toBeNull();
  });

  // --- Ranges the string-prefix version missed ---
  it("blocks benchmarking 198.18.0.0/15 and nothing either side of it", () => {
    expect(isBlockedIp("198.18.0.1")).toBe("benchmarking (198.18/15)");
    expect(isBlockedIp("198.19.255.255")).toBe("benchmarking (198.18/15)");
    expect(isBlockedIp("198.17.255.255")).toBeNull();
    expect(isBlockedIp("198.20.0.1")).toBeNull();
  });

  it("blocks IPv4 multicast (224.0.0.0/4)", () => {
    expect(isBlockedIp("224.0.0.1")).toBe("multicast");
    expect(isBlockedIp("239.255.255.250")).toBe("multicast");
  });

  it("blocks reserved and broadcast (240.0.0.0/4)", () => {
    expect(isBlockedIp("240.0.0.1")).toBe("reserved/broadcast (240/4)");
    expect(isBlockedIp("255.255.255.255")).toBe("reserved/broadcast (240/4)");
  });

  it("blocks 192.0.0.0/24 but not the neighbouring 192.0.1.x", () => {
    expect(isBlockedIp("192.0.0.1")).toBe(
      "IETF protocol assignments (192.0.0/24)"
    );
    expect(isBlockedIp("192.0.1.1")).toBeNull();
  });

  it("blocks IPv6 multicast and NAT64", () => {
    expect(isBlockedIp("ff02::1")).toBe("multicast");
    // NAT64 of 169.254.169.254
    expect(isBlockedIp("64:ff9b::a9fe:a9fe")).toBe("NAT64");
  });

  it("blocks the whole fe80::/10 link-local range, not just fe80:", () => {
    expect(isBlockedIp("fe90::1")).toBe("link-local");
    expect(isBlockedIp("febf::1")).toBe("link-local");
  });

  it("blocks hex-form IPv4-mapped and IPv4-compatible IPv6", () => {
    expect(isBlockedIp("::ffff:7f00:1")).toBe("loopback");
    expect(isBlockedIp("::ffff:a9fe:a9fe")).toBe("link-local/IMDS");
    expect(isBlockedIp("::127.0.0.1")).toBe("IPv4-compatible (deprecated)");
    expect(isBlockedIp("::ffff:8.8.8.8")).toBeNull();
  });

  it("fails closed on input that is not an IP address", () => {
    expect(isBlockedIp("example.com")).toBe("not an IP address");
    expect(isBlockedIp("")).toBe("not an IP address");
  });

  it("allows public IPv6", () => {
    expect(isBlockedIp("2606:4700::1111")).toBeNull();
    expect(isBlockedIp("2001:4860:4860::8888")).toBeNull();
  });
});

describe("validateWebhookUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects ftp:// protocol", async () => {
    await expect(validateWebhookUrl("ftp://example.com/hook")).rejects.toThrow(
      "Webhook URL must use http(s)"
    );
  });

  it("rejects file:// protocol", async () => {
    await expect(validateWebhookUrl("file:///etc/passwd")).rejects.toThrow(
      "Webhook URL must use http(s)"
    );
  });

  it("rejects URL resolving to IMDS address", async () => {
    await mockDnsLookup("169.254.169.254");
    await expect(
      validateWebhookUrl("https://evil.example.com/hook")
    ).rejects.toThrow("blocked address");
  });

  it("rejects URL resolving to loopback", async () => {
    await mockDnsLookup("127.0.0.1");
    await expect(validateWebhookUrl("https://localhost/hook")).rejects.toThrow(
      "blocked address"
    );
  });

  it("rejects URL resolving to private IP", async () => {
    await mockDnsLookup("10.0.0.5");
    await expect(
      validateWebhookUrl("https://internal.example.com/hook")
    ).rejects.toThrow("blocked address");
  });

  it("allows URL resolving to public IP", async () => {
    await mockDnsLookup("93.184.216.34");
    await expect(
      validateWebhookUrl("https://example.com/hook")
    ).resolves.toBeUndefined();
  });

  it("rejects URL resolving to IPv4-mapped IPv6 private", async () => {
    await mockDnsLookup("::ffff:169.254.169.254");
    await expect(
      validateWebhookUrl("https://evil.example.com/hook")
    ).rejects.toThrow("blocked address");
  });

  it("rejects URL resolving to the benchmarking range", async () => {
    await mockDnsLookup("198.18.0.1");
    await expect(
      validateWebhookUrl("https://evil.example.com/hook")
    ).rejects.toThrow("blocked address");
  });
});
