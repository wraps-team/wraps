import * as pulumi from '@pulumi/pulumi';
import * as clack from '@clack/prompts';
import pc from 'picocolors';
import { ConnectOptions, EmailStackConfig, BYOFeature } from '../types/index.js';
import { validateAWSCredentials, getAWSRegion } from '../utils/aws.js';
import {
  promptProvider,
  promptRegion,
  promptFeatureSelection,
  promptConflictResolution,
  promptSelectIdentities,
  promptVercelConfig,
  confirmConnect,
  ConflictAction,
} from '../utils/prompts.js';
import { DeploymentProgress, displaySuccess } from '../utils/output.js';
import { deployEmailStack } from '../infrastructure/email-stack.js';
import { ensurePulumiWorkDir, getPulumiWorkDir } from '../utils/fs.js';
import { ensurePulumiInstalled } from '../utils/pulumi.js';
import {
  scanAWSResources,
  checkBYOResourcesExist,
  AWSResourceScan,
} from '../utils/scanner.js';
import {
  loadConnectionMetadata,
  saveConnectionMetadata,
  createConnectionMetadata,
  updateFeatureMetadata,
  updateIdentityMetadata,
  ConnectionMetadata,
  FeatureConfig,
} from '../utils/metadata.js';

/**
 * Connect command - Connect to existing AWS SES infrastructure
 */
