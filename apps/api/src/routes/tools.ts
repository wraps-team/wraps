/**
 * Public Tools Routes
 * Free email deliverability tools - no authentication required
 */

import { type EmailCheckResult, runEmailCheck } from "@wraps.dev/email-check";
import { Elysia, t } from "elysia";

import { publicRateLimitMiddleware } from "../middleware/public-rate-limit";
import {
  getCached,
  getEmailCheckCacheKey,
  setCache,
} from "../middleware/tools-cache";

// Response schema for email check
const emailCheckResponseSchema = t.Object({
  success: t.Boolean(),
  domain: t.Optional(t.String()),
  checkedAt: t.Optional(t.String()),
  duration: t.Optional(t.Number()),
  score: t.Optional(
    t.Object({
      grade: t.String(),
      score: t.Number(),
      maxScore: t.Number(),
      breakdown: t.Object({}, { additionalProperties: true }),
    })
  ),
  spf: t.Optional(
    t.Object({
      exists: t.Boolean(),
      valid: t.Boolean(),
      record: t.Union([t.String(), t.Null()]),
      lookupCount: t.Number(),
      lookupLimit: t.Number(),
      allMechanism: t.Union([t.String(), t.Null()]),
      includes: t.Array(t.String()),
      hasPtr: t.Boolean(),
      warnings: t.Array(t.String()),
    })
  ),
  dkim: t.Optional(
    t.Object({
      found: t.Boolean(),
      selectorsFound: t.Array(
        t.Object({
          selector: t.String(),
          keyType: t.Union([t.String(), t.Null()]),
          keyBits: t.Union([t.Number(), t.Null()]),
          testMode: t.Boolean(),
        })
      ),
      selectorsChecked: t.Number(),
      warnings: t.Array(t.String()),
    })
  ),
  dmarc: t.Optional(
    t.Object({
      exists: t.Boolean(),
      valid: t.Boolean(),
      record: t.Union([t.String(), t.Null()]),
      policy: t.Union([t.String(), t.Null()]),
      subdomainPolicy: t.Union([t.String(), t.Null()]),
      nonExistentSubdomainPolicy: t.Union([t.String(), t.Null()]),
      testing: t.Boolean(),
      reportingEnabled: t.Boolean(),
      pct: t.Union([t.Number(), t.Null()]),
      alignmentSpf: t.Union([t.String(), t.Null()]),
      alignmentDkim: t.Union([t.String(), t.Null()]),
      ruaAddresses: t.Array(t.String()),
      warnings: t.Array(t.String()),
    })
  ),
  mx: t.Optional(
    t.Object({
      exists: t.Boolean(),
      hasRedundancy: t.Boolean(),
      records: t.Array(
        t.Object({
          exchange: t.String(),
          priority: t.Number(),
          resolves: t.Boolean(),
          ipv4Count: t.Number(),
          ipv6Count: t.Number(),
        })
      ),
    })
  ),
  domainAge: t.Optional(
    t.Object({
      ageInDays: t.Union([t.Number(), t.Null()]),
      createdAt: t.Union([t.String(), t.Null()]),
      expiresAt: t.Union([t.String(), t.Null()]),
      daysUntilExpiry: t.Union([t.Number(), t.Null()]),
      registrar: t.Union([t.String(), t.Null()]),
      source: t.Union([t.String(), t.Null()]),
      privacyEnabled: t.Boolean(),
    })
  ),
  ipv6: t.Optional(
    t.Object({
      mxHasIpv6: t.Boolean(),
      spfIncludesIpv6: t.Boolean(),
      mxIpv6Count: t.Number(),
    })
  ),
  reverseDns: t.Optional(
    t.Object({
      allHavePtr: t.Boolean(),
      allConfirm: t.Boolean(),
      count: t.Number(),
    })
  ),
  blacklist: t.Optional(
    t.Object({
      checked: t.Boolean(),
      overallClean: t.Boolean(),
      domainListings: t.Array(
        t.Object({
          blacklist: t.String(),
          priority: t.String(),
          delistUrl: t.Union([t.String(), t.Null()]),
        })
      ),
      ipListings: t.Array(
        t.Object({
          blacklist: t.String(),
          priority: t.String(),
          target: t.String(),
          delistUrl: t.Union([t.String(), t.Null()]),
        })
      ),
    })
  ),
  issues: t.Optional(
    t.Array(
      t.Object({
        check: t.String(),
        reason: t.String(),
        points: t.Number(),
        severity: t.String(),
      })
    )
  ),
  bonuses: t.Optional(
    t.Array(
      t.Object({
        check: t.String(),
        reason: t.String(),
        points: t.Number(),
      })
    )
  ),
  error: t.Optional(t.String()),
});

