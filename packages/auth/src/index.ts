import { passkey } from "@better-auth/passkey";
import { scim } from "@better-auth/scim";
import { sso } from "@better-auth/sso";
import { stripe } from "@better-auth/stripe";
import { and, auditLog, db, eq, member } from "@wraps/db";
import * as schema from "@wraps/db/schema/auth";
import * as scimSchema from "@wraps/db/schema/scim-provider";
import * as ssoSchema from "@wraps/db/schema/sso-provider";
import { getWrapsClient } from "@wraps/email";
import { wraps as wrapsContactSync } from "@wraps.dev/better-auth";
import { createPlatformClient } from "@wraps.dev/client";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import {
  admin,
  bearer,
  deviceAuthorization,
  haveIBeenPwned,
  lastLoginMethod,
  organization,
  twoFactor,
} from "better-auth/plugins";
import { userAc } from "better-auth/plugins/admin/access";
import { inbox } from "better-inbox";
import { desc } from "drizzle-orm";
import { PostHog } from "posthog-node";
import Stripe from "stripe";
import { ac, roles } from "./access";
import { sendLoginAlertSms } from "./login-alert-sms";
import { onStripeEvent } from "./stripe-webhooks";

// --- Attribution tracking ---

type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  ref?: string;
  referrer?: string;
  landing_page?: string;
  timestamp?: string;
};

const ATTRIBUTION_COOKIE = "wraps_attribution";

/**
 * Parse the wraps_attribution cookie from a raw Cookie header string.
 * Returns null if the cookie is missing or malformed.
 */
function getAttributionFromContext(
  context?: {
    headers?: Headers;
  } | null
): Attribution | null {
  try {
    const cookieHeader = context?.headers?.get?.("cookie");
    if (!cookieHeader) {
      return null;
    }

    // Parse cookie string to find our attribution cookie
    const match = cookieHeader
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${ATTRIBUTION_COOKIE}=`));

    if (!match) {
      return null;
    }

    const value = decodeURIComponent(
      match.slice(ATTRIBUTION_COOKIE.length + 1)
    );
    return JSON.parse(value) as Attribution;
  } catch {
    return null;
  }
}

// Initialize PostHog server client (lazy)
let posthogClient: PostHog | null = null;

// Get PostHog host URL for server-side usage
// The NEXT_PUBLIC_POSTHOG_HOST may be set to "/ingest" for client-side proxy,
// but server-side needs the full URL
function getPostHogHost(): string {
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  // If host is a relative path (starts with /), use the full PostHog URL
  if (!host || host.startsWith("/")) {
    return "https://us.i.posthog.com";
  }
  return host;
}

function getPostHogClient(): PostHog | null {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return null;
  }
  if (!posthogClient) {
    posthogClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      host: getPostHogHost(),
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}

/**
 * Emit user.deleted platform event and track in PostHog.
 * Non-blocking - failures are logged but don't affect auth flow.
 */
async function trackUserDeleted(user: { email: string; name: string | null }) {
  try {
    const apiKey = process.env.WRAPS_API_KEY;
    if (apiKey) {
      const client = createPlatformClient({ apiKey });
      const normalizedEmail = user.email.toLowerCase().trim();
      await client.POST("/v1/events/", {
        body: {
          name: "user.deleted",
          contactEmail: normalizedEmail,
          properties: {
            name: user.name || undefined,
            deletedAt: new Date().toISOString(),
          },
        },
      });
    }

    const posthog = getPostHogClient();
    if (posthog) {
      posthog.capture({
        distinctId: user.email,
        event: "user_deleted",
        properties: {
          email: user.email,
          name: user.name,
        },
      });
      await posthog.flush();
    }
  } catch (err) {
    console.error("Error tracking user.deleted event:", err);
  }
}

/**
 * Track user signup event in PostHog.
 * Non-blocking - failures are logged but don't affect auth flow.
 */
async function trackPostHogSignup(
  user: {
    email: string;
    name: string | null;
    method: "email" | "google" | "github" | "passkey";
  },
  attribution?: Attribution | null
) {
  try {
    const posthog = getPostHogClient();
    if (!posthog) {
      return;
    }

    const safeAttribution = attribution
      ? {
          utm_source: attribution.utm_source,
          utm_medium: attribution.utm_medium,
          utm_campaign: attribution.utm_campaign,
          utm_content: attribution.utm_content,
          utm_term: attribution.utm_term,
          ref: attribution.ref,
          referrer: attribution.referrer,
          landing_page: attribution.landing_page,
          timestamp: attribution.timestamp,
        }
      : undefined;

    posthog.identify({
      distinctId: user.email,
      properties: {
        email: user.email,
        name: user.name,
        ...safeAttribution,
      },
    });

    posthog.capture({
      distinctId: user.email,
      event: "user_signed_up",
      properties: {
        email: user.email,
        name: user.name,
        method: user.method,
        ...safeAttribution,
      },
    });

    await posthog.flush();
  } catch (err) {
    console.error("Error tracking PostHog signup:", err);
  }
}

/**
 * Check if this is a new device/IP for the user.
 * Returns true if either IP or user agent is different from all previous sessions.
 */
async function isNewDeviceOrIp(
  userId: string,
  currentIp?: string,
  currentUserAgent?: string
): Promise<boolean> {
  try {
    // Get user's previous sessions (excluding the current one being created)
    const previousSessions = await db.query.session.findMany({
      where: eq(schema.session.userId, userId),
      orderBy: [desc(schema.session.createdAt)],
      limit: 10, // Check last 10 sessions
    });

    if (previousSessions.length === 0) {
      // First session ever - don't alert (this is likely initial signup)
      return false;
    }

    // Check if current IP or user agent is new
    const knownIps = new Set(
      previousSessions.map((s) => s.ipAddress).filter(Boolean)
    );
    const knownAgents = new Set(
      previousSessions.map((s) => s.userAgent).filter(Boolean)
    );

    const isNewIp = currentIp && !knownIps.has(currentIp);
    const isNewAgent = currentUserAgent && !knownAgents.has(currentUserAgent);

    return Boolean(isNewIp || isNewAgent);
  } catch (error) {
    console.error("Error checking for new device/IP:", error);
    return false;
  }
}

/**
 * Write auth.login audit log rows for every org the user belongs to.
 * Exported for testability — called from session.create.after hook.
 * Failures are silently swallowed so a DB issue never breaks login.
 */
/**
 * Insert an in-app "new sign-in" notification (better-inbox row).
 * Direct row insert — `auth` does not exist inside its own config, and a
 * notification is just a row. Fire-and-forget like the audit log.
 */
export async function createLoginNotification(
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  await db
    .insert(schema.notification)
    .values({
      id: crypto.randomUUID(),
      userId,
      type: "security.new_device_login",
      title: "New sign-in to your account",
      body: `From ${ipAddress ?? "an unknown IP"}. If this wasn't you, review your sessions.`,
      href: "/settings/security",
      data: {
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
      },
      read: false,
      createdAt: new Date(),
    })
    .catch(() => {});
}

