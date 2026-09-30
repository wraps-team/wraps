import type { awsAccount } from "@wraps/db";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@wraps/ui/components/ui/breadcrumb";
import type { InferSelectModel } from "drizzle-orm";
import Link from "next/link";

type AccountHeaderProps = {
  account: Pick<InferSelectModel<typeof awsAccount>, "name" | "accountId">;
  orgSlug: string;
  region: string;
};

export function AccountHeader({
  account,
  orgSlug,
  region,
}: AccountHeaderProps) {
  return (
    <div className="space-y-3">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/${orgSlug}/settings/aws-accounts`}>
                AWS Accounts
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{account.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div>
        <h1 className="font-bold text-3xl">{account.name}</h1>
        <p className="mt-2 flex items-center gap-2 text-muted-foreground text-sm">
          <span className="font-mono">{account.accountId}</span>
          <span>·</span>
          {/* The one place the region renders: the future region-switcher spot. */}
          <span>{region}</span>
        </p>
      </div>
    </div>
  );
}
