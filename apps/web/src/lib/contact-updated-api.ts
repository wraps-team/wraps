import { auth } from "@wraps/auth";
import { headers } from "next/headers";
import type { Logger } from "@/lib/logger";

/**
 * The contact fields a dashboard write may report, as the API's
 * POST /v1/contacts/events/updated accepts them.
 */
export const CONTACT_UPDATED_FIELDS = [
  "email",
  "phone",
  "firstName",
  "lastName",
  "company",
  "jobTitle",
  "preferredChannel",
  "properties",
  "emailStatus",
  "smsStatus",
] as const;

export type ContactUpdatedField = (typeof CONTACT_UPDATED_FIELDS)[number];

export type ContactUpdatedViaApiItem = {
  contactId: string;
  updatedFields: ContactUpdatedField[];
};

/** How long a dashboard action waits for the API before giving up. */
const CONTACT_UPDATED_TIMEOUT_MS = 5000;

/**
 * Fire contact_updated for contacts a dashboard action has just changed. The
 * web app cannot enqueue workflow jobs, so the signed-in user's session is
 * passed on to the API, which emits with changeSource "user".
 *
 * Call it after the write commits, and await it. Never throws: a failure is
 * logged with `ctx.log` and the action's result stands.
 *
 * No default API URL: a self-hosted dashboard must never send its users'
 * session tokens to the Wraps platform, so an unset NEXT_PUBLIC_API_URL logs
 * and skips the call.
 */
export async function emitContactsUpdatedViaApi(
  ctx: { log: Logger },
  organizationId: string,
  items: ContactUpdatedViaApiItem[]
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const context = { organizationId, contactCount: items.length };

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    ctx.log.warn(
      { ...context, failure: "unconfigured" },
      "NEXT_PUBLIC_API_URL is not set; contact_updated not emitted"
    );
    return;
  }

  let token: string | undefined;
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    token = session?.session?.token;
  } catch (err) {
    ctx.log.error(
      { ...context, failure: "session", err },
      "Session lookup failed; contact_updated not emitted"
    );
    return;
  }
  if (!token) {
    ctx.log.warn(
      { ...context, failure: "no_session" },
      "No session token; contact_updated not emitted"
    );
    return;
  }

  try {
    const response = await fetch(`${apiUrl}/v1/contacts/events/updated`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Organization-Id": organizationId,
      },
      body: JSON.stringify({ contacts: items }),
      signal: AbortSignal.timeout(CONTACT_UPDATED_TIMEOUT_MS),
    });

    if (!response.ok) {
      ctx.log.error(
        { ...context, failure: "status", status: response.status },
        "contact_updated API call was rejected"
      );
    }
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      ctx.log.error(
        {
          ...context,
          failure: "timeout",
          timeoutMs: CONTACT_UPDATED_TIMEOUT_MS,
        },
        "contact_updated API call timed out"
      );
    } else {
      ctx.log.error(
        { ...context, failure: "network", err },
        "contact_updated API call failed"
      );
    }
  }
}