export async function connect(options: ConnectOptions): Promise<void> {
  clack.intro(pc.bold('BYO Connect - Link Existing Infrastructure'));

  const progress = new DeploymentProgress();

  // 1. Check Pulumi CLI is installed
  const wasAutoInstalled = await progress.execute(
    'Checking Pulumi CLI installation',
    async () => {
      return await ensurePulumiInstalled();
    }
  );

  if (wasAutoInstalled) {
    progress.info('Pulumi CLI was automatically installed');
  }

  // 2. Validate AWS credentials
  const identity = await progress.execute('Validating AWS credentials', async () => {
    return validateAWSCredentials();
  });

  progress.info(`Connected to AWS account: ${pc.cyan(identity.accountId)}`);

  // 3. Get region
  let region = options.region;
  if (!region) {
    const defaultRegion = await getAWSRegion();
    region = await promptRegion(defaultRegion);
  }

  // 4. Check if connection already exists
  const existingConnection = await loadConnectionMetadata(identity.accountId, region);
  if (existingConnection) {
    clack.log.warn(
      `Connection already exists for account ${pc.cyan(identity.accountId)} in region ${pc.cyan(region)}`
    );
    clack.log.info(`Created: ${existingConnection.timestamp}`);
    clack.log.info(`Use ${pc.cyan('byo status')} to view current setup`);
    clack.log.info(`Use ${pc.cyan('byo upgrade')} to add more features`);
    process.exit(0);
  }

  // 5. Scan existing AWS resources
  const scan = await progress.execute('Scanning existing AWS resources', async () => {
    return scanAWSResources(region);
  });

  // Display what we found
  progress.info(
    `Found: ${scan.identities.length} identities, ${scan.configurationSets.length} config sets, ${scan.snsTopics.length} SNS topics`
  );

  // Check if any identities exist
  if (scan.identities.length === 0) {
    clack.log.warn('No SES identities found in this region.');
    clack.log.info(
      `Use ${pc.cyan('byo init')} to create new email infrastructure instead.`
    );
    process.exit(0);
  }

  // Show verified identities
  const verifiedIdentities = scan.identities.filter((id) => id.verified);
  if (verifiedIdentities.length > 0) {
    progress.info(
      `Verified identities: ${verifiedIdentities.map((id) => pc.cyan(id.name)).join(', ')}`
    );
  }

  // 6. Get provider configuration
  let provider = options.provider;
  if (!provider) {
    provider = await promptProvider();
  }

  // Get Vercel config if needed
  let vercelConfig;
  if (provider === 'vercel') {
    vercelConfig = await promptVercelConfig();
  }

  // 7. Select identities to connect
  const selectedIdentities = await promptSelectIdentities(
    scan.identities.map((id) => ({
      name: id.name,
      verified: id.verified,
    }))
  );

  if (selectedIdentities.length === 0) {
    clack.log.warn('No identities selected. Nothing to connect.');
    process.exit(0);
  }

  // 8. Feature selection
  const selectedFeatures = await promptFeatureSelection();

  // 9. Conflict detection and resolution
  const metadata = createConnectionMetadata(identity.accountId, region, provider);
  const featureConfigs: Record<string, FeatureConfig> = {};

  // Check for configuration set conflict
  if (selectedFeatures.includes('configSet')) {
    const existingConfigSets = scan.configurationSets.filter(
      (cs) => !cs.name.startsWith('byo-')
    );

    if (existingConfigSets.length > 0) {
      // Found existing non-BYO config sets
      const action = await promptConflictResolution(
        'configuration set',
        existingConfigSets[0].name
      );

      featureConfigs.configSet = {
        enabled: action !== 'skip',
        action: action === 'replace' ? 'replace' : action === 'skip' ? 'skip' : 'deploy-new',
        originalValue: action === 'replace' ? existingConfigSets[0].name : null,
        currentValue: 'byo-tracking',
      };
    } else {
      // No conflict, deploy new
      featureConfigs.configSet = {
        enabled: true,
        action: 'deploy-new',
        originalValue: null,
        currentValue: 'byo-tracking',
      };
    }

    updateFeatureMetadata(metadata, 'configSet', featureConfigs.configSet);
  }

  // Check for SNS topic conflicts (bounce handling)
  if (selectedFeatures.includes('bounceHandling')) {
    const existingSNS = scan.snsTopics.filter(
      (t) => !t.name.startsWith('byo-') && t.name.toLowerCase().includes('bounce')
    );

    if (existingSNS.length > 0) {
      const action = await promptConflictResolution('SNS topic (bounces)', existingSNS[0].name);

      featureConfigs.bounceHandling = {
        enabled: action !== 'skip',
        action: action === 'replace' ? 'replace' : action === 'skip' ? 'skip' : 'deploy-new',
        originalValue: action === 'replace' ? existingSNS[0].arn : null,
        currentValue: 'byo-bounce-complaints',
      };
    } else {
      featureConfigs.bounceHandling = {
        enabled: true,
        action: 'deploy-new',
        originalValue: null,
        currentValue: 'byo-bounce-complaints',
      };
    }

    updateFeatureMetadata(metadata, 'bounceHandling', featureConfigs.bounceHandling);
  }

  // Complaint handling uses same SNS topic
  if (selectedFeatures.includes('complaintHandling')) {
    featureConfigs.complaintHandling = {
      enabled: true,
      action: 'deploy-new',
      originalValue: null,
      currentValue: 'byo-bounce-complaints',
    };
    updateFeatureMetadata(metadata, 'complaintHandling', featureConfigs.complaintHandling);
  }

  // Email history
  if (selectedFeatures.includes('emailHistory')) {
    const existingTables = scan.dynamoTables.filter(
      (t) => !t.name.startsWith('byo-') && t.name.toLowerCase().includes('email')
    );

    if (existingTables.length > 0) {
      const action = await promptConflictResolution(
        'DynamoDB table (email history)',
        existingTables[0].name
      );

      featureConfigs.emailHistory = {
        enabled: action !== 'skip',
        action: action === 'replace' ? 'replace' : action === 'skip' ? 'skip' : 'deploy-new',
        originalValue: action === 'replace' ? existingTables[0].name : null,
        currentValue: 'byo-email-history',
      };
    } else {
      featureConfigs.emailHistory = {
        enabled: true,
        action: 'deploy-new',
        originalValue: null,
        currentValue: 'byo-email-history',
      };
    }

    updateFeatureMetadata(metadata, 'emailHistory', featureConfigs.emailHistory);
  }

  // Event processor
  if (selectedFeatures.includes('eventProcessor')) {
    featureConfigs.eventProcessor = {
      enabled: true,
      action: 'deploy-new',
      originalValue: null,
      currentValue: 'byo-event-processor',
    };
    updateFeatureMetadata(metadata, 'eventProcessor', featureConfigs.eventProcessor);
  }

  // Dashboard access (always deploy-new, no conflicts)
  if (selectedFeatures.includes('dashboardAccess')) {
    featureConfigs.dashboardAccess = {
      enabled: true,
      action: 'deploy-new',
      originalValue: null,
      currentValue: 'byo-email-role',
    };
    updateFeatureMetadata(metadata, 'dashboardAccess', featureConfigs.dashboardAccess);
  }

  // 10. Store identity configurations in metadata
  for (const identityName of selectedIdentities) {
    const identity = scan.identities.find((id) => id.name === identityName);
    if (identity) {
      updateIdentityMetadata(metadata, {
        name: identity.name,
        type: identity.type,
        originalConfigSet: identity.configurationSet || null,
        currentConfigSet: featureConfigs.configSet?.enabled ? 'byo-tracking' : null,
        action: identity.configurationSet ? 'replaced' : 'attached',
      });
    }
  }

  // 11. Confirm deployment
  if (!options.yes) {
    const confirmed = await confirmConnect();
    if (!confirmed) {
      clack.cancel('Connection cancelled.');
      process.exit(0);
    }
  }

  // 12. Build stack configuration
  const stackConfig: EmailStackConfig = {
    provider,
    region,
    vercel: vercelConfig,
    integrationLevel: selectedFeatures.includes('emailHistory') ||
      selectedFeatures.includes('eventProcessor')
      ? 'enhanced'
      : 'dashboard-only',
  };

  // 13. Deploy infrastructure using Pulumi
  let outputs;
  try {
    outputs = await progress.execute(
      'Deploying BYO infrastructure (this may take 2-3 minutes)',
      async () => {
        await ensurePulumiWorkDir();

        const stack = await pulumi.automation.LocalWorkspace.createOrSelectStack(
          {
            stackName: `byo-${identity.accountId}-${region}`,
            projectName: 'byo-email',
            program: async () => {
              const result = await deployEmailStack(stackConfig);

              return {
                roleArn: result.roleArn,
                configSetName: result.configSetName,
                tableName: result.tableName,
                region: result.region,
                lambdaFunctions: result.lambdaFunctions,
              };
            },
          },
          {
            workDir: getPulumiWorkDir(),
            envVars: {
              PULUMI_CONFIG_PASSPHRASE: '',
            },
            secretsProvider: 'passphrase',
          }
        );

        await stack.workspace.selectStack(`byo-${identity.accountId}-${region}`);
        await stack.setConfig('aws:region', { value: region });

        const upResult = await stack.up({ onOutput: () => {} });
        const pulumiOutputs = upResult.outputs;

        return {
          roleArn: pulumiOutputs.roleArn?.value as string,
          configSetName: pulumiOutputs.configSetName?.value as string | undefined,
          tableName: pulumiOutputs.tableName?.value as string | undefined,
          region: pulumiOutputs.region?.value as string,
          lambdaFunctions: pulumiOutputs.lambdaFunctions?.value as string[] | undefined,
        };
      }
    );
  } catch (error: any) {
    clack.log.error('Infrastructure deployment failed');
    throw new Error(`Pulumi deployment failed: ${error.message}`);
  }

  // 14. Save metadata for restore capability
  metadata.pulumiStackName = `byo-${identity.accountId}-${region}`;
  if (vercelConfig) {
    metadata.vercel = vercelConfig;
  }
  await saveConnectionMetadata(metadata);

  progress.info('Connection metadata saved for restore capability');

  // 15. Display success message
  displaySuccess({
    roleArn: outputs.roleArn,
    configSetName: outputs.configSetName,
    region: outputs.region!,
    tableName: outputs.tableName,
  });

  // Show next steps for replaced resources
  const replacedFeatures = Object.entries(featureConfigs).filter(
    ([_, config]) => config.action === 'replace'
  );

  if (replacedFeatures.length > 0) {
    console.log(`\n${pc.yellow('⚠ Resources were replaced:')}\n`);
    for (const [feature, config] of replacedFeatures) {
      console.log(
        `  ${pc.cyan(config.originalValue!)} → ${pc.green(config.currentValue!)}`
      );
    }
    console.log(
      `\n${pc.dim('To restore original resources: ')}${pc.cyan('byo restore')}\n`
    );
  }

  // Show identities that need manual configuration
  if (selectedIdentities.length > 0 && featureConfigs.configSet?.enabled) {
    console.log(`\n${pc.bold('Next Steps:')}\n`);
    console.log(
      `Update your code to use configuration set: ${pc.cyan('byo-tracking')}`
    );
    console.log(`\n${pc.dim('Example:')}`);
    console.log(
      pc.gray(`  await ses.sendEmail({
    ConfigurationSetName: 'byo-tracking',
    // ... other parameters
  });`)
    );
    console.log('');
  }
}
