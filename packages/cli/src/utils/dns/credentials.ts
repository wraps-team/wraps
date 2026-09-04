/**
 * DNS provider credential validation and management
 */

import * as clack from "@clack/prompts";
import pc from "picocolors";
import { findHostedZone } from "../route53.js";
import type { DNSProviderType } from "../shared/prompts.js";

/**
 * DNS credentials for different providers
 */
export type DNSCredentials =
  | { provider: "route53"; hostedZoneId: string }
  | { provider: "vercel"; token: string; teamId?: string }
  | { provider: "cloudflare"; token: string; zoneId: string }
  | { provider: "manual" };

/**
 * Result of credential validation
 */
export type CredentialValidationResult = {
  valid: boolean;
  credentials?: DNSCredentials;
  error?: string;
};

/**
 * Get required environment variables for a DNS provider
 */
export function getDNSProviderEnvVars(provider: DNSProviderType): string[] {
  switch (provider) {
    case "route53":
      return []; // Uses AWS credentials from environment/config
    case "vercel":
      return ["VERCEL_TOKEN"];
    case "cloudflare":
      return ["CLOUDFLARE_API_TOKEN"];
    case "manual":
      return [];
  }
}

/**
 * Get optional environment variables for a DNS provider
 */
export function getDNSProviderOptionalEnvVars(
  provider: DNSProviderType
): string[] {
  switch (provider) {
    case "vercel":
      return ["VERCEL_TEAM_ID"];
    case "cloudflare":
      return ["CLOUDFLARE_ZONE_ID"];
    default:
      return [];
  }
}

/**
 * Check if Vercel token is available
 */
export function hasVercelToken(): boolean {
  return !!process.env.VERCEL_TOKEN;
}

/**
 * Check if Cloudflare token is available
 */
export function hasCloudflareToken(): boolean {
  return !!process.env.CLOUDFLARE_API_TOKEN;
}

/**
 * Validate Vercel credentials and get team info
 */
