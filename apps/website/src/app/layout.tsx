import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { AnalyticsProvider } from "@/components/analytics-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarConfigProvider } from "@/contexts/sidebar-context";
import { InViewProvider } from "@/hooks/use-shared-in-view";
import { inter } from "@/lib/fonts";
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
        url: "/og-image.webp",
        width: 712,
        height: 376,
        alt: "Wraps - AWS Infrastructure Wrappers Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@useWraps",
    title: "Wraps - The Email Platform That Sends Through Your AWS",
    description:
      "Write email templates as React components. Define automations as TypeScript. Review in PRs, deploy with your app. Your marketing team edits and sends without code.",
    images: ["/og-image.webp"],
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

// Organization structured data for SEO
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Wraps",
  url: "https://wraps.dev",
  logo: "https://wraps.dev/logo.png",
  description:
    "Email infrastructure platform that deploys to your AWS account. AWS pricing with modern developer experience.",
  sameAs: [
    "https://github.com/wraps-team/wraps",
    "https://twitter.com/useWraps",
  ],
  contactPoint: {
    "@type": "ContactPoint",
    email: "support@wraps.dev",
    contactType: "customer support",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      className={`${inter.variable} antialiased`}
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: themeScript }}
          suppressHydrationWarning
        />
        <script
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema),
          }}
          type="application/ld+json"
        />
      </head>
      <body className={inter.className}>
        <NuqsAdapter>
          <ThemeProvider defaultTheme="system" storageKey="wraps-ui-theme">
            <AnalyticsProvider>
              <InViewProvider>
                <SidebarConfigProvider>{children}</SidebarConfigProvider>
              </InViewProvider>
            </AnalyticsProvider>
          </ThemeProvider>
        </NuqsAdapter>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
