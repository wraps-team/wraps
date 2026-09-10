import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildConsolePolicyDocument } from "../platform/update-role.js";

/**
 * Plan 282 built a probe ladder (apps/api/src/lib/console-policy-version.ts)
 * that reads a customer's role version by probing read-only SES "marker"
 * actions in the order they were granted, and wrote into its own maintenance
 * notes: "Every future console-policy change must add a read-only marker
 * action and a rung here." Nothing enforced that. Plan 299 found the gap the
 * hard way: the suppressions merge (`ed18a45b`) added
 * `ses:ListSuppressedDestinations` — read-only and safely probeable — and no
 * rung followed, so a pre-merge role probed as "current" when it wasn't.
 *
 * This test is the enforcement plan 299 added: every read-only ses: action
 * (`Get*`/`List*`/`Describe*`) the default-deployment policy grants must be
 * either a rung's marker action (MARKER_ACTIONS below) or explicitly excused
 * in NOT_A_MARKER, with a one-line reason. A write action — most notably
 * `ses:CreateEmailIdentity` — is not a permission fact you can safely probe
 * (AWS does not document whether authorization or validation runs first on a
 * malformed write), so the read-only filter below skips writes entirely; this
 * guard must never ask for a rung for one.
 *
 * MARKER_ACTIONS is a hand-kept mirror of the `RUNGS` array in
 * apps/api/src/lib/console-policy-version.ts. That array isn't exported, and
 * packages/cli has no reason to import apps/api's SDK-typed internals just to
 * read five action names — see this file's sibling,
 * console-access-policy-parity.test.ts, for the same cross-package-import
 * reasoning applied to the website's published policy. Whoever adds rung N to
 * the ladder must add it here too; that pairing is exactly what this guard
 * exists to force someone to notice.
 */

const DEFAULT_EMAIL_CONFIG = {
  sendingEnabled: true,
  eventTracking: { enabled: true },
  // emailArchiving and inbound deliberately omitted — undefined reads as
  // "not enabled" in buildConsolePolicyDocument's `?.enabled` checks.
};

/** Mirrors RUNGS in apps/api/src/lib/console-policy-version.ts, in order. */
const MARKER_ACTIONS = [
  "ses:GetAccount", // rung 1
  "ses:ListEmailIdentities", // rung 2
  "ses:ListEmailTemplates", // rung 3
  "ses:ListConfigurationSets", // rung 4
  "ses:ListSuppressedDestinations", // rung 5
];

/**
 * Read-only ses: actions the policy grants that are deliberately NOT rungs.
 * Every entry needs a real reason: a second marker for a version already
 * covered by a rung tells the probe nothing it doesn't already know.
 */
const NOT_A_MARKER: Record<string, string> = {
  "ses:GetSendStatistics":
    "granted alongside ses:GetAccount (rung 1); same version, redundant marker",
  "ses:ListIdentities":
    "SES v1 legacy list, granted alongside ses:GetAccount (rung 1); same version, redundant marker",
  "ses:GetIdentityVerificationAttributes":
    "granted alongside ses:GetAccount (rung 1); same version, redundant marker",
  "ses:GetDedicatedIps":
    "granted alongside ses:GetAccount (rung 1); same version, redundant marker",
  "ses:GetEmailIdentity":
    "Get counterpart to ses:ListEmailIdentities (rung 2) — needs a name List already found, so it can't newly fail while List still succeeds; same version, redundant marker",
  "ses:GetTemplate":
    "granted alongside ses:ListEmailTemplates (rung 3) in the always-on template statement; same version, redundant marker",
  "ses:ListTemplates":
    "SES v1 legacy list, granted alongside ses:ListEmailTemplates (rung 3); same version, redundant marker",
  "ses:GetEmailTemplate":
    "Get counterpart to ses:ListEmailTemplates (rung 3); same version, redundant marker",
  "ses:GetConfigurationSet":
    "Get counterpart to ses:ListConfigurationSets (rung 4); same version, redundant marker",
  "ses:GetConfigurationSetEventDestinations":
    "granted alongside ses:ListConfigurationSets (rung 4); same version, redundant marker",
  "ses:GetSuppressedDestination":
    "Get counterpart to ses:ListSuppressedDestinations (rung 5); same version, redundant marker",
};

const READ_ONLY_PREFIXES = ["Get", "List", "Describe"];

describe("wraps-console-access-role policy: every read-only ses: action is a marker or excused", () => {
  it("has no read-only ses: action outside MARKER_ACTIONS and NOT_A_MARKER", () => {
    const generated = buildConsolePolicyDocument(
      DEFAULT_EMAIL_CONFIG,
      undefined
    );
    const sesActions = generated.Statement.flatMap((s) => s.Action).filter(
      (action) => action.startsWith("ses:")
    );
    const readOnlyActions = sesActions.filter((action) => {
      const name = action.slice("ses:".length);
      return READ_ONLY_PREFIXES.some((prefix) => name.startsWith(prefix));
    });

    const unaccounted = readOnlyActions.filter(
      (action) => !MARKER_ACTIONS.includes(action) && !(action in NOT_A_MARKER)
    );

    const message = unaccounted
      .map(
        (action) =>
          `${action} is a read-only ses: action the console policy grants that the probe ladder does not account for. Either add a rung for it and bump CURRENT_CONSOLE_POLICY_VERSION in BOTH apps/api/src/lib/console-policy-version.ts and apps/web's stale-policy-banner.tsx, or add it to NOT_A_MARKER in this file with a one-line reason why it is deliberately not a rung.`
      )
      .join("\n");

    expect(unaccounted, message).toEqual([]);
  });

  it("MARKER_ACTIONS stays in step with the ladder's length", () => {
    // MARKER_ACTIONS mirrors RUNGS by hand. The check above catches the policy
    // gaining an action the ladder lacks; this catches an entry added here with
    // no matching rung, which would pass silently and leave the ladder short.
    const apiSource = readFileSync(
      path.resolve(
        process.cwd(),
        "../../apps/api/src/lib/console-policy-version.ts"
      ),
      "utf8"
    );
    const match = apiSource.match(
      /export const CURRENT_CONSOLE_POLICY_VERSION\s*=\s*(\d+)/
    );
    expect(match).not.toBeNull();
    expect(MARKER_ACTIONS.length).toBe(Number(match?.[1]));
  });
});