/**
 * Transform EmailCheckResult to API response format
 */
function formatEmailCheckResult(result: EmailCheckResult) {
  return {
    success: true,
    domain: result.domain,
    checkedAt: result.checkedAt,
    duration: result.duration,
    score: {
      grade: result.score.grade,
      score: result.score.finalScore,
      maxScore: 100,
      breakdown: result.score.breakdown,
    },
    spf: {
      exists: result.spf.exists,
      valid: result.spf.valid,
      record: result.spf.record,
      lookupCount: result.spf.lookupCount,
      lookupLimit: result.spf.lookupLimit,
      allMechanism: result.spf.allMechanism,
      includes: result.spf.includes,
      hasPtr: result.spf.hasPtr,
      warnings: result.spf.warnings,
    },
    dkim: {
      found: result.dkim.found,
      selectorsFound: result.dkim.selectors
        .filter((s) => s.valid && !s.revoked)
        .map((s) => ({
          selector: s.selector,
          keyType: s.keyType,
          keyBits: s.keyBits,
          testMode: s.testMode,
        })),
      selectorsChecked: result.dkim.selectorsChecked,
      warnings: result.dkim.warnings,
    },
    dmarc: {
      exists: result.dmarc.exists,
      valid: result.dmarc.valid,
      record: result.dmarc.record,
      policy: result.dmarc.policy,
      subdomainPolicy: result.dmarc.subdomainPolicy,
      nonExistentSubdomainPolicy:
        result.dmarc.nonExistentSubdomainPolicy ?? null,
      testing: result.dmarc.testing ?? false,
      reportingEnabled: result.dmarc.reportingEnabled,
      pct: result.dmarc.percentage,
      alignmentSpf: result.dmarc.alignmentSpf,
      alignmentDkim: result.dmarc.alignmentDkim,
      ruaAddresses: result.dmarc.ruaAddresses,
      warnings: result.dmarc.warnings,
    },
    mx: {
      exists: result.mx.exists,
      hasRedundancy: result.mx.hasRedundancy,
      records: result.mx.records.map((r) => ({
        exchange: r.exchange,
        priority: r.priority,
        resolves: r.resolves,
        ipv4Count: r.ipv4Addresses.length,
        ipv6Count: r.ipv6Addresses.length,
      })),
    },
    domainAge: {
      ageInDays: result.domainAge.ageInDays,
      createdAt: result.domainAge.createdAt,
      expiresAt: result.domainAge.expiresAt,
      daysUntilExpiry: result.domainAge.daysUntilExpiry,
      registrar: result.domainAge.registrar,
      source: result.domainAge.source,
      privacyEnabled: result.domainAge.privacyEnabled,
    },
    ipv6: {
      mxHasIpv6: result.ipv6.mxHasIpv6,
      spfIncludesIpv6: result.ipv6.spfIncludesIpv6,
      mxIpv6Count: result.ipv6.mxIpv6Addresses.length,
    },
    reverseDns: {
      allHavePtr: result.reverseDns.allHavePtr,
      allConfirm: result.reverseDns.allConfirm,
      count: result.reverseDns.results.length,
    },
    blacklist: {
      checked: !result.blacklist.quickMode,
      overallClean: result.blacklist.overallClean,
      domainListings: result.blacklist.domainChecks.listed.map((l) => ({
        blacklist: l.blacklist,
        priority: l.priority,
        delistUrl: l.delistUrl,
      })),
      ipListings: result.blacklist.ipChecks.listed.map((l) => ({
        blacklist: l.blacklist,
        priority: l.priority,
        target: l.target,
        delistUrl: l.delistUrl,
      })),
    },
    issues: result.score.deductions.map((d) => ({
      check: d.check,
      reason: d.reason,
      points: d.points,
      severity:
        d.points >= 20 ? "critical" : d.points >= 10 ? "warning" : "info",
    })),
    bonuses: result.score.bonuses.map((b) => ({
      check: b.check,
      reason: b.reason,
      points: b.points,
    })),
  };
}

