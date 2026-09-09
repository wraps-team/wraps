import { auth } from "@wraps/auth";
import { verifyMarketplaceLinkToken } from "@wraps/email";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { logger, serializeError } from "@/lib/logger";
import {
  linkMarketplaceSubscription,
  MARKETPLACE_LINK_COOKIE,
} from "@/lib/marketplace/aws";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connect your AWS Marketplace subscription",
};

/**
 * Target of the link in the subscription confirmation email.
 *
 * The token is verified here and its subscription id parked in an httpOnly
 * cookie, because the buyer usually has no account yet — they need to sign up
 * first, and org creation is where the attachment actually happens. The cookie
 * carries the already-verified id so the signup flow never has to re-trust
 * anything from the URL.
 *
 * A signed-in buyer with an organization is attached immediately.
 */
export default async function MarketplaceLinkPage(props: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await props.searchParams;

  const payload = token ? await verifyMarketplaceLinkToken(token) : null;

  if (!payload) {
    return (
      <Shell>
        <p className="text-foreground text-sm">
          That link is not valid any more. Open your subscription in AWS
          Marketplace and choose Set up your account again, or email{" "}
          <a href="mailto:support@wraps.dev">support@wraps.dev</a>.
        </p>
      </Shell>
    );
  }

  // Park the verified id. Nothing downstream reads the token again.
  const cookieStore = await cookies();
  cookieStore.set(MARKETPLACE_LINK_COOKIE, payload.sid, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24, // A day to finish signing up.
  });

  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    // No account yet: sign up, and org creation picks the cookie up.
    redirect("/auth/sign-up");
  }

  // better-auth's typed session does not surface the organization plugin's
  // field; app/page.tsx narrows it the same way.
  const activeOrgId = (
    session.session as { activeOrganizationId?: string | null } | undefined
  )?.activeOrganizationId;
  if (!activeOrgId) {
    // Signed in but no organization yet — the onboarding flow creates one.
    redirect("/onboarding");
  }

  try {
    await linkMarketplaceSubscription({
      organizationId: activeOrgId,
      cookieRef: null,
      linkTokenSubscriptionId: payload.sid,
    });
  } catch (error) {
    logger.error(
      { err: serializeError(error), subscriptionId: payload.sid },
      "Failed to link an AWS Marketplace subscription from the email link"
    );
  }

  redirect("/");
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="font-semibold text-2xl text-foreground tracking-tight">
        Connect your AWS Marketplace subscription
      </h1>
      <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4">
        {children}
      </div>
    </div>
  );
}
