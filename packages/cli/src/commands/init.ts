import * as pulumi from '@pulumi/pulumi';
import * as clack from '@clack/prompts';
import pc from 'picocolors';
import { InitOptions, EmailStackConfig } from '../types/index.js';
import { validateAWSCredentials, getAWSRegion } from '../utils/aws.js';
import {
  promptProvider,
  promptRegion,
  promptDomain,
  promptVercelConfig,
  promptIntegrationLevel,
  confirmDeploy,
} from '../utils/prompts.js';
import { DeploymentProgress, displaySuccess } from '../utils/output.js';
import { deployEmailStack } from '../infrastructure/email-stack.js';
import { ensurePulumiWorkDir, getPulumiWorkDir } from '../utils/fs.js';
import { ensurePulumiInstalled } from '../utils/pulumi.js';

/**
 * Init command - Deploy new email infrastructure
 */
export async function init(options: InitOptions): Promise<void> {
  clack.intro(pc.bold('BYO Email Infrastructure Setup'));

  const progress = new DeploymentProgress();

  // 1. Check Pulumi CLI is installed (auto-install if missing)
  const wasAutoInstalled = await progress.execute('Checking Pulumi CLI installation', async () => {
    return await ensurePulumiInstalled();
  });

  if (wasAutoInstalled) {
    progress.info('Pulumi CLI was automatically installed');
  }

  // 2. Validate AWS credentials
  const identity = await progress.execute('Validating AWS credentials', async () => {
    return validateAWSCredentials();
  });

  progress.info(`Connected to AWS account: ${pc.cyan(identity.accountId)}`);

  // 3. Get configuration (from options or prompts)
  let provider = options.provider;
  if (!provider) {
    provider = await promptProvider();
  }

  let region = options.region;
  if (!region) {
    const defaultRegion = await getAWSRegion();
    region = await promptRegion(defaultRegion);
  }

  let domain = options.domain;
  if (!domain) {
    domain = await promptDomain();
  }

  // Get Vercel config if needed
  let vercelConfig;
  if (provider === 'vercel') {
    vercelConfig = await promptVercelConfig();
  }

  // Get integration level
  let integrationLevel: 'dashboard-only' | 'enhanced';
  if (options.enhanced !== undefined) {
    integrationLevel = options.enhanced ? 'enhanced' : 'dashboard-only';
  } else {
    integrationLevel = await promptIntegrationLevel();
  }

  // Confirm deployment (skip if --yes flag)
  if (!options.yes) {
    const confirmed = await confirmDeploy();
    if (!confirmed) {
      clack.cancel('Deployment cancelled.');
      process.exit(0);
    }
  }

  // 4. Build stack configuration
  const stackConfig: EmailStackConfig = {
    provider,
    region,
    domain: domain || undefined,
    vercel: vercelConfig,
    integrationLevel,
  };

  // 5. Deploy infrastructure using Pulumi
  let outputs;
  try {
    outputs = await progress.execute(
      'Deploying infrastructure (this may take 2-3 minutes)',
      async () => {
        // Ensure Pulumi workspace directory exists
        await ensurePulumiWorkDir();

        // Run Pulumi inline program with local backend (no cloud required)
        const stack = await pulumi.automation.LocalWorkspace.createOrSelectStack(
          {
            stackName: `byo-${identity.accountId}-${region}`,
            projectName: 'byo-email',
            program: async () => {
              const result = await deployEmailStack(stackConfig);

              // Export outputs
              return {
                roleArn: result.roleArn,
                configSetName: result.configSetName,
                tableName: result.tableName,
                region: result.region,
                lambdaFunctions: result.lambdaFunctions,
                domain: result.domain,
                dkimTokens: result.dkimTokens,
              };
            },
          },
          {
            workDir: getPulumiWorkDir(),
            // Use local file-based backend (no Pulumi Cloud login required)
            envVars: {
              PULUMI_CONFIG_PASSPHRASE: '', // Use empty passphrase for local state
            },
            secretsProvider: 'passphrase',
          }
        );

        // Set backend to local file system
        await stack.workspace.selectStack(`byo-${identity.accountId}-${region}`);

        // Set AWS region
        await stack.setConfig('aws:region', { value: region });

        // Run the deployment
        const upResult = await stack.up({ onOutput: () => {} }); // Suppress Pulumi output

        // Get outputs
        const pulumiOutputs = upResult.outputs;

        return {
          roleArn: pulumiOutputs.roleArn?.value as string,
          configSetName: pulumiOutputs.configSetName?.value as string | undefined,
          tableName: pulumiOutputs.tableName?.value as string | undefined,
          region: pulumiOutputs.region?.value as string,
          lambdaFunctions: pulumiOutputs.lambdaFunctions?.value as string[] | undefined,
          domain: pulumiOutputs.domain?.value as string | undefined,
          dkimTokens: pulumiOutputs.dkimTokens?.value as string[] | undefined,
        };
      }
    );
  } catch (error: any) {
    clack.log.error('Infrastructure deployment failed');
    throw new Error(`Pulumi deployment failed: ${error.message}`);
  }

  // 6. Check if Route53 hosted zone exists and create DNS records automatically
  let dnsAutoCreated = false;
  if (outputs.domain && outputs.dkimTokens && outputs.dkimTokens.length > 0) {
    const { findHostedZone, createDNSRecords } = await import('../utils/route53.js');
    const hostedZone = await findHostedZone(outputs.domain, region);

    if (hostedZone) {
      try {
        progress.start('Creating DNS records in Route53');
        await createDNSRecords(hostedZone.id, outputs.domain, outputs.dkimTokens, region);
        progress.succeed('DNS records created in Route53');
        dnsAutoCreated = true;
      } catch (error: any) {
        progress.fail('Failed to create DNS records in Route53');
        clack.log.warn(`Could not auto-create DNS records: ${error.message}`);
      }
    }
  }

  // 7. Format DNS records if domain was provided and DNS wasn't auto-created
  const dnsRecords = [];
  if (outputs.domain && outputs.dkimTokens && outputs.dkimTokens.length > 0 && !dnsAutoCreated) {
    // Add DKIM CNAME records
    for (const token of outputs.dkimTokens) {
      dnsRecords.push({
        name: `${token}._domainkey.${outputs.domain}`,
        type: 'CNAME',
        value: `${token}.dkim.amazonses.com`,
      });
    }
  }

  // 8. Display success message
  displaySuccess({
    roleArn: outputs.roleArn,
    configSetName: outputs.configSetName,
    region: outputs.region!,
    tableName: outputs.tableName,
    dnsRecords: dnsRecords.length > 0 ? dnsRecords : undefined,
    dnsAutoCreated,
    domain: outputs.domain,
  });
}
