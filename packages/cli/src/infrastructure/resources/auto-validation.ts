import {
  PutConfigurationSetSuppressionOptionsCommand,
  SESv2Client,
} from "@aws-sdk/client-sesv2";
import type * as pulumi from "@pulumi/pulumi";
import {
  type AutoValidationConfig,
  buildSuppressionOptions,
  type SuppressionReason,
} from "@wraps/core";

export type ApplyConfigSetAutoValidationConfig = {
  configSetName: pulumi.Output<string>;
  region: string;
  suppressedReasons: SuppressionReason[];
  autoValidation: AutoValidationConfig;
};

/**
 * Apply SES Auto Validation to a configuration set's suppression options.
 *
 * Called imperatively after the config set is created (see
 * `createMailManagerArchive` in `mail-manager.ts` for the same pattern), so
 * this re-applies on every `wraps email sync`/`upgrade` deploy — which is
 * exactly what heals the PUT hazard documented in
 * `@wraps/core/ses-suppression`: any stack-driven change to the reasons is
 * always re-paired with `ValidationOptions` here, never sent alone.
 *
 * Unlike its sibling resource files, this one creates no new AWS resource —
 * it only mutates the suppression options already on the existing
 * `wraps-email-*` configuration set — so there is no new resource to name
 * with the `wraps-` prefix or tag `ManagedBy: 'wraps-cli'`; both are already
 * on the configuration set itself, applied when it was created.
 */
export async function applyConfigSetAutoValidation(
  config: ApplyConfigSetAutoValidationConfig
): Promise<void> {
  const configSetName = await new Promise<string>((resolve) => {
    config.configSetName.apply((name) => resolve(name));
  });

  if (!configSetName) {
    throw new Error(
      "Failed to resolve SES configuration set name from Pulumi output"
    );
  }

  const sesClient = new SESv2Client({ region: config.region });

  try {
    await sesClient.send(
      new PutConfigurationSetSuppressionOptionsCommand({
        ConfigurationSetName: configSetName,
        ...buildSuppressionOptions(
          config.suppressedReasons,
          config.autoValidation
        ),
      })
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to apply Auto Validation to SES config set '${configSetName}' in ${config.region}: ${detail}`
    );
  }
}
