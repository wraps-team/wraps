import type { awsAccount } from "@wraps/db";
import type { AccountRegionalView } from "./load-account";

type AwsAccountRow = typeof awsAccount.$inferSelect;

/**
 * The only shape of an AWS account that may cross into a client component.
 * An explicit allowlist, never a spread: server→client props are serialized
 * into the page payload whole, whatever their TypeScript type says, so a
 * column added to aws_account must not reach the browser by default.
 * webhookSecret authenticates the SES webhook — only its presence is exposed.
 */
export type ClientAccount = Pick<
  AwsAccountRow,
  | "id"
  | "organizationId"
  | "accountId"
  | "name"
  | "region"
  | "roleArn"
  | "externalId"
  | "updatedAt"
  | "features"
  | "healthDetail"
  | "dailyQuotaReserve"
> & {
  webhookConnected: boolean;
};

export function toClientAccount(
  row: AwsAccountRow,
  regional: AccountRegionalView
): ClientAccount {
  return {
    id: row.id,
    organizationId: row.organizationId,
    accountId: row.accountId,
    name: row.name,
    region: row.region,
    roleArn: row.roleArn,
    externalId: row.externalId,
    updatedAt: row.updatedAt,
    features: regional.features,
    healthDetail: regional.healthDetail,
    dailyQuotaReserve: regional.dailyQuotaReserve,
    webhookConnected: regional.webhookConnected,
  };
}
