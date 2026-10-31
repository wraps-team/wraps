import type { awsAccount } from "@wraps/db";
import { Ban, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { getSuppressedAddress } from "@/lib/aws/ses-suppression";
import { hubHref } from "@/lib/emails-hub";
import { logger } from "@/lib/logger";
import {
  formatFullTimestamp,
  formatShortTimestamp,
} from "../../lib/timestamps";
import type { HardBounce } from "../hard-bounce";
import { SuppressAddressButton } from "./suppress-address-button";

type AwsAccountRow = typeof awsAccount.$inferSelect;

/**
 * SES writes the suppression a moment after the bounce, and the two clocks are
 * not the same. An entry updated this long before the bounce predates it.
 */
const PREDATES_BOUNCE_MS = 60_000;

type Lookup =
  | {
      status: "listed";
      reason: "BOUNCE" | "COMPLAINT";
      lastUpdated: number;
    }
  | { status: "not_listed" }
  | { status: "unknown" };

async function lookUp(
  account: AwsAccountRow,
  address: string
): Promise<Lookup> {
  try {
    const result = await getSuppressedAddress({ account, email: address });
    if (result.status === "found") {
      return {
        status: "listed",
        reason: result.address.reason,
        lastUpdated: new Date(result.address.lastUpdated).getTime(),
      };
    }
    return result.status === "not_found"
      ? { status: "not_listed" }
      : { status: "unknown" };
  } catch (error) {
    logger.warn(
      { err: error, awsAccountId: account.id },
      "email detail: suppression lookup failed"
    );
    return { status: "unknown" };
  }
}

function listedCopy(
  lookup: Extract<Lookup, { status: "listed" }>,
  bouncedAt: number
): string {
  if (lookup.reason === "COMPLAINT") {
    return "On your SES suppression list after a complaint. SES skips every send to this address.";
  }
  if (lookup.lastUpdated < bouncedAt - PREDATES_BOUNCE_MS) {
    return "Already on your SES suppression list for an earlier bounce. SES skips every send to this address.";
  }
  return "Hard bounce, so SES added it to your suppression list automatically. Later sends to this address are skipped.";
}

function StepRow({
  icon: Icon,
  iconClassName,
  isLast,
  title,
  timestamp,
  children,
}: {
  icon: typeof Ban;
  iconClassName: string;
  isLast: boolean;
  title: string;
  timestamp?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={`rounded-full border-2 border-background bg-linear-to-br from-background to-muted p-2.5 shadow-sm ${iconClassName}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        {!isLast && (
          <div className="my-1 w-0.5 flex-1 bg-linear-to-b from-border to-transparent" />
        )}
      </div>
      <div className="flex-1 pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-1">
            <div className="font-semibold">{title}</div>
            {timestamp !== undefined && (
              <div className="text-muted-foreground text-sm">
                {formatFullTimestamp(timestamp)}
              </div>
            )}
          </div>
          {timestamp !== undefined && (
            <div className="text-muted-foreground text-sm">
              {formatShortTimestamp(timestamp)}
            </div>
          )}
        </div>
        <div className="mt-2 space-y-2 text-sm">{children}</div>
      </div>
    </div>
  );
}

/**
 * The step after a hard bounce: whether SES suppressed the address. Read live
 * from the account's suppression list, so it says what SES did rather than
 * what it was configured to do. When the address is not listed, it offers to
 * suppress it. A lookup that fails or is denied renders nothing.
 */
export async function SuppressionStep({
  account,
  hardBounce,
  organizationId,
  orgSlug,
}: {
  account: AwsAccountRow;
  hardBounce: HardBounce;
  organizationId: string;
  orgSlug: string;
}) {
  const lookups = await Promise.all(
    hardBounce.addresses.map(
      async (address) => [address, await lookUp(account, address)] as const
    )
  );
  const shown = lookups.filter(([, lookup]) => lookup.status !== "unknown");

  return shown.map(([address, lookup], index) => {
    const isLast = index === shown.length - 1;

    if (lookup.status === "listed") {
      return (
        <StepRow
          icon={Ban}
          iconClassName="text-warning"
          isLast={isLast}
          key={address}
          timestamp={lookup.lastUpdated}
          title="Suppressed"
        >
          <div>
            <span className="font-mono">{address}</span>
          </div>
          <div className="text-muted-foreground">
            {listedCopy(lookup, hardBounce.bouncedAt)}
          </div>
          <Link
            className="text-sm underline underline-offset-4"
            href={hubHref(orgSlug, {
              tab: "deliverability",
              extra: { list: "suppressed" },
            })}
          >
            View suppression list
          </Link>
        </StepRow>
      );
    }

    return (
      <StepRow
        icon={ShieldAlert}
        iconClassName="text-muted-foreground"
        isLast={isLast}
        key={address}
        title="Not suppressed"
      >
        <div>
          <span className="font-mono">{address}</span>
        </div>
        <div className="text-muted-foreground">
          This address hard-bounced but is not on your SES suppression list, so
          SES will still try it on later sends.
        </div>
        <SuppressAddressButton
          account={{
            id: account.id,
            name: account.name,
            region: account.region,
          }}
          address={address}
          organizationId={organizationId}
        />
      </StepRow>
    );
  });
}
