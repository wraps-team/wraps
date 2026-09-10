import type { awsAccount } from "@wraps/db";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@wraps/ui/components/ui/alert";
import type { InferSelectModel } from "drizzle-orm";
import { AlertTriangle } from "lucide-react";

// Mirrors CURRENT_CONSOLE_POLICY_VERSION in
// apps/api/src/lib/console-policy-version.ts, the source of truth. apps/web
// cannot import from apps/api, and a shared package for one integer is not
// worth a new build edge — the two copies are pinned together by
// __tests__/stale-policy-banner.test.tsx's source-parsing assertion.
export const CURRENT_CONSOLE_POLICY_VERSION = 5;

type StalePolicyBannerProps = {
  account: Pick<InferSelectModel<typeof awsAccount>, "consolePolicyVersion">;
};

/**
 * Warns when the account-health sweep (apps/api/src/workers/account-health.ts)
 * last observed this account's wraps-console-access-role carrying an older
 * policy version than Wraps currently ships. The role still works — it is
 * just missing whatever permissions a later version added, which can make
 * deployed features look switched off. Server component — reads the already
 * org-scoped `account` row fetched by the parent page, no extra query needed.
 */
export function StalePolicyBanner({ account }: StalePolicyBannerProps) {
  // NULL means never probed — which covers both a brand-new connection and
  // every account that existed before plan 282's column shipped. An unprobed
  // role and a stale role are indistinguishable from here, so telling a
  // customer their role is out of date when it may be current is worse than
  // saying nothing. A banner is not the place to improvise a sentence about a
  // state we cannot actually observe, so bail rather than render one.
  if (account.consolePolicyVersion === null) {
    return null;
  }
  if (account.consolePolicyVersion >= CURRENT_CONSOLE_POLICY_VERSION) {
    return null;
  }

  return (
    <Alert>
      <AlertTriangle className="text-warning" />
      <AlertTitle>Your AWS role is behind the current Wraps policy</AlertTitle>
      <AlertDescription>
        <p>
          Wraps can still reach this account, but its wraps-console-access-role
          is missing permissions added since it was created. Features that
          depend on them may appear switched off even though they are deployed.
          See{" "}
          <a className="underline" href="#iam-role">
            IAM Role Configuration
          </a>{" "}
          below to update it.
        </p>
      </AlertDescription>
    </Alert>
  );
}
