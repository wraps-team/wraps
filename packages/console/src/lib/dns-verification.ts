/**
 * DNS Verification utilities
 *
 * AWS SES doesn't provide verification status for:
 * - Custom tracking domains (CNAME records)
 * - DMARC policies (TXT records)
 *
 * We verify these ourselves and store results in localStorage
 */

export type DNSVerificationStatus = {
  verified: boolean;
  lastChecked: number;
  error?: string;
};

export type DNSVerificationCache = {
  trackingDomain?: Record<string, DNSVerificationStatus>;
  dmarc?: Record<string, DNSVerificationStatus>;
};

const CACHE_KEY = "wraps-dns-verification";
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

/**
 * Get verification cache from localStorage
 */
function getCache(): DNSVerificationCache {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch {
    return {};
  }
}

/**
 * Save verification cache to localStorage
 */
function saveCache(cache: DNSVerificationCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error("Failed to save DNS verification cache:", error);
  }
}

/**
 * Check if cached verification is still valid
 */
function isCacheValid(status?: DNSVerificationStatus): boolean {
  if (!status) {
    return false;
  }
  const age = Date.now() - status.lastChecked;
  return age < CACHE_DURATION;
}

/**
 * Verify tracking domain CNAME record
 * Checks if domain points to r.{region}.awstrack.me
 */
export async function verifyTrackingDomain(
  domain: string,
  expectedTarget: string
): Promise<DNSVerificationStatus> {
  console.log("[DNS Verify] verifyTrackingDomain called", {
    domain,
    expectedTarget,
  });

  const cache = getCache();
  const cacheKey = `${domain}->${expectedTarget}`;

  // Return cached result if valid
  if (
    cache.trackingDomain?.[cacheKey] &&
    isCacheValid(cache.trackingDomain[cacheKey])
  ) {
    console.log("[DNS Verify] Returning cached result");
    return cache.trackingDomain[cacheKey];
  }

  // Verify via backend API (avoids CORS issues)
  try {
    const token = sessionStorage.getItem("wraps-auth-token");
    const url = `/api/settings/verify-tracking-domain?token=${token}&domain=${encodeURIComponent(domain)}&expectedTarget=${encodeURIComponent(expectedTarget)}`;

    console.log("[DNS Verify] Fetching:", url);

    const response = await fetch(url);

    console.log("[DNS Verify] Response status:", response.status);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    console.log("[DNS Verify] Response data:", data);

    const status: DNSVerificationStatus = {
      verified: data.verified,
      lastChecked: Date.now(),
      error: data.error,
    };

    // Update cache
    if (!cache.trackingDomain) {
      cache.trackingDomain = {};
    }
    cache.trackingDomain[cacheKey] = status;
    saveCache(cache);

    return status;
  } catch (error) {
    console.error("Tracking domain verification request failed:", error);
    const status: DNSVerificationStatus = {
      verified: false,
      lastChecked: Date.now(),
      error: error instanceof Error ? error.message : "Failed to verify",
    };

    // Cache the error too (with shorter duration by design)
    if (!cache.trackingDomain) {
      cache.trackingDomain = {};
    }
    cache.trackingDomain[cacheKey] = status;
    saveCache(cache);

    return status;
  }
}

/**
 * Verify DMARC TXT record
 * Note: We can't actually query DNS from browser, so we use a different approach:
 * - Check via a public DNS-over-HTTPS API (like Google DNS or Cloudflare)
 */
export async function verifyDmarc(
  domain: string
): Promise<DNSVerificationStatus> {
  console.log("[DNS Verify] verifyDmarc called", { domain });

  const cache = getCache();
  const dmarcDomain = `_dmarc.${domain}`;

  // Return cached result if valid
  if (cache.dmarc?.[dmarcDomain] && isCacheValid(cache.dmarc[dmarcDomain])) {
    console.log("[DNS Verify] Returning cached DMARC result");
    return cache.dmarc[dmarcDomain];
  }

  // Verify via backend API (avoids CORS issues)
  try {
    const token = sessionStorage.getItem("wraps-auth-token");
    const url = `/api/settings/verify-dmarc?token=${token}&domain=${encodeURIComponent(domain)}`;

    console.log("[DNS Verify] Fetching:", url);

    const response = await fetch(url);

    console.log("[DNS Verify] Response status:", response.status);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    console.log("[DNS Verify] Response data:", data);

    const status: DNSVerificationStatus = {
      verified: data.verified,
      lastChecked: Date.now(),
      error: data.error,
    };

    // Update cache
    if (!cache.dmarc) {
      cache.dmarc = {};
    }
    cache.dmarc[dmarcDomain] = status;
    saveCache(cache);

    return status;
  } catch (error) {
    console.error("DMARC verification request failed:", error);
    const status: DNSVerificationStatus = {
      verified: false,
      lastChecked: Date.now(),
      error: error instanceof Error ? error.message : "Failed to verify",
    };

    // Cache the error too
    if (!cache.dmarc) {
      cache.dmarc = {};
    }
    cache.dmarc[dmarcDomain] = status;
    saveCache(cache);

    return status;
  }
}

/**
 * Clear verification cache for a specific domain
 */
export function clearVerificationCache(
  type: "trackingDomain" | "dmarc",
  key: string
): void {
  const cache = getCache();
  if (cache[type]?.[key]) {
    delete cache[type][key];
    saveCache(cache);
  }
}

/**
 * Clear all verification cache
 */
export function clearAllVerificationCache(): void {
  localStorage.removeItem(CACHE_KEY);
}
