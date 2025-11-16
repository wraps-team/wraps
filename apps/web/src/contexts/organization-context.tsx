"use client";

import type { organization } from "@wraps/db";
import type { InferSelectModel } from "drizzle-orm";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { authClient } from "@/lib/auth-client";

type OrganizationContextValue = {
  activeOrganization: InferSelectModel<typeof organization> | null;
  isLoading: boolean;
  setActiveOrganization: (orgSlug: string) => Promise<void>;
  organizations: InferSelectModel<typeof organization>[];
  userRole: "owner" | "admin" | "member" | null;
};

const OrganizationContext = createContext<OrganizationContextValue | undefined>(
  undefined
);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: activeOrgData, isPending } = authClient.useActiveOrganization();
  const [organizations, setOrganizations] = useState<
    InferSelectModel<typeof organization>[]
  >([]);

  // Fetch all user's organizations
  useEffect(() => {
    const fetchOrganizations = async () => {
      const { data } = await authClient.organization.list();
      if (data) {
        // Map the better-auth organization format to our database format
        const orgs = data.map((item: any) => ({
          id: item.id,
          name: item.name,
          slug: item.slug || null,
          logo: item.logo || null,
          metadata: item.metadata || null,
          createdAt: new Date(item.createdAt),
        }));
        setOrganizations(orgs);
      }
    };

    fetchOrganizations();
  }, []);

  const setActiveOrganization = async (orgSlug: string) => {
    const { data, error } = await authClient.organization.setActive({
      organizationSlug: orgSlug,
    });

    if (!error && data) {
      // Navigate to the organization's dashboard
      router.push(`/${orgSlug}`);
      router.refresh();
    }
  };

  // Map better-auth organization to our format
  // Check if activeOrgData has the organization nested or if it IS the organization
  const activeOrg = activeOrgData
    ? (() => {
        const orgData = (activeOrgData as any).organization || activeOrgData;
        return {
          id: orgData.id,
          name: orgData.name,
          slug: orgData.slug || null,
          logo: orgData.logo || null,
          metadata: orgData.metadata || null,
          createdAt: orgData.createdAt
            ? new Date(orgData.createdAt)
            : new Date(),
        };
      })()
    : null;

  const value: OrganizationContextValue = {
    activeOrganization: activeOrg,
    isLoading: isPending,
    setActiveOrganization,
    organizations,
    userRole: ((activeOrgData as any)?.role ?? null) as
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
