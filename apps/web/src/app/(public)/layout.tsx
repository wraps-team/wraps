/**
 * Public Layout
 *
 * Layout for public pages that don't require authentication.
 * Used for unsubscribe/preferences pages accessed via email links.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: "noindex, nofollow", // Don't index preference pages
};

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <main className="pb-16">{children}</main>
      <footer className="fixed right-0 bottom-0 left-0 py-4 text-center">
        <a
          className="text-gray-400 text-xs transition-colors hover:text-gray-500"
          href="https://wraps.dev"
          rel="noopener noreferrer"
          target="_blank"
        >
          Powered by Wraps
        </a>
      </footer>
    </div>
  );
}
