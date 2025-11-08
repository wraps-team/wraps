/**
 * Hosting provider type
 */
export type Provider = "vercel" | "aws" | "railway" | "other";

/**
 * Integration level type
 */
export type IntegrationLevel = "dashboard-only" | "enhanced";

/**
 * Email stack configuration
 */
export type EmailStackConfig = {
  provider: Provider;
  region: string;
  domain?: string;
  vercel?: {
    teamSlug: string;
    projectName: string;
  };
  integrationLevel: IntegrationLevel;
  webhookUrl?: string;
};

/**
 * Pulumi stack outputs
 */
export type StackOutputs = {
  roleArn: string;
  configSetName?: string;
  tableName?: string;
  region: string;
  lambdaFunctions?: string[];
  snsTopics?: string[];
  domain?: string;
  dkimTokens?: string[];
  dnsAutoCreated?: boolean;
};

/**
 * Command options for init
 */
export type InitOptions = {
  provider?: Provider;
  region?: string;
  domain?: string;
  enhanced?: boolean;
  yes?: boolean;
};

/**
 * Available features for BYO email infrastructure
 */
export type BYOFeature =
  | "configSet"
  | "bounceHandling"
  | "complaintHandling"
  | "emailHistory"
  | "eventProcessor"
  | "dashboardAccess";

/**
 * Feature metadata
 */
export type BYOFeatureMetadata = {
  id: BYOFeature;
  name: string;
  description: string;
  requires?: BYOFeature[];
  resources: string[];
};

/**
 * Command options for connect
 */
export type ConnectOptions = {
  provider?: Provider;
  region?: string;
  yes?: boolean;
};

/**
 * Command options for status
 */
export type StatusOptions = {
  account?: string;
};

/**
 * Command options for verify
 */
export type VerifyOptions = {
  domain: string;
};

/**
 * Command options for upgrade
 */
export type UpgradeOptions = {
  region?: string;
  yes?: boolean;
};

/**
 * Command options for destroy
 */
export type DestroyOptions = {
  yes?: boolean;
};

/**
 * Command options for console
 */
export type ConsoleOptions = {
  port?: number;
  noOpen?: boolean;
};
