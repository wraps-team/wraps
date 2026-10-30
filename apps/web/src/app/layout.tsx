import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import "./globals.css";

import { Toaster } from "@wraps/ui/components/ui/sonner";
import { cookies } from "next/headers";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/contexts/query-client-context";
import { SessionProvider } from "@/contexts/session-context";
import { SidebarConfigProvider } from "@/contexts/sidebar-context";
import { inter, jetbrainsMono, spaceGrotesk } from "@/lib/fonts";
import { cn } from "@/lib/utils";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: {
    default: "Wraps",
    template: "%s | Wraps",
  },
  description:
    "Deploy production-ready email infrastructure to your AWS account in minutes. Zero stored credentials, beautiful DX, and transparent AWS pricing.",
  icons: {
    // One SVG that switches color itself: Chrome ignores `media` on
    // <link rel="icon"> and takes the last entry, so a light/dark PNG pair
    // shows the white W on a light tab strip.
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("theme")?.value;
  const isDark = themeCookie === "dark";

  return (
    <html
      className={cn(
        "antialiased",
        inter.variable,
        spaceGrotesk.variable,
        jetbrainsMono.variable,
        isDark ? " dark" : ""
      )}
      lang="en"
    >
      <body className={inter.className}>
        <NuqsAdapter>
          <QueryProvider>
            <SessionProvider>
              <ThemeProvider defaultTheme="system" storageKey="nextjs-ui-theme">
                <SidebarConfigProvider>{children}</SidebarConfigProvider>
                <Toaster />
              </ThemeProvider>
              {process.env.VERCEL && <Analytics />}
              {process.env.VERCEL && <SpeedInsights />}
            </SessionProvider>
          </QueryProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
