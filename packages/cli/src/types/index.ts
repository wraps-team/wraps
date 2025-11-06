/**
 * Hosting provider type
 */
export type Provider = 'vercel' | 'aws' | 'railway' | 'other';

/**
 * Integration level type
 */
export type IntegrationLevel = 'dashboard-only' | 'enhanced';

/**
 * Email stack configuration
 */
export interface EmailStackConfig {
  provider: Provider;
  region: string;
  domain?: string;
  vercel?: {
    teamSlug: string;
    projectName: string;
  };
  integrationLevel: IntegrationLevel;
  webhookUrl?: string;
}

/**
 * Pulumi stack outputs
 */
export interface StackOutputs {
  roleArn: string;
  configSetName?: string;
  tableName?: string;
  region: string;
  lambdaFunctions?: string[];
  snsTopics?: string[];
  domain?: string;
  dkimTokens?: string[];
  dnsAutoCreated?: boolean;
}

/**
 * Command options for init
 */
export interface InitOptions {
  provider?: Provider;
  region?: string;
  domain?: string;
  enhanced?: boolean;
  yes?: boolean;
}

/**
 * Command options for connect
 */
export interface ConnectOptions {
  existing?: boolean;
  dashboardOnly?: boolean;
  enhanced?: boolean;
}

/**
 * Command options for status
 */
export interface StatusOptions {
  account?: string;
}

/**
 * Command options for verify
 */
export interface VerifyOptions {
  domain: string;
}

/**
 * Command options for upgrade
 */
export interface UpgradeOptions {
  enhanced?: boolean;
}

/**
 * Command options for destroy
 */
export interface DestroyOptions {
  yes?: boolean;
}
