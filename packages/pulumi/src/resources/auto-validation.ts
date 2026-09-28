import * as pulumi from "@pulumi/pulumi";
import type { AutoValidationThreshold } from "@wraps/core";
import type { ResolvedConfig, SuppressionReason } from "../types.js";

// ============================================
// DYNAMIC PROVIDER TYPES
// ============================================

type AutoValidationInputs = {
  configSetName: string;
  region: string;
  suppressedReasons: SuppressionReason[];
  enabled: boolean;
  threshold: AutoValidationThreshold;
};

type AutoValidationOutputs = AutoValidationInputs;

// ============================================
// DYNAMIC PROVIDER
// ============================================

/**
 * Pulumi dynamic provider for SES configuration-set Auto Validation.
 *
 * Exported so unit tests can call provider methods directly.
 *
 * IMPORTANT: All AWS SDK and @wraps/core imports live INSIDE each method
 * body to avoid Pulumi closure-serialization errors. Do NOT move them to
 * module scope (same rule as `mail-manager.ts`'s dynamic provider).
 */
export const autoValidationProvider: pulumi.dynamic.ResourceProvider = {
  async create(
    inputs: AutoValidationInputs
  ): Promise<pulumi.dynamic.CreateResult> {
    const ses = await import("@aws-sdk/client-sesv2");
    const { buildSuppressionOptions } = await import("@wraps/core");
    const sesClient = new ses.SESv2Client({ region: inputs.region });

    try {
      await sesClient.send(
        new ses.PutConfigurationSetSuppressionOptionsCommand({
          ConfigurationSetName: inputs.configSetName,
          ...buildSuppressionOptions(inputs.suppressedReasons, {
            enabled: inputs.enabled,
            threshold: inputs.threshold,
          }),
        })
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to apply Auto Validation to SES config set '${inputs.configSetName}' in ${inputs.region}: ${detail}`
      );
    }

    return { id: `${inputs.configSetName}-auto-validation`, outs: inputs };
  },

  async update(
    _id: string,
    _olds: AutoValidationOutputs,
    news: AutoValidationInputs
  ): Promise<pulumi.dynamic.UpdateResult> {
    const ses = await import("@aws-sdk/client-sesv2");
    const { buildSuppressionOptions } = await import("@wraps/core");
    const sesClient = new ses.SESv2Client({ region: news.region });

    try {
      await sesClient.send(
        new ses.PutConfigurationSetSuppressionOptionsCommand({
          ConfigurationSetName: news.configSetName,
          ...buildSuppressionOptions(news.suppressedReasons, {
            enabled: news.enabled,
            threshold: news.threshold,
          }),
        })
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to apply Auto Validation to SES config set '${news.configSetName}' in ${news.region}: ${detail}`
      );
    }

    return { outs: news };
  },

  async diff(
    _id: string,
    olds: AutoValidationOutputs,
    news: AutoValidationInputs
  ): Promise<pulumi.dynamic.DiffResult> {
    const changes: string[] = [];
    // suppressedReasons must be compared too — a reasons-only change (e.g.
    // the config set's suppressionList changed) has to re-apply, or the live
    // ValidationOptions would go stale against the new reasons.
    if (
      JSON.stringify(olds.suppressedReasons) !==
      JSON.stringify(news.suppressedReasons)
    ) {
      changes.push("suppressedReasons");
    }
    if (olds.enabled !== news.enabled) {
      changes.push("enabled");
    }
    if (olds.threshold !== news.threshold) {
      changes.push("threshold");
    }
    if (olds.configSetName !== news.configSetName) {
      changes.push("configSetName");
    }
    if (olds.region !== news.region) {
      changes.push("region");
    }

    return {
      changes: changes.length > 0,
      replaces: [],
      deleteBeforeReplace: false,
    };
  },

  async delete(_id: string, props: AutoValidationOutputs): Promise<void> {
    // Non-Destructive: never delete anything. Disable validation (keeping
    // the live suppression reasons) rather than leaving stale settings, but
    // best-effort — a failure here must not block stack teardown.
    try {
      const ses = await import("@aws-sdk/client-sesv2");
      const { buildSuppressionOptions } = await import("@wraps/core");
      const sesClient = new ses.SESv2Client({ region: props.region });
      await sesClient.send(
        new ses.PutConfigurationSetSuppressionOptionsCommand({
          ConfigurationSetName: props.configSetName,
          ...buildSuppressionOptions(props.suppressedReasons, {
            enabled: false,
          }),
        })
      );
    } catch {
      // Best-effort de-configuration — never block teardown on this.
    }
  },
};

// ============================================
// DYNAMIC RESOURCE CLASS
// ============================================

class ConfigSetAutoValidationResource extends pulumi.dynamic.Resource {
  constructor(
    name: string,
    props: {
      configSetName: pulumi.Input<string>;
      region: pulumi.Input<string>;
      suppressedReasons: pulumi.Input<SuppressionReason[]>;
      enabled: pulumi.Input<boolean>;
      threshold: pulumi.Input<AutoValidationThreshold>;
    },
    opts?: pulumi.CustomResourceOptions
  ) {
    super(autoValidationProvider, name, { ...props }, opts);
  }
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Apply SES Auto Validation to a configuration set's suppression options.
 *
 * Opt-in — when `config.autoValidation` is unset this function creates no
 * resource. Always sends `suppressedReasons` alongside the validation
 * settings (never one without the other) via
 * `@wraps/core`'s `buildSuppressionOptions`, the same builder the CLI and
 * CDK share — see that module for why a suppression-options write can never
 * carry one field without the other.
 */
export function createConfigSetAutoValidation(
  name: string,
  config: ResolvedConfig,
  configSetName: pulumi.Input<string>,
  region: pulumi.Input<string>,
  opts?: pulumi.CustomResourceOptions
): ConfigSetAutoValidationResource | undefined {
  if (!config.autoValidation) {
    return;
  }

  return new ConfigSetAutoValidationResource(
    `${name}-auto-validation`,
    {
      configSetName,
      region,
      suppressedReasons: config.suppressionList.reasons,
      enabled: config.autoValidation.enabled ?? true,
      threshold: config.autoValidation.threshold ?? "MANAGED",
    },
    opts
  );
}
