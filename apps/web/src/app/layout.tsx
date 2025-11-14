import type { Metadata } from "next";
import "./globals.css";

import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/contexts/query-client-context";
import { SessionProvider } from "@/contexts/session-context";
import { SidebarConfigProvider } from "@/contexts/sidebar-context";
import { inter } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "Shadcn Dashboard",
  description: "A dashboard built with Next.js and shadcn/ui",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html className={`${inter.variable} antialiased`} lang="en">
      <body className={inter.className}>
        <QueryProvider>
          <SessionProvider>
            <ThemeProvider defaultTheme="system" storageKey="nextjs-ui-theme">
              <SidebarConfigProvider>{children}</SidebarConfigProvider>
            </ThemeProvider>
          </SessionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
