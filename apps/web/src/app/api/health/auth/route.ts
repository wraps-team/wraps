import * as Sentry from "@sentry/nextjs";
import { auth } from "@wraps/auth";
import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// An address that can never be registered (.invalid is reserved, RFC 2606).
// The lookup is the one sign-in runs — user by email joined to accounts — so it
// fails whenever better-auth's schema and the database disagree, which is how
// the 2026-09 signup outage presented while the homepage stayed green.
const PROBE_EMAIL = "health-probe@wraps.invalid";

export async function GET() {
  const startedAt = performance.now();
  try {
    const ctx = await auth.$context;
    await ctx.internalAdapter.findUserByEmail(PROBE_EMAIL, {
      includeAccounts: true,
    });
    return NextResponse.json(
      { ok: true, durationMs: Math.round(performance.now() - startedAt) },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    logger.error(
      { err: error, reportToSentry: false },
      "auth health probe failed"
    );
    Sentry.captureException(error, {
      tags: { feature: "better-auth", source: "health-probe" },
    });
    return NextResponse.json(
      { ok: false },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
}
