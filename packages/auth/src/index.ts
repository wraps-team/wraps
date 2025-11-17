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
      const { sendVerificationEmail } = await import("@wraps/email");
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