export async function writeLoginAuditLogs(
  userId: string,
  sessionId: string,
  userEmail: string
): Promise<void> {
  const orgs = await db.query.member.findMany({
    where: eq(member.userId, userId),
    columns: { organizationId: true },
  });
  for (const { organizationId } of orgs) {
    await db
      .insert(auditLog)
      .values({
        organizationId,
        userId,
        actorEmail: userEmail,
        action: "auth.login",
        resource: "session",
        resourceId: sessionId,
        metadata: { userId },
        ipAddress: null,
        userAgent: null,
      })
      .catch(() => {});
  }
}

/**
 * Decides whether SCIM provisioning may attach to a Wraps user that already
 * exists with the pushed email address.
 *
 * Without a policy the plugin refuses every match, so SCIM `Create` 409s on
 * most of an org's team the day they turn it on. The plugin's `true` shortcut
 * is not usable here: in a multi-tenant app it would let any org's SCIM token
 * claim — and then deactivate or delete — an account belonging to someone
 * outside that org, purely by pushing their email address.
 *
 * Exported for testing; wired in as `scim({ linkExistingUsers })` below.
 */
export async function shouldLinkScimUser({
  user,
  email,
  provider,
}: {
  user: { id: string };
  email: string;
  provider: { organizationId?: string };
}): Promise<boolean> {
  const organizationId = provider.organizationId;
  // Personal (non-org) tokens have no tenant to check the claim against.
  if (!organizationId) {
    return false;
  }

  // Already in the org — the membership predates SCIM, so letting the org's
  // token manage it grants nothing the org didn't already have.
  const membership = await db.query.member.findFirst({
    where: and(
      eq(member.userId, user.id),
      eq(member.organizationId, organizationId)
    ),
  });
  if (membership) {
    return true;
  }

  // Otherwise only claim an address at a domain this org has proven it owns via
  // DNS TXT. Same domain-claim model as Google Workspace, Okta, and Slack.
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) {
    return false;
  }
  // Compared in JS, not SQL: `domain` is stored exactly as the admin typed it
  // into the SSO form, so an `eq` would miss on casing.
  const providers = await db.query.ssoProvider.findMany({
    where: eq(ssoSchema.ssoProvider.organizationId, organizationId),
  });
  return providers.some(
    (p) => p.domainVerified && p.domain.toLowerCase() === domain
  );
}

