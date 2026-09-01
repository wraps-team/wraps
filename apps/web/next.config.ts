import { withPostHogConfig } from "@posthog/nextjs-config";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import { MAX_IMPORT_PAYLOAD_BYTES } from "./src/lib/csv-parse";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["web.wraps.localhost", "*.wraps.localhost"],

  // Required for PostHog error tracking to symbolicate stack traces
  productionBrowserSourceMaps: true,

  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-icons"],

    // The contact importer posts every mapped row to a Server Action in one
    // body. The 1 MB default rejected real customer files at the framework
    // boundary, before the action could say anything useful — so this tracks
    // the same constant the importer checks in the browser.
    serverActions: {
      bodySizeLimit: MAX_IMPORT_PAYLOAD_BYTES,
    },
  },

  // Mark server-only packages to prevent bundling in edge/client
  serverExternalPackages: [
    "@wraps.dev/email",
    "@wraps/email",
    "esbuild",
    "pino",
    "pino-pretty",
  ],

  // Image optimization
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "ui.shadcn.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
      // Vercel Blob Storage for organization logos
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
    formats: ["image/webp", "image/avif"],
  },

  // Headers for better security and performance
  headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "origin-when-cross-origin",
          },
        ],
      },
    ];
  },

  // Redirects for better SEO
  redirects() {
    return [];
  },
};

// PostHog source map upload configuration
// Requires POSTHOG_PERSONAL_API_KEY and POSTHOG_ENV_ID env vars
// Restricted to CI so local builds don't upload sourcemaps (and their
// symbol sets) on every run
const hasPostHogCredentials =
  process.env.POSTHOG_PERSONAL_API_KEY &&
  process.env.POSTHOG_ENV_ID &&
  Boolean(process.env.CI || process.env.VERCEL);

const postHogWrapped = hasPostHogCredentials
  ? withPostHogConfig(nextConfig, {
      personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY!,
      envId: process.env.POSTHOG_ENV_ID!,
      sourcemaps: {
        enabled: true,
        project: "wraps-web",
        deleteAfterUpload: true,
      },
    })
  : nextConfig;

export default withSentryConfig(postHogWrapped, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  silent: !process.env.CI,

  webpack: {
    automaticVercelMonitors: true,
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
