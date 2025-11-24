"use client";

import { useQueryState } from "nuqs";
import { OrganizationSettingsAwsAccounts } from "@/components/organization-settings-aws-accounts";
import { OrganizationSettingsBilling } from "@/components/organization-settings-billing";
import { OrganizationSettingsGeneral } from "@/components/organization-settings-general";
import { OrganizationSettingsMembers } from "@/components/organization-settings-members";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type OrganizationSettingsTabsProps = {
  organization: {
    id: string;
    name: string;
    slug: string | null;
    logo: string | null;
  };
  userRole: "owner" | "admin" | "member";
};

export function OrganizationSettingsTabs({
  organization,
  userRole,
}: OrganizationSettingsTabsProps) {
  const [activeTab, setActiveTab] = useQueryState("tab", {
    defaultValue: "general",
  });

  return (
    <Tabs onValueChange={setActiveTab} value={activeTab}>
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="aws-accounts">AWS Accounts</TabsTrigger>
        <TabsTrigger value="members">Members</TabsTrigger>
        <TabsTrigger value="billing">Billing</TabsTrigger>
      </TabsList>
      <TabsContent className="mt-6" value="general">
        <OrganizationSettingsGeneral
          organization={organization}
          userRole={userRole}
        />
      </TabsContent>
      <TabsContent className="mt-6" value="aws-accounts">
        <OrganizationSettingsAwsAccounts
          organization={organization}
          userRole={userRole}
        />
      </TabsContent>
      <TabsContent className="mt-6" value="members">
        <OrganizationSettingsMembers
          organization={organization}
          userRole={userRole}
        />
      </TabsContent>
      <TabsContent className="mt-6" value="billing">
        <OrganizationSettingsBilling
          organization={organization}
          userRole={userRole}
        />
      </TabsContent>
    </Tabs>
  );
}