// Only initialize Stripe client if the secret key is available
// This prevents build-time errors when env vars aren't set (e.g., during Next.js static generation)
const stripeClient = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-10-29.clover",
      typescript: true,
    })
  : null;

/**
 * Subscription plan configuration for Stripe billing.
 * Exported for testing and reference.
 */
export const subscriptionPlans = [
  {
    name: "starter",
    priceId: process.env.STRIPE_STARTER_PRICE_ID,
    annualDiscountPriceId: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID,
    limits: {
      emails: -1, // Unlimited (they pay AWS)
      awsAccounts: 1,
      aiMessages: 50,
      bulkBatchSize: 100,
      members: -1, // Unlimited (we don't gate on team size)
    },
  },
  {
    name: "growth",
    priceId: process.env.STRIPE_GROWTH_PRICE_ID,
    annualDiscountPriceId: process.env.STRIPE_GROWTH_ANNUAL_PRICE_ID,
    limits: {
      emails: -1, // Unlimited (they pay AWS)
      awsAccounts: 3,
      aiMessages: 250,
      bulkBatchSize: 1000,
      members: -1, // Unlimited (we don't gate on team size)
    },
  },
  {
    name: "scale",
    priceId: process.env.STRIPE_SCALE_PRICE_ID,
    annualDiscountPriceId: process.env.STRIPE_SCALE_ANNUAL_PRICE_ID,
    limits: {
      emails: -1, // Unlimited
      awsAccounts: -1, // Unlimited
      aiMessages: 1000,
      bulkBatchSize: 10_000,
      members: -1, // Unlimited
    },
  },
] as const;

