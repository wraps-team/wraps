/**
 * SES configuration-set suppression options — one builder shared by every
 * writer (the CLI's `domains config`, the CLI's own Pulumi stack, the
 * `packages/pulumi` dynamic provider, and CDK's property override), so a
 * write of the configuration set's `SuppressionOptions` can never omit
 * `SuppressedReasons` or `ValidationOptions` by accident.
 *
 * The hazard this exists to close: `PutConfigurationSetSuppressionOptions` is
 * a PUT. A write carrying only `SuppressedReasons` may drop an existing
 * `ValidationOptions`, and vice versa — AWS does not document the merge
 * behaviour, so every caller must assume the worst and always send both
 * fields, with `SuppressedReasons` taken from the live or configured value,
 * never omitted or defaulted to `[]` (an empty array cancels suppression
 * entirely for that configuration set's traffic).
 *
 * Pure — no AWS SDK import, no I/O — so it can be imported from a Pulumi
 * dynamic-provider method body (module-scope imports break Pulumi
 * serialization) as well as from CDK and the CLI.
 */

import type { AutoValidationConfig, SuppressionReason } from "./types.js";

export const AUTO_VALIDATION_THRESHOLDS = [
  "MEDIUM",
  "HIGH",
  "MANAGED",
] as const;

export const DEFAULT_AUTO_VALIDATION_THRESHOLD: NonNullable<
  AutoValidationConfig["threshold"]
> = "MANAGED";

/**
 * The shape `PutConfigurationSetSuppressionOptionsCommand`'s input takes
 * (and the CloudFormation `SuppressionOptions` property path), reproduced
 * here so this stays SDK-import-free. Key names matter: the AWS developer
 * guide's CLI examples use different, wrong keys.
 */
export type SesSuppressionOptions = {
  SuppressedReasons: SuppressionReason[];
  ValidationOptions?: {
    ConditionThreshold: {
      ConditionThresholdEnabled: "ENABLED" | "DISABLED";
      OverallConfidenceThreshold?: {
        ConfidenceVerdictThreshold: "MEDIUM" | "HIGH" | "MANAGED";
      };
    };
  };
};

/**
 * Build the full `SuppressionOptions` payload for a configuration set:
 * always the given `reasons` (copied, never mutated or defaulted), plus
 * `ValidationOptions` only when `autoValidation` is given.
 */
export function buildSuppressionOptions(
  reasons: SuppressionReason[],
  autoValidation: AutoValidationConfig | undefined
): SesSuppressionOptions {
  const suppressedReasons = [...reasons];

  if (!autoValidation) {
    return { SuppressedReasons: suppressedReasons };
  }

  if (autoValidation.enabled === false) {
    return {
      SuppressedReasons: suppressedReasons,
      ValidationOptions: {
        ConditionThreshold: { ConditionThresholdEnabled: "DISABLED" },
      },
    };
  }

  return {
    SuppressedReasons: suppressedReasons,
    ValidationOptions: {
      ConditionThreshold: {
        ConditionThresholdEnabled: "ENABLED",
        OverallConfidenceThreshold: {
          ConfidenceVerdictThreshold:
            autoValidation.threshold ?? DEFAULT_AUTO_VALIDATION_THRESHOLD,
        },
      },
    },
  };
}