async function validateVercelCredentials(token: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.vercel.com/v2/user", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check if domain is managed in Vercel DNS
 */
async function checkVercelDomain(
  token: string,
  domain: string,
  teamId?: string
): Promise<boolean> {
  try {
    const teamParam = teamId ? `&teamId=${teamId}` : "";
    const response = await fetch(
      `https://api.vercel.com/v5/domains/${domain}?${teamParam}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Validate Cloudflare credentials.
 *
 * Two probes, because one is not sufficient on its own:
 *
 * `/user/tokens/verify` is the direct answer, but it requires the token to
 * carry `User → API Tokens → Read`. A zone-scoped token with nothing but
 * `Zone → DNS → Edit` — the correct least-privilege token for everything this
 * CLI does with Cloudflare — is refused there with `1000 Invalid API Token`,
 * even though it can create every record we ask it to. Gating on that endpoint
 * alone rejected working tokens, and the failure was near-silent: callers fell
 * back to printing records for manual entry, and the ACM validation push
 * (best-effort by design) dropped its record with no message at all.
 *
 * So on failure, fall back to listing zones — the capability the feature
 * actually exercises. A token that can enumerate zones can be used; one that
 * cannot is no use to us whatever `/user/tokens/verify` thinks.
 */
async function validateCloudflareCredentials(token: string): Promise<boolean> {
  const probe = async (url: string): Promise<boolean> => {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json()) as { success?: boolean };
      return data.success === true;
      // baseline:allow-next-line no-swallowed-errors — a probe answers yes/no; the caller reports "authentication failed"
    } catch {
      return false;
    }
  };

  if (await probe("https://api.cloudflare.com/client/v4/user/tokens/verify")) {
    return true;
  }
  return probe("https://api.cloudflare.com/client/v4/zones?per_page=1");
}

/**
 * Find Cloudflare zone ID for a domain
 */
export async function findCloudflareZoneId(
  token: string,
  domain: string
): Promise<string | null> {
  try {
    // Try exact domain match first
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(domain)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const data = (await response.json()) as {
      success: boolean;
      result: Array<{ id: string; name: string }>;
    };

    if (data.success && data.result.length > 0) {
      return data.result[0].id;
    }

    // If no exact match, try to find parent domain zone
    // e.g., for "mail.example.com", try "example.com"
    const parts = domain.split(".");
    if (parts.length > 2) {
      const parentDomain = parts.slice(-2).join(".");
      const parentResponse = await fetch(
        `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(parentDomain)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const parentData = (await parentResponse.json()) as {
        success: boolean;
        result: Array<{ id: string; name: string }>;
      };

      if (parentData.success && parentData.result.length > 0) {
        return parentData.result[0].id;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Interactively prompt the user for a DNS provider API token
 */
export async function promptDNSToken(
  provider: "vercel" | "cloudflare"
): Promise<{ token: string; teamId?: string } | null> {
  const isVercel = provider === "vercel";
  const providerName = isVercel ? "Vercel" : "Cloudflare";
  const tokenUrl = isVercel
    ? "https://vercel.com/account/tokens"
    : "https://dash.cloudflare.com/profile/api-tokens";

  console.log();
  clack.log.info(pc.bold(`${providerName} API Token`));

  if (isVercel) {
    clack.log.info(
      pc.dim("Scope: Full Access, or a scoped token with DNS access")
    );
  } else {
    clack.log.info(pc.dim("Scope: Zone → DNS → Edit (for your domain's zone)"));
    clack.log.info(
      pc.dim('Use the "Edit zone DNS" template when creating your token')
    );
  }

  clack.log.info(pc.dim(`Create one at: ${pc.cyan(tokenUrl)}`));

  const token = await clack.password({
    message: `${providerName} API token:`,
  });

  if (clack.isCancel(token) || !token) {
    return null;
  }

  let teamId: string | undefined;
  if (isVercel) {
    const wantsTeam = await clack.confirm({
      message: "Is this domain on a Vercel team account?",
      initialValue: false,
    });
    if (!clack.isCancel(wantsTeam) && wantsTeam) {
      const team = await clack.text({
        message: "Vercel Team ID:",
        placeholder: "team_xxxxx",
      });
      if (!clack.isCancel(team) && team) {
        teamId = team;
      }
    }
  }

  return { token, teamId };
}

/**
 * Get and validate DNS credentials for a provider
 * Prompts interactively for tokens if env vars are not set.
 */
export async function getDNSCredentials(
  provider: DNSProviderType,
  domain: string,
  region: string
): Promise<CredentialValidationResult> {
  switch (provider) {
    case "route53": {
      // Check for Route53 hosted zone
      const hostedZone = await findHostedZone(domain, region);
      if (hostedZone) {
        return {
          valid: true,
          credentials: { provider: "route53", hostedZoneId: hostedZone.id },
        };
      }
      return {
        valid: false,
        error: `No Route53 hosted zone found for ${domain}`,
      };
    }

    case "vercel": {
      let token = process.env.VERCEL_TOKEN;
      let teamId = process.env.VERCEL_TEAM_ID;

      // Prompt interactively if env var is not set
      if (!token) {
        const prompted = await promptDNSToken("vercel");
        if (!prompted) {
          return { valid: false, error: "No token provided" };
        }
        token = prompted.token;
        teamId = prompted.teamId ?? teamId;
      }

      // Validate token
      const isValid = await validateVercelCredentials(token);
      if (!isValid) {
        return {
          valid: false,
          error: "Invalid Vercel token — authentication failed",
        };
      }

      // Check if domain is in Vercel DNS
      const hasDomain = await checkVercelDomain(token, domain, teamId);
      if (!hasDomain) {
        return {
          valid: false,
          error: `Domain ${domain} not found in Vercel DNS`,
        };
      }

      return {
        valid: true,
        credentials: { provider: "vercel", token, teamId },
      };
    }

    case "cloudflare": {
      let token = process.env.CLOUDFLARE_API_TOKEN;

      // Prompt interactively if env var is not set
      if (!token) {
        const prompted = await promptDNSToken("cloudflare");
        if (!prompted) {
          return { valid: false, error: "No token provided" };
        }
        token = prompted.token;
      }

      // Validate token
      const isValid = await validateCloudflareCredentials(token);
      if (!isValid) {
        return {
          valid: false,
          error: "Invalid Cloudflare token — authentication failed",
        };
      }

      // Get zone ID from env or auto-detect
      let zoneId: string | undefined = process.env.CLOUDFLARE_ZONE_ID;
      if (!zoneId) {
        const detectedZoneId = await findCloudflareZoneId(token, domain);
        zoneId = detectedZoneId ?? undefined;
      }

      if (!zoneId) {
        return {
          valid: false,
          error: `Could not find Cloudflare zone for ${domain}. Set CLOUDFLARE_ZONE_ID if the domain uses a different zone.`,
        };
      }

      return {
        valid: true,
        credentials: { provider: "cloudflare", token, zoneId },
      };
    }

    case "manual":
      return {
        valid: true,
        credentials: { provider: "manual" },
      };
  }
}

/**
 * Detect which DNS providers are available for a domain
 */
export async function detectAvailableDNSProviders(
  domain: string,
  region: string
): Promise<
  Array<{
    provider: DNSProviderType;
    detected: boolean;
    hint?: string;
  }>
> {
  const providers: Array<{
    provider: DNSProviderType;
    detected: boolean;
    hint?: string;
  }> = [];

  // Check Route53
  const hostedZone = await findHostedZone(domain, region);
  providers.push({
    provider: "route53",
    detected: !!hostedZone,
    hint: hostedZone ? "Hosted zone detected" : undefined,
  });

  // Check Vercel
  const vercelToken = process.env.VERCEL_TOKEN;
  if (vercelToken) {
    const teamId = process.env.VERCEL_TEAM_ID;
    const hasDomain = await checkVercelDomain(vercelToken, domain, teamId);
    providers.push({
      provider: "vercel",
      detected: hasDomain,
      hint: hasDomain ? "Domain found in Vercel DNS" : "Token found",
    });
  } else {
    providers.push({
      provider: "vercel",
      detected: false,
    });
  }

  // Check Cloudflare
  const cfToken = process.env.CLOUDFLARE_API_TOKEN;
  if (cfToken) {
    const zoneId =
      process.env.CLOUDFLARE_ZONE_ID ||
      (await findCloudflareZoneId(cfToken, domain));
    providers.push({
      provider: "cloudflare",
      detected: !!zoneId,
      hint: zoneId ? "Zone found" : "Token found",
    });
  } else {
    providers.push({
      provider: "cloudflare",
      detected: false,
    });
  }

  // Manual is always available
  providers.push({
    provider: "manual",
    detected: true,
    hint: "I'll add DNS records myself",
  });

  // Sort so detected providers come first (except manual at end)
  return providers.sort((a, b) => {
    if (a.provider === "manual") {
      return 1;
    }
    if (b.provider === "manual") {
      return -1;
    }
    if (a.detected && !b.detected) {
      return -1;
    }
    if (!a.detected && b.detected) {
      return 1;
    }
    return 0;
  });
}
