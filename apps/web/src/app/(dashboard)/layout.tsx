import { auth } from "@wraps/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type React from "react";
import { OrganizationProvider } from "@/contexts/organization-context";
import { DashboardShell } from "./dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The only await above the shell. better-auth's cookie cache
  // (packages/auth/src/index.ts:534-539, maxAge 5min) answers this from a
  // signed cookie on the hot path, so the shell is not held behind a query.
  //
  // The organizations query that used to live here has moved to the client:
  // OrganizationProvider already calls authClient.organization.list() on
  // mount and OrganizationSwitcher already renders a skeleton until the
  // active org is known. Seeding those props server-side cost a database
  // round-trip *above* the shell, which meant the whole application sat
  // behind the root full-screen loader while it ran.
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/auth");
  }

  return (
    <OrganizationProvider>
      <DashboardShell>{children}</DashboardShell>
    </OrganizationProvider>
  );
}