export const toolsRoutes = new Elysia({ prefix: "/tools" })
  // Apply IP-based rate limiting to all tools routes
  .use(publicRateLimitMiddleware)
  .post(
    "/email-check",
    async ({ body, set }) => {
      const { domain, quick = true, dkimSelector, dkimSelectors } = body;

      // Validate domain format
      if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(domain)) {
        return {
          success: false,
          error: "Invalid domain format",
          domain,
        };
      }

      // Build selectors array from either single selector or array
      const selectors = dkimSelectors?.length
        ? dkimSelectors
        : dkimSelector
          ? [dkimSelector]
          : undefined;

      // Check cache first
      const cacheKey = getEmailCheckCacheKey(domain, {
        quick,
        dkimSelectors: selectors,
      });
      const cached =
        await getCached<ReturnType<typeof formatEmailCheckResult>>(cacheKey);
      if (cached) {
        set.headers["X-Cache"] = "HIT";
        return cached;
      }

      try {
        const result = await runEmailCheck(domain, {
          quick,
          skipBlacklists: quick, // Skip blacklists in quick mode for speed
          skipTls: true, // Skip TLS checks (port 25 often blocked)
          dkimSelectors: selectors, // Custom DKIM selectors (useful for AWS SES)
        });

        const formatted = formatEmailCheckResult(result);

        // Cache successful results for 5 minutes
        await setCache(cacheKey, formatted);
        set.headers["X-Cache"] = "MISS";

        return formatted;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          success: false,
          error: message,
          domain,
        };
      }
    },
    {
      body: t.Object({
        domain: t.String({
          minLength: 3,
          maxLength: 255,
          description: "Domain to check",
        }),
        quick: t.Optional(
          t.Boolean({ description: "Quick mode (skip blacklist checks)" })
        ),
        dkimSelector: t.Optional(
          t.String({
            maxLength: 100,
            description: "Single DKIM selector to check",
          })
        ),
        dkimSelectors: t.Optional(
          t.Array(t.String({ maxLength: 100 }), {
            description: "Multiple DKIM selectors to check",
          })
        ),
      }),
      response: {
        200: emailCheckResponseSchema,
      },
      detail: {
        tags: ["tools"],
        summary: "Check email deliverability",
        description:
          "Comprehensive email deliverability check for any domain. Returns SPF, DKIM, DMARC status and a grade. Optionally provide DKIM selectors for providers like AWS SES that use random selectors.",
      },
    }
  )
  .get(
    "/email-check/:domain",
    async ({ params, set }) => {
      const { domain } = params;

      // Validate domain format
      if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(domain)) {
        return {
          success: false,
          error: "Invalid domain format",
          domain,
        };
      }

      // Check cache first
      const cacheKey = getEmailCheckCacheKey(domain, { quick: true });
      const cached =
        await getCached<ReturnType<typeof formatEmailCheckResult>>(cacheKey);
      if (cached) {
        set.headers["X-Cache"] = "HIT";
        return cached;
      }

      try {
        const result = await runEmailCheck(domain, {
          quick: true,
          skipBlacklists: true,
          skipTls: true,
        });

        const formatted = formatEmailCheckResult(result);

        // Cache successful results for 5 minutes
        await setCache(cacheKey, formatted);
        set.headers["X-Cache"] = "MISS";

        return formatted;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          success: false,
          error: message,
          domain,
        };
      }
    },
    {
      params: t.Object({
        domain: t.String({ description: "Domain to check", maxLength: 255 }),
      }),
      response: {
        200: emailCheckResponseSchema,
      },
      detail: {
        tags: ["tools"],
        summary: "Check email deliverability (GET)",
        description:
          "Quick email deliverability check for any domain via GET request.",
      },
    }
  );
