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
    <div className="min-h-screen bg-gray-50">
      <main>{children}</main>
      <footer className="py-8 text-center text-gray-500 text-sm">
        <p>Powered by Wraps</p>
      </footer>
    </div>
  );
}
