/**
 * Probes whether a tracking domain is actually served over valid TLS.
 *
 * Plan 302's chosen mechanism for telling a customer which fix is right when
 * SES's tracking `HttpsPolicy` is `OPTIONAL`: this answers the same question
 * a recipient's browser answers when it follows an https:// click link, and
 * needs no new AWS permission. Two alternatives were rejected — see plan 302
 * for the full rationale — one of which (`cloudfront:ListDistributions`)
 * would have exposed every distribution in the customer's account.
 */

import { lookup as dnsLookup } from "node:dns/promises";
import * as tls from "node:tls";

export type TrackingTlsResult =
  | { status: "serving" }
  | { status: "not-serving"; reason: string }
  | { status: "unknown"; reason: string };

const TRACKING_TLS_PORT = 443;
const TRACKING_TLS_TIMEOUT_MS = 5000;

/**
 * IP classification mirrored from `isBlockedIp` in
 * `apps/api/src/(ee)/workers/workflow-utils.ts`. Duplicated rather than
 * imported: that file lives in a different package (`apps/api`, not
 * `apps/web`), under an `(ee)` directory this app cannot reach, and plan 302
 * is explicit that the api module is not to be refactored to share code —
 * this is a smaller, deliberately duplicated change instead. Same pattern as
 * `isAccessDeniedError` in `apps/web/src/actions/domains.ts`.
 */
const BLOCKED_IPV4_RANGES = [
  { prefix: "127.", label: "loopback" },
  { prefix: "10.", label: "private (10/8)" },
  { prefix: "169.254.", label: "link-local/IMDS" },
  { prefix: "0.", label: "unspecified" },
] as const;

function isBlockedIp(ip: string): string | null {
  // IPv4-mapped IPv6 (::ffff:1.2.3.4) — extract the IPv4 and re-check.
  if (ip.startsWith("::ffff:")) {
    const v4 = ip.slice(7);
    if (v4.includes(".")) {
      return isBlockedIp(v4);
    }
  }

  for (const range of BLOCKED_IPV4_RANGES) {
    if (ip.startsWith(range.prefix)) {
      return range.label;
    }
  }
  // 100.64.0.0/10 (Carrier-grade NAT / AWS VPC)
  if (ip.startsWith("100.")) {
    const second = Number.parseInt(ip.split(".")[1], 10);
    if (second >= 64 && second <= 127) {
      return "private (100.64/10 CGN)";
    }
  }
  // 172.16.0.0/12
  if (ip.startsWith("172.")) {
    const second = Number.parseInt(ip.split(".")[1], 10);
    if (second >= 16 && second <= 31) {
      return "private (172.16/12)";
    }
  }
  // 192.168.0.0/16
  if (ip.startsWith("192.168.")) {
    return "private (192.168/16)";
  }
  // IPv6
  if (ip === "::1" || ip === "::") {
    return "loopback";
  }
  if (ip.startsWith("fe80:")) {
    return "link-local";
  }
  if (ip.startsWith("fd") || ip.startsWith("fc")) {
    return "private (ULA)";
  }
  return null;
}

/**
 * Opens a TLS handshake against `address` (the DNS-resolved, SSRF-checked
 * IP) with `servername` set to `host` for SNI. Connecting to the checked IP
 * rather than letting Node re-resolve the hostname is what closes the
 * DNS-rebinding window — the IP that is connected to is the IP that was
 * checked. `rejectUnauthorized: true` keeps Node's full chain and hostname
 * validation on, so a handshake failure IS the signal: a certificate error,
 * a refused connection, or a closed port all mean `not-serving`. Only a
 * timeout — genuine uncertainty, not evidence of absence — means `unknown`.
 */
function connectTls(host: string, address: string): Promise<TrackingTlsResult> {
  return new Promise((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      finish({ status: "unknown", reason: "TLS handshake timed out" });
    }, TRACKING_TLS_TIMEOUT_MS);

    function finish(result: TrackingTlsResult) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    }

    const socket = tls.connect(
      {
        host: address,
        port: TRACKING_TLS_PORT,
        servername: host,
        rejectUnauthorized: true,
        timeout: TRACKING_TLS_TIMEOUT_MS,
      },
      () => {
        finish({ status: "serving" });
      }
    );

    socket.on("error", (error: Error) => {
      finish({ status: "not-serving", reason: error.message });
    });

    socket.on("timeout", () => {
      finish({ status: "unknown", reason: "TLS handshake timed out" });
    });
  });
}

/**
 * Resolves `host`, rejects the probe (as `unknown`, opening no connection)
 * if any resolved address is a loopback, link-local, private, or IPv6-ULA
 * address, and otherwise opens a TLS handshake to confirm whether the host
 * is actually served over valid HTTPS.
 *
 * Never throws — the contract is that this always resolves to one of the
 * three `TrackingTlsResult` states, so callers never need a try/catch.
 */
export async function probeTrackingTls(
  host: string
): Promise<TrackingTlsResult> {
  let addresses: { address: string; family: number }[];
  try {
    addresses = await dnsLookup(host, { all: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    const message = error instanceof Error ? error.message : String(error);
    // ENOTFOUND means the domain does not resolve at all — nothing serves
    // it, so this is a confident `not-serving`. Any other DNS failure
    // (timeout, refused, network blip) is genuine uncertainty.
    if (code === "ENOTFOUND") {
      return { status: "not-serving", reason: `DNS lookup failed: ${message}` };
    }
    return { status: "unknown", reason: `DNS lookup failed: ${message}` };
  }

  if (addresses.length === 0) {
    return { status: "unknown", reason: "DNS lookup returned no addresses" };
  }

  for (const { address } of addresses) {
    const blocked = isBlockedIp(address);
    if (blocked) {
      return {
        status: "unknown",
        reason: `Resolved address is not eligible to probe (${blocked}): ${address}`,
      };
    }
  }

  return connectTls(host, addresses[0].address);
}
