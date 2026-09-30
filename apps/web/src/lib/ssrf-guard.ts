/**
 * SSRF Guard — blocks requests to private/internal IP ranges and reserved hostnames.
 *
 * Use assertPublicUrl() (async, resolves DNS) before any server-side fetch of a
 * user-supplied URL, and pair the fetch with `redirect: "manual"`.
 */

import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const BLOCKED_RANGES = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT — used inside AWS
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local / AWS EC2 metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
] as const) {
  BLOCKED_RANGES.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96], // NAT64
  ["fc00::", 7], // ULA
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
] as const) {
  BLOCKED_RANGES.addSubnet(network, prefix, "ipv6");
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

export function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  if (BLOCKED_HOSTNAMES.has(lower)) {
    return true;
  }
  const family = isIP(lower);
  if (family === 4) {
    return BLOCKED_RANGES.check(lower, "ipv4");
  }
  if (family === 6) {
    return BLOCKED_RANGES.check(lower, "ipv6");
  }
  return false;
}

export type UrlValidationResult =
  | { valid: true; parsedUrl: URL }
  | { valid: false; error: string };

export function validatePublicUrl(url: string): UrlValidationResult {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return { valid: false, error: "Only HTTP and HTTPS URLs are supported" };
  }

  if (isPrivateHost(parsedUrl.hostname)) {
    return {
      valid: false,
      error: "URL resolves to a private or reserved address",
    };
  }

  return { valid: true, parsedUrl };
}

/**
 * Async SSRF check for any server-side fetch of a user-supplied URL: runs
 * validatePublicUrl(), then resolves the hostname and rejects if ANY resolved
 * address is private/reserved. Pair with `redirect: "manual"` on the fetch.
 */
export async function assertPublicUrl(
  url: string
): Promise<UrlValidationResult> {
  const pre = validatePublicUrl(url);
  if (!pre.valid) {
    return pre;
  }

  const host = pre.parsedUrl.hostname.replace(/^\[(.*)\]$/, "$1");
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    return { valid: false, error: "Could not resolve host" };
  }
  if (addresses.length === 0) {
    return { valid: false, error: "Could not resolve host" };
  }
  if (addresses.some(({ address }) => isPrivateHost(address))) {
    return {
      valid: false,
      error: "URL resolves to a private or reserved address",
    };
  }
  return pre;
}
