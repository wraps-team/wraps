"use client";

import type { organization } from "@wraps/db";
import type { InferSelectModel } from "drizzle-orm";
import { useRouter } from "next/navigation";

interface OrganizationSwitcherProps {
  organizations: InferSelectModel<typeof organization>[];
  activeOrganizationId: string;
}

export function OrganizationSwitcher({
  organizations,
  activeOrganizationId,
}: OrganizationSwitcherProps) {
  const router = useRouter();

  const handleChange = (organizationId: string) => {
    router.push(`/dashboard/organizations/${organizationId}`);
  };

  const activeOrg = organizations.find(
    (org) => org.id === activeOrganizationId
  );

  return (
    <div className="relative w-full max-w-xs">
      <select
        className="w-full appearance-none rounded-lg border border-input bg-background px-4 py-2 pr-10 text-sm focus:border-transparent focus:ring-2 focus:ring-ring"
        onChange={(e) => handleChange(e.target.value)}
        value={activeOrganizationId}
      >
        {organizations.map((org) => (
          <option key={org.id} value={org.id}>
            {org.name}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3">
        <svg
          className="h-4 w-4 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            d="M8 9l4 4 4-4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
          />
        </svg>
      </div>
    </div>
  );
}
