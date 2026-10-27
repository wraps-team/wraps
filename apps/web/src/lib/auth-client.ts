import { passkeyClient } from "@better-auth/passkey/client";
import { ssoClient } from "@better-auth/sso/client";
import { stripeClient } from "@better-auth/stripe/client";
import { inboxClient } from "@byo-oss/notifications/client";
import {
  deviceAuthorizationClient,
  lastLoginMethodClient,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL:
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "/"),
  plugins: [
    deviceAuthorizationClient(),
    lastLoginMethodClient(),
    passkeyClient(),
    twoFactorClient(),
    organizationClient(),
    inboxClient(),
    stripeClient({
      subscription: true,
    }),
    ssoClient({ domainVerification: { enabled: true } }),
  ],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  organization: useOrganization,
} = authClient;
