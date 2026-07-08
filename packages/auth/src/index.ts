import { passkey } from "@better-auth/passkey";
import { scim } from "@better-auth/scim";
import { sso } from "@better-auth/sso";
import { stripe } from "@better-auth/stripe";
import { auditLog, db, eq, member } from "@wraps/db";
import * as schema from "@wraps/db/schema/auth";
import * as scimSchema from "@wraps/db/schema/scim-provider";
import * as ssoSchema from "@wraps/db/schema/sso-provider";
import { getWrapsClient } from "@wraps/email";
import { createPlatformClient } from "@wraps.dev/client";
import { WrapsSMS } from "@wraps.dev/sms";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import {
  bearer,
  deviceAuthorization,
  haveIBeenPwned,
  lastLoginMethod,
  organization,
  twoFactor,
} from "better-auth/plugins";
import { inbox } from "better-inbox";
import { desc } from "drizzle-orm";
import { PostHog } from "posthog-node";
import Stripe from "stripe";
import { ac, roles } from "./access";
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
 * Track user signup event for welcome automation.
 * Creates the contact if needed, then emits the user.signup event.
 * Non-blocking - failures are logged but don't affect auth flow.
 */
async function trackUserSignup(
  user: { email: string; name: string | null },
  attribution?: Attribution | null
) {
  try {
    const apiKey = process.env.WRAPS_API_KEY;
    if (!apiKey) {
      console.warn("WRAPS_API_KEY not configured, skipping signup event");
      return;
    }

    const client = createPlatformClient({ apiKey });
    const normalizedEmail = user.email.toLowerCase().trim();

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

    // Create/upsert the contact first (required for events)
    // Subscribe to product updates topic for announcements
    const { error: contactError } = await client.POST("/v1/contacts/", {
      body: {
        email: normalizedEmail,
        emailStatus: "active",
        properties: {
          name: user.name || undefined,
          signupAt: new Date().toISOString(),
          source: "web",
          ...safeAttribution,
        },
        topicSlugs: ["wraps-product-updates"],
      },
    });

    if (contactError) {
      // Contact might already exist (e.g., from waitlist), that's OK
    }

    // Now emit the signup event
    const { error: eventError } = await client.POST("/v1/events/", {
      body: {
        name: "user.signup",
        contactEmail: normalizedEmail,
        properties: {
          name: user.name || undefined,
          signupAt: new Date().toISOString(),
          source: "web",
          ...safeAttribution,
        },
      },
    });

    if (eventError) {
      console.error("Failed to track user.signup event:", eventError);
    }
  } catch (err) {
    console.error("Error tracking user.signup event:", err);
  }
}

/**
 * Send login alert SMS when a new device or IP is detected.
 * Non-blocking - failures are logged but don't affect auth flow.
 */
async function sendLoginAlertSms(
  phoneNumber: string,
  details: { ipAddress?: string; userAgent?: string }
) {
  try {
    // Parse user agent for a friendly device description
    const deviceInfo = parseUserAgent(details.userAgent);

    const message = `[Wraps.dev] New login detected from ${deviceInfo}${details.ipAddress ? ` (IP: ${details.ipAddress})` : ""}. If this wasn't you, secure your account immediately.`;

    const sms = new WrapsSMS();
    await sms.send({
      to: phoneNumber,
      message,
      messageType: "TRANSACTIONAL",
    });

    console.info(
      JSON.stringify({
        msg: "Login alert SMS sent",
        phone: `${phoneNumber.slice(0, 6)}***`,
      })
    );
  } catch (error) {
    console.error("Failed to send login alert SMS:", error);
  }
}

/**
 * Parse user agent string into a friendly device description.
 */
function parseUserAgent(userAgent?: string): string {
  if (!userAgent) {
    return "unknown device";
  }

  // Simple parsing - could use a library like ua-parser-js for more detail
  if (userAgent.includes("iPhone")) {
    return "iPhone";
  }
  if (userAgent.includes("iPad")) {
    return "iPad";
  }
  if (userAgent.includes("Android")) {
    return "Android device";
  }
  if (userAgent.includes("Mac")) {
    return "Mac";
  }
  if (userAgent.includes("Windows")) {
    return "Windows PC";
  }
  if (userAgent.includes("Linux")) {
    return "Linux";
  }
  if (userAgent.includes("Chrome")) {
    return "Chrome browser";
  }
  if (userAgent.includes("Firefox")) {
    return "Firefox browser";
  }
  if (userAgent.includes("Safari")) {
    return "Safari browser";
  }

  return "new device";
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
    nextCookies(),
    inbox(),
    haveIBeenPwned({
      customPasswordCompromisedMessage:
        "This password has been exposed in a data breach. Please choose a more secure password.",
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
    scim({}),
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

            // Parse marketing attribution from cookie
            const attribution = getAttributionFromContext(context);

            await Promise.allSettled([
              trackUserSignup(
                { email: user.email, name: user.name },
                attribution
              ),
              trackPostHogSignup(
                { email: user.email, name: user.name, method },
                attribution
              ),
            ]);
          } catch (error) {
            console.error("Error in user create tracking hook:", error);
          }
        },
      },
      update: {
        after: async (user) => {
          if ((user as { active?: boolean }).active === false) {
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

            // Only send if user has phone number and login alerts enabled
            if (user?.phoneNumber && user?.loginAlertsEnabled) {
              const isNew = await isNewDeviceOrIp(
                session.userId,
                session.ipAddress ?? undefined,
                session.userAgent ?? undefined
              );

              if (isNew) {
                // Fire and forget - don't block auth flow
                sendLoginAlertSms(user.phoneNumber, {
                  ipAddress: session.ipAddress ?? undefined,
                  userAgent: session.userAgent ?? undefined,
                });
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
