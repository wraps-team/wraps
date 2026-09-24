import * as Sentry from "@sentry/nextjs";
import { auth } from "@wraps/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { classifyAuthResponse } from "@/lib/auth-response-reporting";

const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;

type Handler = (request: Request) => Promise<Response>;

// better-auth catches its own failures: an OAuth callback that can't query
// the database logs and redirects to `?error=internal_server_error`, an
// endpoint that throws logs and answers 500. Neither reaches Sentry on its
// own — this wraps every exported handler to report from the response alone,
// whatever better-auth did or didn't log. Observe-only: it always returns the
// same response object it was given.
function reportAuthResponse(handler: Handler): Handler {
  return async (request) => {
    const response = await handler(request);
    const issue = classifyAuthResponse(request.url, response);
    if (issue?.kind === "server_error") {
      Sentry.captureMessage(`better-auth ${issue.status} on ${issue.path}`, {
        level: "error",
        tags: { feature: "better-auth", auth_path: issue.path },
        fingerprint: ["better-auth-5xx", issue.path],
      });
    } else if (issue?.kind === "error_redirect") {
      Sentry.captureMessage(`better-auth redirected with error=${issue.code}`, {
        level: issue.level,
        tags: {
          feature: "better-auth",
          auth_error_code: issue.code,
          auth_path: issue.path,
        },
        fingerprint: ["better-auth-error-redirect", issue.code],
      });
    }
    return response;
  };
}

// PUT/PATCH/DELETE are not optional: the SCIM plugin serves user updates on
// PUT and PATCH and deprovisioning on DELETE (/api/auth/scim/v2/Users/:id).
// Exporting only GET and POST made Next.js answer every IdP update, deactivate
// and delete push with 405, so provisioning appeared to work (Create is a POST)
// and then silently stopped syncing.
const {
  GET: authGET,
  POST: authPOST,
  PUT: authPUT,
  PATCH: authPATCH,
  DELETE: authDELETE,
} = toNextJsHandler(auth);
const GET = reportAuthResponse(authGET);
const PUT = reportAuthResponse(authPUT);
const PATCH = reportAuthResponse(authPATCH);
const DELETE = reportAuthResponse(authDELETE);

async function handlePOST(request: Request) {
  const url = new URL(request.url);

  if (url.pathname === "/api/auth/sign-up/email" && TURNSTILE_SECRET_KEY) {
    const token = request.headers.get("x-turnstile-token");

    if (!token) {
      return NextResponse.json(
        { error: "Verification required" },
        { status: 400 }
      );
    }

    const verifyResponse = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: TURNSTILE_SECRET_KEY,
          response: token,
        }),
      }
    );
    const result = await verifyResponse.json();
    if (!result.success) {
      return NextResponse.json(
        { error: "Verification failed. Please try again." },
        { status: 403 }
      );
    }
  }

  return authPOST(request);
}

const POST = reportAuthResponse(handlePOST);

export { GET, POST, PUT, PATCH, DELETE };
