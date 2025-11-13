import {
  organizationClient,
  passkeyClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  plugins: [passkeyClient(), twoFactorClient(), organizationClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
