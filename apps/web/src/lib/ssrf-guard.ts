/**
 * SSRF Guard — blocks requests to private/internal IP ranges and reserved hostnames.
 *
 * Use validatePublicUrl() before any server-side fetch of a user-supplied URL.
 */

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./, // link-local / AWS EC2 metadata
  /^0\./,
  /^::1$/,
  /^f[cd][0-9a-f]{2}:/i,
  /^fe80:/i,
];

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal"]);

export function isPrivateHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) {
    return true;
  }
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(lower));
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
