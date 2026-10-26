import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { web } from "@e2e-dev/web";
import { gateway } from "ai";
import type { E2EConfig } from "e2e";

// The dashboard's .env.local already holds the AI Gateway key the agent steps need.
const webEnv = parseEnv(readFileSync("../web/.env.local", "utf8"));
process.env.AI_GATEWAY_API_KEY ??= webEnv.AI_GATEWAY_API_KEY;

let signupPassword: string | undefined;

export default {
  targets: [
    {
      name: "chromium",
      engine: web({ viewport: { width: 1440, height: 900 } }),
      app: {
        url: "http://127.0.0.1:0",
        // Never reuse a running dev server: these overrides are what make a
        // throwaway signup safe. Empty strings beat .env.local in Next's loader.
        command: {
          executable: "pnpm",
          args: [
            "exec",
            "next",
            "dev",
            "--turbopack",
            "--hostname",
            "127.0.0.1",
            "--port",
            "{port}",
          ],
          cwd: "../web",
          env: {
            BETTER_AUTH_URL: "http://127.0.0.1:{port}",
            NEXT_PUBLIC_APP_URL: "http://127.0.0.1:{port}",
            // Signup is Turnstile-gated; both empty is the supported no-captcha config.
            NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
            TURNSTILE_SECRET_KEY: "",
            // Without these, every signup lands in Wraps' own org as a contact,
            // starts the welcome series, and posts to the production PostHog project.
            WRAPS_API_KEY: "",
            NEXT_PUBLIC_POSTHOG_KEY: "",
          },
          startupTimeout: 180_000,
          log: ".e2e/logs/app.log",
        },
        readyUrl: "http://127.0.0.1:{port}/auth",
      },
    },
  ],
  agents: {
    default: {
      model: gateway("anthropic/claude-sonnet-5.5"),
      context:
        "This is the Wraps dashboard: email, SMS, and contact management on the customer's own AWS account. An organization is a workspace. The test account has no AWS account connected and is on the Free plan.",
    },
  },
  secrets: {
    // A fresh password per run: the signup form rejects breached passwords.
    "signup-password": () => {
      signupPassword ??= randomBytes(18).toString("base64url");
      return signupPassword;
    },
  },
  timeout: 180_000,
  workers: 1,
  video: "retain-on-failure",
} satisfies E2EConfig;
