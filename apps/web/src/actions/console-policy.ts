"use server";

import { auth } from "@wraps/auth";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { orgAction } from "@/actions/shared/org-action";

/**
 * Re-probe which version of the Wraps console policy an account's
 * `wraps-console-access-role` carries, and persist the reading.
 *
 * Exists because the stale-policy banner renders off a stored column, and the
 * hourly account-health sweep will not re-probe an account it checked in the
 * last day unless that account is already known to be behind. A customer who
 * repairs their role is watching for exactly this number to move, so the
 * dashboard needs a way to ask now rather than on the sweep's schedule.
 *
 * The probe itself lives in apps/api: the ladder that maps SES permissions to
 * a version number (apps/api/src/lib/console-policy-version.ts) must have
 * exactly one definition. It has drifted out of sync with its copies twice,
 * and a second copy here — in the surface whose whole job is reporting that
 * drift — is the last place it should be duplicated. So this forwards the
 * caller's session to the API the same way the agent and batch actions do,
 * and the API re-enforces org scoping server-side.
 */
export type RecheckConsolePolicyResult = {
  success: true;
  /** Null when the role has never been successfully probed. */
  version: number | null;
  currentVersion: number;
  upToDate: boolean;
  /** False when a cooldown or a throttled probe left the stored reading in place. */
  rechecked: boolean;
  checkedAt: string | null;
};

type ApiResponse = Omit<RecheckConsolePolicyResult, "success">;

export const recheckConsolePolicyAction = orgAction(
  {
    name: "recheckConsolePolicy",
    resource: "awsAccounts",
    permission: ["write"],
    orgId: (_awsAccountId: string, organizationId: string) => organizationId,
    onError: "Could not check the role's policy version",
  },
  async (
    ctx,
    awsAccountId: string,
    organizationId: string
  ): Promise<
    RecheckConsolePolicyResult | { success: false; error: string }
  > => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return { success: false, error: "Session not found" };
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      ctx.log.error("NEXT_PUBLIC_API_URL is not configured");
      return { success: false, error: "API URL not configured" };
    }

    const response = await fetch(
      `${apiUrl}/v1/account/console-policy/${awsAccountId}/recheck`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session.token}`,
          "X-Organization-Id": organizationId,
        },
      }
    );

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const error =
        (parsed as { error?: string } | null)?.error ||
        `Request failed (${response.status})`;
      ctx.log.warn(
        { awsAccountId, status: response.status, error },
        "Console-policy re-check failed"
      );
      return { success: false, error };
    }

    const data = parsed as ApiResponse;

    // The banner and the card both render off the stored column, so the page
    // has to be re-read for a newly current role to stop being reported as
    // stale — which is the entire point of the button.
    revalidatePath(
      `/${ctx.access.orgSlug}/settings/aws-accounts/${awsAccountId}`,
      "page"
    );

    return { success: true, ...data };
  }
);
