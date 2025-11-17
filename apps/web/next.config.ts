import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: ["lucide-react", "@radix-ui/react-icons"],
  },

  // Mark server-only packages to prevent bundling in edge/client
  serverExternalPackages: ["@wraps.dev/email", "@wraps/email"],

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

export default nextConfig;