export const auth = betterAuth<BetterAuthOptions>({
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { ...schema, ...ssoSchema, ...scimSchema },
  }),
  user: {
    changeEmail: {
      enabled: true,
    },
    deleteUser: {
      enabled: true,
      afterDelete: async (user) => {
        await trackUserDeleted({
          email: user.email,
          name: user.name,
        });
      },
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes — avoids DB query on every getSession call
    },
  },
  trustedOrigins: [
    process.env.CORS_ORIGIN,
    "https://*.okta.com",
    "https://*.oktapreview.com",
    "https://login.microsoftonline.com",
    "https://accounts.google.com",
    "https://*.auth0.com",
  ].filter((v): v is string => !!v),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
    github: {
      clientId: process.env.GITHUB_CLIENT_ID as string,
      clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url }) => {
      try {
        const wraps = await getWrapsClient();
        await wraps.sendTemplate({
          from: process.env.AUTH_EMAIL_FROM as string,
          to: user.email,
          template: "password-reset",
          configurationSetName: process.env.AUTH_EMAIL_CONFIGURATION_SET,
          templateData: {
            privacyUrl: "https://wraps.dev/privacy",
            resetPasswordUrl: url,
            name: user.name,
            email: user.email,
          },
        });
      } catch (error) {
        console.error("Error sending password reset email:", error);
      }
    },
    onPasswordReset: async ({ user }) => {
      try {
        const wraps = await getWrapsClient();
        await wraps.sendTemplate({
          from: process.env.AUTH_EMAIL_FROM as string,
          to: user.email,
          template: "password-changed",
          configurationSetName: process.env.AUTH_EMAIL_CONFIGURATION_SET,
          templateData: {
            name: user.name,
            email: user.email,
          },
        });
      } catch (error) {
        console.error("Error sending password changed email:", error);
      }
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      // Dynamic import to avoid bundling email package in edge/middleware
      const { sendVerificationEmail } = await import(
        "@wraps/email/emails/verification"
      );
      await sendVerificationEmail({
        to: user.email,
        url,
        name: user.name,
      });
    },
  },
  plugins: [
    haveIBeenPwned({
      customPasswordCompromisedMessage:
        "This password has been exposed in a data breach. Please choose a more secure password.",
    }),
    // Upserts the Wraps contact and emits user.signup, which is what triggers
    // the onboarding-rescue workflow. `attribution: true` reads the
    // wraps_attribution cookie the marketing site sets on first touch, so the
    // contact record carries the campaign that produced the signup.
    //
    // Its database hooks are additive — better-auth collects plugin hooks and
    // this file's own `databaseHooks` into one list and runs both.
    wrapsContactSync({
      apiKey: process.env.WRAPS_API_KEY,
      eventName: "user.signup",
      topicSlugs: ["wraps-product-updates"],
      attribution: true,
      properties: (user) => ({
        name: user.name || undefined,
        signupAt: new Date().toISOString(),
        source: "web",
      }),
      onError: (error, { stage }) =>
        console.error(`Wraps contact sync failed (${stage}):`, error),
    }),
    lastLoginMethod({
      storeInDatabase: true,
    }),
    passkey({
      rpID: process.env.PASSKEY_RP_ID || "localhost",
      rpName: process.env.PASSKEY_RP_NAME || "Wraps",
      origin: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    }),
    twoFactor({
      issuer: "Wraps",
    }),
    organization({ ac, roles }),
    // Carried only for SCIM deprovisioning. `banned` is the sole enforced
    // disabled-user state in better-auth, and @better-auth/scim maps SCIM
    // `active: false` onto it — without this plugin the SCIM plugin rejects
    // every IdP deactivate push with 400, and reports every user as active
    // because it reads `active` back from `!user.banned`.
    //
    // Keeping it from becoming a platform-admin surface takes `roles`, not
    // `adminRoles`. `adminRoles` only decides whether a *target* account is
    // treated as an admin (impersonation protection); it is not consulted when
    // authorizing the caller. That goes through `hasPermission`, which resolves
    // `user.role` against this map — and better-auth's default map carries an
    // `admin` role holding cross-tenant list/ban/impersonate/set-password over
    // every user in the database.
    //
    // Handing it only `user` (better-auth's own empty-permission role) means
    // `user.role = "admin"` resolves to nothing and authorizes nothing, so a
    // stray DB edit or a future feature that starts writing `role` cannot open
    // that door by accident. Tenancy stays the organization plugin's job.
    admin({ adminRoles: [], roles: { user: userAc } }),
    inbox(),
    sso({
      domainVerification: { enabled: true },
      organizationProvisioning: { disabled: false, defaultRole: "member" },
      provisionUser: async ({ user, userInfo }) => {
        if (userInfo.given_name || userInfo.family_name) {
          await db
            .update(schema.user)
            .set({
              name:
                [userInfo.given_name, userInfo.family_name]
                  .filter(Boolean)
                  .join(" ") || user.name,
            })
            .where(eq(schema.user.id, user.id));
        }
      },
    }),
    scim({
      // Without this, SCIM `Create` 409s on every email that already has a
      // Wraps user — which is most of an org's team on the day they turn SCIM
      // on. `true` is not an option in a multi-tenant app: it would let any
      // org's SCIM token claim, and then deactivate, an account belonging to
      // someone outside that org purely by pushing their email address.
      linkExistingUsers: { shouldLinkUser: shouldLinkScimUser },
      // A SCIM token is a bearer credential that can enumerate an org's
      // directory and deactivate its people, and the plugin's default is to
      // keep it in `scim_provider.scim_token` in the clear. Hash it: the token
      // is 24 characters of CSPRNG output, so a plain SHA-256 (what the plugin
      // does for "hashed") is the right primitive — there is nothing to brute
      // force and no password-style stretching to justify.
      //
      // "encrypted" was the alternative and is worse here: it is reversible by
      // anyone holding BETTER_AUTH_SECRET, and nothing in Wraps ever needs to
      // read a SCIM token back. The UI already treats them as show-once.
      //
      // One-way, so this invalidates any token minted while the default was in
      // force — a token stored in plain text can never match a hash of itself.
      // Rotating in Settings → SSO & SCIM issues a working one.
      storeSCIMToken: "hashed",
    }),
    bearer(),
    deviceAuthorization({
      verificationUri: "/device",
      expiresIn: "15m",
      interval: "3s",
      userCodeLength: 8,
      validateClient: async (clientId) => clientId === "wraps-cli",
    }),
    // Only include Stripe plugin if the client and webhook secret are both available
    ...(stripeClient && process.env.STRIPE_WEBHOOK_SECRET
      ? [
          stripe({
            stripeClient,
            stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
            onEvent: onStripeEvent,
            subscription: {
              enabled: true,
              getCheckoutSessionParams: (_details, _ctx) => ({
                params: {
                  automatic_tax: {
                    enabled: true,
                  },
                  allow_promotion_codes: true,
                },
              }),
              authorizeReference: async ({ user, referenceId }) => {
                // Verify user is a member of the organization
                const membership = await db.query.member.findFirst({
                  where: (members, { and, eq }) =>
                    and(
                      eq(members.userId, user.id),
                      eq(members.organizationId, referenceId)
                    ),
                });

                if (!membership) {
                  throw new Error(
                    "Unauthorized: You are not a member of this organization"
                  );
                }

                // Optionally: restrict to owners/admins only
                if (
                  membership.role !== "owner" &&
                  membership.role !== "admin"
                ) {
                  throw new Error(
                    "Unauthorized: Only organization owners and admins can manage subscriptions"
                  );
                }

                return true;
              },
              plans: [...subscriptionPlans],
            },
          }),
        ]
      : []),
    // Must stay last: better-auth forwards Set-Cookie into the Next.js cookie
    // store from this plugin's `after` hook, so any plugin listed after it can
    // set a cookie that never reaches the browser.
    nextCookies(),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user, context) => {
          // Track all new user signups (email/password + OAuth)
          // Uses databaseHooks instead of response-level after hook because
          // Better-Auth's after hooks are skipped for OAuth redirect responses.
          try {
            // Detect signup method from the request path
            let method: "email" | "google" | "github" | "passkey" = "email";
            if (context?.path?.includes("/callback/google")) {
              method = "google";
            } else if (context?.path?.includes("/callback/github")) {
              method = "github";
            }

            // Parse marketing attribution from cookie. The Wraps contact and
            // the user.signup event are handled by the wrapsContactSync plugin
            // above; this hook only owns PostHog.
            const attribution = getAttributionFromContext(context);

            await trackPostHogSignup(
              { email: user.email, name: user.name, method },
              attribution
            );
          } catch (error) {
            console.error("Error in user create tracking hook:", error);
          }
        },
      },
      update: {
        // SCIM deactivation. The IdP sends `active: false`, but nothing ever
        // lands on the user row under that name — @better-auth/scim maps it
        // onto the admin plugin's `banned` column before writing. Keyed off
        // `active` this hook never fired once, so a deactivated employee kept
        // every live session until it expired on its own.
        after: async (user) => {
          if ((user as { banned?: boolean | null }).banned === true) {
            await db
              .delete(schema.session)
              .where(eq(schema.session.userId, user.id));
          }
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          // Auto-set active organization to first org user is a member of
          const memberRecord = await db.query.member.findFirst({
            where: (members, { eq: eqFn }) =>
              eqFn(members.userId, session.userId),
            orderBy: (members, { asc }) => [asc(members.createdAt)],
          });

          if (memberRecord) {
            return {
              data: {
                ...session,
                activeOrganizationId: memberRecord.organizationId,
              },
            };
          }

          return { data: session };
        },
        after: async (session) => {
          // Send login alert SMS if new device/IP detected
          try {
            const user = await db.query.user.findFirst({
              where: eq(schema.user.id, session.userId),
            });

            if (user?.loginAlertsEnabled) {
              const isNew = await isNewDeviceOrIp(
                session.userId,
                session.ipAddress ?? undefined,
                session.userAgent ?? undefined
              );

              if (isNew) {
                await createLoginNotification(
                  session.userId,
                  session.ipAddress ?? undefined,
                  session.userAgent ?? undefined
                );

                // SMS only when a phone number is on file
                if (user.phoneNumber) {
                  // Awaited: on Vercel the function can freeze once the
                  // response is sent, cutting off an unawaited send.
                  // sendLoginAlertSms never throws, so auth is unaffected.
                  await sendLoginAlertSms(user.phoneNumber, {
                    ipAddress: session.ipAddress ?? undefined,
                    userAgent: session.userAgent ?? undefined,
                  });
                }
              }
            }

            // Write auth.login audit log for each org the user belongs to
            if (user) {
              await writeLoginAuditLogs(session.userId, session.id, user.email);
            }
          } catch (error) {
            console.error("Error in login alert hook:", error);
          }
        },
      },
    },
  },
});

// Export the Stripe client for use in webhook handlers
export { stripeClient };

export { sendLoginAlertSms } from "./login-alert-sms";
