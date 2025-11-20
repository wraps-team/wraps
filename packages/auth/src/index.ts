import { db } from "@wraps/db";
import * as schema from "@wraps/db/schema/auth";
import { type BetterAuthOptions, betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import {
  haveIBeenPwned,
  lastLoginMethod,
  organization,
} from "better-auth/plugins";
import { passkey } from "better-auth/plugins/passkey";
import { twoFactor } from "better-auth/plugins/two-factor";
import { stripe } from "@better-auth/stripe";
import Stripe from "stripe";

// Initialize Stripe client
const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-12-18.acacia",
  typescript: true,
});

export const auth = betterAuth<BetterAuthOptions>({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  trustedOrigins: [process.env.CORS_ORIGIN || ""],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Set to true when ready to enforce
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
      });
    },
  },
  plugins: [
    nextCookies(),
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
    organization(),
    stripe({
      stripeClient,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
      plans: [
        {
          name: "pro",
          priceId: process.env.STRIPE_PRO_PRICE_ID || "",
          annualDiscountPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
          limits: {
            emails: 100000, // 100k emails/month
            awsAccounts: 3,
            members: 10,
          },
          freeTrial: {
            days: 14,
          },
        },
        {
          name: "enterprise",
          priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || "",
          annualDiscountPriceId: process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID,
          limits: {
            emails: -1, // Unlimited
            awsAccounts: -1, // Unlimited
            members: -1, // Unlimited
          },
        },
      ],
      onSubscriptionComplete: async ({ subscription, user }) => {
        console.log(`Subscription created for user ${user.id}:`, subscription);
        // Could send welcome email here
      },
      onSubscriptionUpdate: async ({ subscription, user }) => {
        console.log(`Subscription updated for user ${user.id}:`, subscription);
      },
      onSubscriptionCancel: async ({ subscription, user }) => {
        console.log(`Subscription canceled for user ${user.id}:`, subscription);
      },
    }),
  ],
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          // Auto-set active organization to first org user is a member of
          const member = await db.query.member.findFirst({
            where: (members, { eq }) => eq(members.userId, session.userId),
            orderBy: (members, { asc }) => [asc(members.createdAt)],
          });

          if (member) {
            return {
              data: {
                ...session,
                activeOrganizationId: member.organizationId,
              },
            };
          }

          return { data: session };
        },
      },
    },
  },
});
