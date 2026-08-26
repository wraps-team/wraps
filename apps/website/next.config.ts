import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig = {
  allowedDevOrigins: ["website.wraps.localhost", "*.wraps.localhost"],

  // Emit browser source maps so PostHog can resolve minified stack traces.
  // Public exposure is acceptable — this site is AGPLv3 open source.
  // For private apps, use @posthog/cli sourcemap upload in CI instead.
  productionBrowserSourceMaps: true,

  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "@radix-ui/react-icons",
      "@radix-ui/react-accordion",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-popover",
      "@radix-ui/react-select",
      "@radix-ui/react-tabs",
      "@radix-ui/react-tooltip",
      "motion",
      "recharts",
      "date-fns",
      "@icons-pack/react-simple-icons",
    ],
  },

  // Image optimization
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "ui.shadcn.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
    formats: ["image/webp", "image/avif"],
  },

  // Headers for better security and performance
  async headers() {
    return [
      {
        source: "/",
        headers: [
          {
            key: "Link",
            value:
              '</docs>; rel="service-doc", </.well-known/api-catalog>; rel="api-catalog", </llms.txt>; rel="alternate"; type="text/plain"; title="llms.txt", </.well-known/mcp.json>; rel="describedby"; type="application/json"; title="MCP server manifest"',
          },
        ],
      },
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

  async rewrites() {
    return [
      // A2A moved the agent card to /.well-known/agent-card.json in v0.3.
      // A rewrite rather than a redirect: both URLs serve the same bytes with
      // no hop, and clients that only know one path find it.
      {
        source: "/.well-known/agent-card.json",
        destination: "/.well-known/agent.json",
      },
    ];
  },

  // Redirects for better SEO
  async redirects() {
    return [
      {
        source: "/calculator",
        destination: "/tools/ses-calculator",
        permanent: true,
      },
      // Predictable URLs for developer resources. Agents guess these names
      // before they read llms.txt, and a guess that 404s reads as "no API".
      {
        source: "/openapi.json",
        destination: "https://api.wraps.dev/swagger/json",
        permanent: false,
      },
      {
        source: "/api-docs",
        destination: "/docs/reference/api",
        permanent: true,
      },
      {
        source: "/docs/api",
        destination: "/docs/reference/api",
        permanent: true,
      },
      {
        source: "/api-reference",
        destination: "/docs/reference/api",
        permanent: true,
      },
      {
        source: "/webhooks",
        destination: "/docs/guides/webhooks",
        permanent: true,
      },
      {
        source: "/mcp.json",
        destination: "/.well-known/mcp.json",
        permanent: true,
      },
      { source: "/llms", destination: "/llms.txt", permanent: true },
    ];
  },
} satisfies NextConfig;

// Cast needed: @next/bundle-analyzer resolves NextConfig from next@15, website uses next@16
export default withBundleAnalyzer(
  nextConfig as Parameters<typeof withBundleAnalyzer>[0]
);
