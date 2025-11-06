import * as clack from '@clack/prompts';
import pc from 'picocolors';

/**
 * Hosting provider type
 */
export type Provider = 'vercel' | 'aws' | 'railway' | 'other';

/**
 * Prompt for hosting provider
 */
export async function promptProvider(): Promise<Provider> {
  const provider = await clack.select({
    message: 'Where is your app hosted?',
    options: [
      {
        value: 'vercel',
        label: 'Vercel',
        hint: 'Uses OIDC (no AWS credentials needed)',
      },
      {
        value: 'aws',
        label: 'AWS (Lambda/ECS/EC2)',
        hint: 'Uses IAM roles automatically',
      },
      {
        value: 'railway',
        label: 'Railway',
        hint: 'Requires AWS credentials',
      },
      {
        value: 'other',
        label: 'Other',
        hint: 'Will use AWS access keys',
      },
    ],
  });

  if (clack.isCancel(provider)) {
    clack.cancel('Operation cancelled.');
    process.exit(0);
  }

  return provider as Provider;
}

/**
 * Prompt for AWS region
 */
export async function promptRegion(defaultRegion: string): Promise<string> {
  const region = await clack.select({
    message: 'Select AWS region:',
    options: [
      { value: 'us-east-1', label: 'US East (N. Virginia)', hint: 'us-east-1' },
      { value: 'us-east-2', label: 'US East (Ohio)', hint: 'us-east-2' },
      { value: 'us-west-1', label: 'US West (N. California)', hint: 'us-west-1' },
      { value: 'us-west-2', label: 'US West (Oregon)', hint: 'us-west-2' },
      { value: 'af-south-1', label: 'Africa (Cape Town)', hint: 'af-south-1' },
      { value: 'ap-east-1', label: 'Asia Pacific (Hong Kong)', hint: 'ap-east-1' },
      { value: 'ap-south-1', label: 'Asia Pacific (Mumbai)', hint: 'ap-south-1' },
      { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)', hint: 'ap-northeast-1' },
      { value: 'ap-northeast-2', label: 'Asia Pacific (Seoul)', hint: 'ap-northeast-2' },
      { value: 'ap-northeast-3', label: 'Asia Pacific (Osaka)', hint: 'ap-northeast-3' },
      { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)', hint: 'ap-southeast-1' },
      { value: 'ap-southeast-2', label: 'Asia Pacific (Sydney)', hint: 'ap-southeast-2' },
      { value: 'ap-southeast-3', label: 'Asia Pacific (Jakarta)', hint: 'ap-southeast-3' },
      { value: 'ca-central-1', label: 'Canada (Central)', hint: 'ca-central-1' },
      { value: 'eu-central-1', label: 'Europe (Frankfurt)', hint: 'eu-central-1' },
      { value: 'eu-west-1', label: 'Europe (Ireland)', hint: 'eu-west-1' },
      { value: 'eu-west-2', label: 'Europe (London)', hint: 'eu-west-2' },
      { value: 'eu-west-3', label: 'Europe (Paris)', hint: 'eu-west-3' },
      { value: 'eu-south-1', label: 'Europe (Milan)', hint: 'eu-south-1' },
      { value: 'eu-north-1', label: 'Europe (Stockholm)', hint: 'eu-north-1' },
      { value: 'me-south-1', label: 'Middle East (Bahrain)', hint: 'me-south-1' },
      { value: 'sa-east-1', label: 'South America (São Paulo)', hint: 'sa-east-1' },
    ],
    initialValue: defaultRegion || 'us-east-1',
  });

  if (clack.isCancel(region)) {
    clack.cancel('Operation cancelled.');
    process.exit(0);
  }

  return region as string;
}

/**
 * Prompt for domain to verify (optional)
 */
export async function promptDomain(): Promise<string> {
  const domain = await clack.text({
    message: 'Domain to verify (optional):',
    placeholder: 'myapp.com',
    validate: (value) => {
      if (!value) return; // Optional
      if (!value.includes('.')) {
        return 'Please enter a valid domain (e.g., myapp.com)';
      }
    },
  });

  if (clack.isCancel(domain)) {
    clack.cancel('Operation cancelled.');
    process.exit(0);
  }

  return domain || '';
}

/**
 * Vercel configuration
 */
export interface VercelConfig {
  teamSlug: string;
  projectName: string;
}

/**
 * Prompt for Vercel configuration
 */
export async function promptVercelConfig(): Promise<VercelConfig> {
  const config = await clack.group(
    {
      teamSlug: () =>
        clack.text({
          message: 'Vercel team slug:',
          placeholder: 'my-team',
          validate: (value) => {
            if (!value) return 'Team slug is required for Vercel integration';
          },
        }),
      projectName: () =>
        clack.text({
          message: 'Vercel project name:',
          placeholder: 'my-project',
          validate: (value) => {
            if (!value) return 'Project name is required';
          },
        }),
    },
    {
      onCancel: () => {
        clack.cancel('Operation cancelled.');
        process.exit(0);
      },
    }
  );

  return config as VercelConfig;
}

/**
 * Prompt for integration level
 */
export async function promptIntegrationLevel(): Promise<'dashboard-only' | 'enhanced'> {
  const level = await clack.select({
    message: 'Integration level:',
    options: [
      {
        value: 'enhanced',
        label: 'Enhanced (full email tracking)',
        hint: 'Creates SES config, DynamoDB, Lambda functions',
      },
      {
        value: 'dashboard-only',
        label: 'Dashboard-only (read-only)',
        hint: 'Only creates IAM role for dashboard access',
      },
    ],
  });

  if (clack.isCancel(level)) {
    clack.cancel('Operation cancelled.');
    process.exit(0);
  }

  return level as 'dashboard-only' | 'enhanced';
}

/**
 * Confirm deployment
 */
export async function confirmDeploy(): Promise<boolean> {
  const confirmed = await clack.confirm({
    message: 'Deploy infrastructure to your AWS account?',
    initialValue: true,
  });

  if (clack.isCancel(confirmed)) {
    clack.cancel('Operation cancelled.');
    process.exit(0);
  }

  return confirmed;
}
