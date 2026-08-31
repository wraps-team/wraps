"use client";

import type { organization } from "@wraps/db";
import type { InferSelectModel } from "drizzle-orm";
import { useParams, useRouter } from "next/navigation";
import posthog from "posthog-js";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { authClient } from "@/lib/auth-client";

type OrganizationContextValue = {
  activeOrganization: InferSelectModel<typeof organization> | null;
  isLoading: boolean;
  setActiveOrganization: (orgSlug: string) => Promise<void>;
  organizations: InferSelectModel<typeof organization>[];
  userRole: string | null;
};

const OrganizationContext = createContext<OrganizationContextValue | undefined>(
  undefined
);

type Org = InferSelectModel<typeof organization>;

// Normalize org shape from either better-auth client responses (string dates,
// possibly nested under `.organization`) or server-rendered Drizzle rows.
function mapOrg(item: any): Org {
  return {
    id: item.id,
    name: item.name,
    slug: item.slug || null,
    logo: item.logo || null,
    brandColor: item.brandColor || null,
    metadata: item.metadata || null,
    stripeOrganizationId: item.stripeOrganizationId || null,
    createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
  } as Org;
}

export function OrganizationProvider({
  children,
  initialOrganizations = [],
  initialActiveOrganization = null,
  initialUserRole = null,
}: {
  children: ReactNode;
  initialOrganizations?: Org[];
  initialActiveOrganization?: Org | null;
  initialUserRole?: string | null;
}) {
  const router = useRouter();
  const params = useParams<{ orgSlug?: string }>();
  const { data: activeOrgData, isPending } = authClient.useActiveOrganization();
  const [organizations, setOrganizations] =
    useState<Org[]>(initialOrganizations);
  const autoSetAttempted = useRef(false);

  // Refresh the org list in the background; seeded from server data so the
  // switcher renders immediately without waiting on this request.
  useEffect(() => {
    const fetchOrganizations = async () => {
      const { data } = await authClient.organization.list();
      if (data) {
        setOrganizations(data.map(mapOrg));
      }
    };

    fetchOrganizations();
  }, []);

  // Identify organization group in PostHog when active org changes
  useEffect(() => {
    if (!activeOrgData) {
      return;
    }
    const orgData = (activeOrgData as any).organization || activeOrgData;
    if (orgData?.id) {
      posthog.group("organization", orgData.id, {
        name: orgData.name,
        slug: orgData.slug,
      });
    }
  }, [activeOrgData]);

  // Auto-set active org from URL when session has no active org
  // (e.g., after deleting the previously active org)
  useEffect(() => {
    if (isPending || activeOrgData || autoSetAttempted.current) {
      return;
    }
    if (!params.orgSlug) {
      return;
    }

    autoSetAttempted.current = true;
    authClient.organization.setActive({
      organizationSlug: params.orgSlug,
    });
  }, [isPending, activeOrgData, params.orgSlug]);

  const setActiveOrganization = async (orgSlug: string) => {
    const { data, error } = await authClient.organization.setActive({
      organizationSlug: orgSlug,
    });

    if (!error && data) {
      router.push(`/${orgSlug}/emails`);
    }
  };

  // Prefer live client data; fall back to server-rendered initial data so the
  // switcher paints real content on first load instead of a skeleton.
  const liveActiveOrg = activeOrgData
    ? mapOrg((activeOrgData as any).organization || activeOrgData)
    : null;
  const activeOrg = liveActiveOrg ?? initialActiveOrganization;

  // better-auth's getFullOrganization payload has no top-level `role` — the
  // role lives on the member row. Derive it here rather than seeding it from
  // the server, so the dashboard layout does not have to run an organizations
  // query above the shell.
  const { data: sessionData } = authClient.useSession();
  const currentUserId = sessionData?.user?.id;
  const derivedRole =
    (activeOrgData as any)?.members?.find(
      (m: { userId?: string }) => m.userId === currentUserId
    )?.role ?? null;

  const value: OrganizationContextValue = {
    activeOrganization: activeOrg,
    // Only "loading" when we have neither client nor server data yet.
    isLoading: !activeOrg && isPending,
    setActiveOrganization,
    organizations,
    userRole: (derivedRole ?? initialUserRole ?? null) as
      | "owner"
      | "admin"
      | "member"
      | null,
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useActiveOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error(
      "useActiveOrganization must be used within an OrganizationProvider"
    );
  }
  return context;
}
