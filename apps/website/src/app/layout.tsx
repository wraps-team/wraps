import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AnalyticsProvider } from "@/components/analytics-provider";
import { AttributionLinks } from "@/components/attribution-links";
import { JsonLd } from "@/components/json-ld";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeShortcut } from "@/components/theme-shortcut";
import { WebMCP } from "@/components/webmcp";
import { SidebarConfigProvider } from "@/contexts/sidebar-context";
import { InViewProvider } from "@/hooks/use-shared-in-view";
import { inter, jetbrainsMono, spaceGrotesk } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://wraps.dev"),
  title: {
    default: "Wraps - The Email Platform That Sends Through Your AWS",
    template: "%s | Wraps",
  },
  description:
    "Write email templates as React components. Define automations as TypeScript. Review in PRs, deploy with your app. Your marketing team edits and sends without code.",
  openGraph: {
    type: "website",
    siteName: "Wraps",
    title: "Wraps - The Email Platform That Sends Through Your AWS",
    description:
      "Write email templates as React components. Define automations as TypeScript. Review in PRs, deploy with your app. Your marketing team edits and sends without code.",
    url: "https://wraps.dev/",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Wraps — Email infrastructure, deployed to your own AWS.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@useWraps",
    title: "Wraps - The Email Platform That Sends Through Your AWS",
    description:
      "Write email templates as React components. Define automations as TypeScript. Review in PRs, deploy with your app. Your marketing team edits and sends without code.",
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon-light.png", media: "(prefers-color-scheme: light)" },
      { url: "/favicon-dark.png", media: "(prefers-color-scheme: dark)" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

// Inline script to prevent flash of unstyled content (FOUC) for dark mode
// This runs synchronously before React hydration to set the correct theme class
const themeScript = `
(function() {
  const storageKey = 'wraps-ui-theme';
  const theme = localStorage.getItem(storageKey);
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolvedTheme = theme === 'dark' || (theme === 'system' && systemDark) || (!theme && systemDark) ? 'dark' : 'light';
  document.documentElement.classList.add(resolvedTheme);
  document.documentElement.style.colorScheme = resolvedTheme;
})();
`;

// Organization structured data for SEO.
// `address` is deliberately region-level: the registered jurisdiction is what
// /terms and /privacy already state, and schema.org must not claim more than
// the published record does.
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": "https://wraps.dev/#organization",
  name: "Wraps",
  alternateName: ["Wraps.dev", "Wraps Email"],
  url: "https://wraps.dev",
  logo: "https://wraps.dev/logo.png",
  email: "support@wraps.dev",
  description:
    "Email infrastructure platform that deploys to your AWS account. AWS pricing with modern developer experience.",
  sameAs: [
    "https://github.com/wraps-team/wraps",
    "https://twitter.com/useWraps",
  ],
  address: {
    "@type": "PostalAddress",
    addressRegion: "CO",
    addressCountry: "US",
  },
  contactPoint: [
    {
      "@type": "ContactPoint",
      email: "support@wraps.dev",
      contactType: "customer support",
      url: "https://wraps.dev/contact",
      availableLanguage: ["English"],
    },
    {
      "@type": "ContactPoint",
      email: "support@wraps.dev",
      contactType: "technical support",
      url: "https://wraps.dev/docs",
      availableLanguage: ["English"],
    },
  ],
};

// Names the site itself, so a brand-name query has something to match beyond
// page titles.
const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": "https://wraps.dev/#website",
  name: "Wraps",
  alternateName: ["Wraps.dev", "Wraps Email Infrastructure"],
  url: "https://wraps.dev",
  description:
    "Wraps deploys email (AWS SES), SMS, and CDN infrastructure into your own AWS account with one command. CLI, TypeScript SDKs, MCP server, and a dashboard.",
  inLanguage: "en-US",
  publisher: { "@id": "https://wraps.dev/#organization" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} antialiased`}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script suppressHydrationWarning>{themeScript}</script>
        <link
          href="/llms.txt"
          rel="alternate"
          title="Wraps docs index for LLMs"
          type="text/plain"
        />
        <link
          href="/llms-full.txt"
          rel="alternate"
          title="Complete Wraps docs for LLMs"
          type="text/plain"
        />
        <JsonLd data={organizationSchema} />
        <JsonLd data={websiteSchema} />
      </head>
      <body className={inter.className}>
        <NuqsAdapter>
          <ThemeProvider defaultTheme="system" storageKey="wraps-ui-theme">
            <ThemeShortcut />
            <AnalyticsProvider>
              <InViewProvider>
                <SidebarConfigProvider>{children}</SidebarConfigProvider>
              </InViewProvider>
            </AnalyticsProvider>
          </ThemeProvider>
        </NuqsAdapter>
        <AttributionLinks />
        <WebMCP />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
