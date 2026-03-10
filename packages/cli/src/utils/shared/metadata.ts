import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AdditionalDomain,
  CdnConfigPreset,
  EmailConfigPreset,
  EmailStackConfig,
  InboundDomain,
  Provider,
  ServiceType,
  SMSConfigPreset,
  WrapsCdnConfig,
  WrapsEmailConfig,
  WrapsSMSConfig,
} from "../../types/index.js";
import { ensureWrapsDir, getWrapsDir } from "./fs.js";
import type { DNSProviderType } from "./prompts.js";

/**
 * SMTP credentials metadata (IAM user tracking, not actual credentials)
 */
export type SMTPCredentialsMetadata = {
  enabled: boolean;
  iamUserArn: string;
  createdAt: string;
};

/**
 * Service-specific configuration with metadata
 */
export type ServiceConfig<TConfig, TPreset> = {
  preset?: TPreset;
  config: TConfig;
  pulumiStackName?: string;
  deployedAt: string;
  // Webhook configuration for Wraps platform integration
  webhookSecret?: string; // API key for webhook authentication (uses metadata.accountId as AWS account number)
  // SMTP credentials metadata (actual credentials shown once, only ARN stored)
  smtpCredentials?: SMTPCredentialsMetadata;
  // DNS provider used for automatic DNS record management
  dnsProvider?: DNSProviderType;
};

/**
 * Connection metadata - supports multiple services per AWS account/region
 */
export type ConnectionMetadata = {
  version: string; // Metadata format version (e.g., "1.0.0")
  accountId: string;
  region: string;
  provider: Provider;
  timestamp: string; // Last updated timestamp
  vercel?: {
    teamSlug: string;
    projectName: string;
  };

  // State backend information (optional, informational)
  stateBackend?: {
    type: "s3" | "local";
    bucket?: string;
    migratedAt?: string;
  };

  // Platform-specific data (from authenticated `platform connect`)
  platform?: {
    externalId?: string;
    connectionId?: string;
  };

  // Service-specific configurations
  services: {
    email?: ServiceConfig<WrapsEmailConfig, EmailConfigPreset>;
    sms?: ServiceConfig<WrapsSMSConfig, SMSConfigPreset>;
    cdn?: ServiceConfig<WrapsCdnConfig, CdnConfigPreset>;
  };
};

/**
 * Legacy connection metadata (for backwards compatibility)
 * @deprecated Use ConnectionMetadata instead
 */
export type LegacyConnectionMetadata = {
  accountId: string;
  region: string;
  provider: Provider;
  timestamp: string;
  preset?: EmailConfigPreset;
  emailConfig: WrapsEmailConfig;
  vercel?: {
    teamSlug: string;
    projectName: string;
  };
  pulumiStackName?: string;
};

/**
 * Get the connections directory
 */
function getConnectionsDir(): string {
  return join(getWrapsDir(), "connections");
}

/**
 * Get metadata file path for an account and region
 */
function getMetadataPath(accountId: string, region: string): string {
  return join(getConnectionsDir(), `${accountId}-${region}.json`);
}

/**
 * Ensure the connections directory exists
 */
async function ensureConnectionsDir(): Promise<void> {
  await ensureWrapsDir();
  const connectionsDir = getConnectionsDir();
  if (!existsSync(connectionsDir)) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(connectionsDir, { recursive: true });
  }
}

/**
 * Migrate legacy metadata to new multi-service format
 */
function migrateLegacyMetadata(
  legacy: LegacyConnectionMetadata
): ConnectionMetadata {
  return {
    version: "1.0.0",
    accountId: legacy.accountId,
    region: legacy.region,
    provider: legacy.provider,
    timestamp: legacy.timestamp,
    vercel: legacy.vercel,
    services: {
      email: {
        preset: legacy.preset,
        config: legacy.emailConfig,
        pulumiStackName: legacy.pulumiStackName,
        deployedAt: legacy.timestamp,
      },
    },
  };
}

/**
 * Check if metadata is in legacy format
 */
function isLegacyMetadata(data: any): data is LegacyConnectionMetadata {
  return (
    "emailConfig" in data &&
    !("services" in data) &&
    typeof data.emailConfig === "object"
  );
}

/**
 * Load connection metadata from disk (with S3 fallback)
 * Automatically migrates legacy format to new multi-service format.
 * When S3 state is available, compares timestamps and uses the newer version.
 */
export async function loadConnectionMetadata(
  accountId: string,
  region: string
): Promise<ConnectionMetadata | null> {
  const metadataPath = getMetadataPath(accountId, region);

  let localData: ConnectionMetadata | null = null;

  if (existsSync(metadataPath)) {
    try {
      const content = await readFile(metadataPath, "utf-8");
      const data = JSON.parse(content);

      // Migrate legacy format if needed
      if (isLegacyMetadata(data)) {
        const migrated = migrateLegacyMetadata(data);
        // Save migrated version locally
        await saveConnectionMetadataLocal(migrated);
        localData = migrated;
      } else {
        // Add version if missing
        if (!data.version) {
          data.version = "1.0.0";
          await saveConnectionMetadataLocal(data);
        }
        localData = data as ConnectionMetadata;
      }

      // Migrate single-domain inbound to multi-domain inboundDomains
      if (localData && migrateInboundToMultiDomain(localData)) {
        await saveConnectionMetadataLocal(localData);
      }
    } catch (error) {
      console.error(
        "Error loading connection metadata:",
        error instanceof Error ? error.message : error
      );
    }
  }

  // Try S3 sync if not in local-only mode
  if (process.env.WRAPS_LOCAL_ONLY !== "1") {
    try {
      const {
        stateBucketExists,
        downloadMetadata,
        uploadMetadata,
        getStateBucketName,
      } = await import("./s3-state.js");

      const bucketExists = await stateBucketExists(accountId, region);
      if (bucketExists) {
        const bucketName = getStateBucketName(accountId, region);
        const remoteData = await downloadMetadata(
          bucketName,
          accountId,
          region
        );

        if (remoteData && localData) {
          // Compare timestamps, use the newer one
          if (remoteData.timestamp > localData.timestamp) {
            // Remote is newer — update local cache
            await saveConnectionMetadataLocal(remoteData);
            return remoteData;
          }
          if (localData.timestamp > remoteData.timestamp) {
            // Local is newer — sync to S3
            await uploadMetadata(bucketName, localData).catch(() => {});
            return localData;
          }
          return localData;
        }

        if (remoteData && !localData) {
          // Remote exists but local doesn't — write local cache
          await saveConnectionMetadataLocal(remoteData);
          return remoteData;
        }

        if (localData && !remoteData) {
          // Local exists but remote doesn't — sync to S3
          await uploadMetadata(bucketName, localData).catch(() => {});
        }
      }
    } catch {
      // S3 errors are silent — local data is the fallback
    }
  }

  return localData;
}

/**
 * Save connection metadata to local disk only (no S3 sync)
 */
async function saveConnectionMetadataLocal(
  metadata: ConnectionMetadata
): Promise<void> {
  await ensureConnectionsDir();
  const metadataPath = getMetadataPath(metadata.accountId, metadata.region);

  const content = JSON.stringify(metadata, null, 2);
  await writeFile(metadataPath, content, "utf-8");
}

/**
 * Save connection metadata to disk (with S3 write-through)
 */
export async function saveConnectionMetadata(
  metadata: ConnectionMetadata
): Promise<void> {
  await ensureConnectionsDir();
  const metadataPath = getMetadataPath(metadata.accountId, metadata.region);

  try {
    const content = JSON.stringify(metadata, null, 2);
    await writeFile(metadataPath, content, "utf-8");
  } catch (error) {
    console.error(
      "Error saving connection metadata:",
      error instanceof Error ? error.message : error
    );
    throw error;
  }

  // S3 write-through (best-effort, never blocks)
  if (process.env.WRAPS_LOCAL_ONLY !== "1") {
    try {
      const { stateBucketExists, uploadMetadata, getStateBucketName } =
        await import("./s3-state.js");

      const bucketExists = await stateBucketExists(
        metadata.accountId,
        metadata.region
      );
      if (bucketExists) {
        const bucketName = getStateBucketName(
          metadata.accountId,
          metadata.region
        );
        await uploadMetadata(bucketName, metadata);
      }
    } catch {
      // S3 write failure is silent — local write already succeeded
    }
  }
}

/**
 * Delete connection metadata (local + S3)
 */
export async function deleteConnectionMetadata(
  accountId: string,
  region: string
): Promise<void> {
  const metadataPath = getMetadataPath(accountId, region);

  if (existsSync(metadataPath)) {
    const { unlink } = await import("node:fs/promises");
    await unlink(metadataPath);
  }

  // Also delete from S3 (best-effort, never blocks)
  if (process.env.WRAPS_LOCAL_ONLY !== "1") {
    try {
      const { stateBucketExists, deleteMetadata, getStateBucketName } =
        await import("./s3-state.js");

      const bucketExists = await stateBucketExists(accountId, region);
      if (bucketExists) {
        const bucketName = getStateBucketName(accountId, region);
        await deleteMetadata(bucketName, accountId, region);
      }
    } catch {
      // S3 delete failure is silent — local delete already succeeded
    }
  }
}

/**
 * List all connections
 */
export async function listConnections(): Promise<ConnectionMetadata[]> {
  const connectionsDir = getConnectionsDir();

  if (!existsSync(connectionsDir)) {
    return [];
  }

  try {
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(connectionsDir);
    const connections: ConnectionMetadata[] = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        const content = await readFile(join(connectionsDir, file), "utf-8");
        try {
          const metadata = JSON.parse(content) as ConnectionMetadata;
          connections.push(metadata);
        } catch (error) {
          console.error(`Error parsing ${file}:`, error);
        }
      }
    }

    return connections;
  } catch (error) {
    console.error(
      "Error listing connections:",
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

/**
 * Check if a connection exists
 */
export async function connectionExists(
  accountId: string,
  region: string
): Promise<boolean> {
  const metadataPath = getMetadataPath(accountId, region);
  return existsSync(metadataPath);
}

/**
 * Create initial connection metadata
 * @deprecated Use addServiceToConnection instead
 */
export function createConnectionMetadata(
  accountId: string,
  region: string,
  provider: Provider,
  emailConfig: WrapsEmailConfig,
  preset?: EmailConfigPreset
): ConnectionMetadata {
  return {
    version: "1.0.0",
    accountId,
    region,
    provider,
    timestamp: new Date().toISOString(),
    services: {
      email: {
        preset,
        config: emailConfig,
        deployedAt: new Date().toISOString(),
      },
    },
  };
}

function setConfigValue<K extends keyof WrapsEmailConfig>(
  config: WrapsEmailConfig,
  key: K,
  value: WrapsEmailConfig[K]
): void {
  config[key] = value;
}

/**
 * Apply config updates to existing config while preserving user-customized fields.
 *
 * This function starts with the existing config and applies updates,
 * while ensuring user-customized fields are never lost:
 * - domain (sending identity)
 * - mailFromDomain (custom MAIL FROM subdomain)
 * - tracking.customRedirectDomain (custom tracking domain)
 * - tracking.httpsEnabled (HTTPS tracking via CloudFront)
 */
export function applyConfigUpdates(
  existingConfig: WrapsEmailConfig,
  updates: Partial<WrapsEmailConfig>
): WrapsEmailConfig {
  // Start with existing config (ensures all required fields are present)
  const result = { ...existingConfig };

  // Apply each update, with special handling for nested objects
  for (const key of Object.keys(updates) as Array<keyof WrapsEmailConfig>) {
    const value = updates[key];
    if (value === undefined) {
      continue;
    }

    if (key === "tracking" && typeof value === "object") {
      // Merge tracking updates while preserving user-customized fields
      const trackingUpdate = value as NonNullable<WrapsEmailConfig["tracking"]>;
      result.tracking = {
        ...result.tracking,
        ...trackingUpdate,
        // Always preserve these if they exist in original
        customRedirectDomain:
          result.tracking?.customRedirectDomain ||
          trackingUpdate.customRedirectDomain,
        httpsEnabled:
          result.tracking?.httpsEnabled ?? trackingUpdate.httpsEnabled,
      };
    } else if (key === "eventTracking" && typeof value === "object") {
      // Deep merge eventTracking
      result.eventTracking = {
        ...result.eventTracking,
        ...(value as NonNullable<WrapsEmailConfig["eventTracking"]>),
      } as NonNullable<WrapsEmailConfig["eventTracking"]>;
    } else if (key === "suppressionList" && typeof value === "object") {
      // Deep merge suppressionList
      result.suppressionList = {
        ...result.suppressionList,
        ...(value as NonNullable<WrapsEmailConfig["suppressionList"]>),
      } as NonNullable<WrapsEmailConfig["suppressionList"]>;
    } else if (key === "emailArchiving" && typeof value === "object") {
      // Deep merge emailArchiving
      result.emailArchiving = {
        ...result.emailArchiving,
        ...(value as NonNullable<WrapsEmailConfig["emailArchiving"]>),
      } as NonNullable<WrapsEmailConfig["emailArchiving"]>;
    } else if (key === "smtpCredentials" && typeof value === "object") {
      // Deep merge smtpCredentials
      result.smtpCredentials = {
        ...result.smtpCredentials,
        ...(value as NonNullable<WrapsEmailConfig["smtpCredentials"]>),
      } as NonNullable<WrapsEmailConfig["smtpCredentials"]>;
    } else if (key === "inbound" && typeof value === "object") {
      // Deep merge inbound
      result.inbound = {
        ...result.inbound,
        ...(value as NonNullable<WrapsEmailConfig["inbound"]>),
      } as NonNullable<WrapsEmailConfig["inbound"]>;
    } else if (key === "alerts" && typeof value === "object") {
      // Deep merge alerts (has nested thresholds)
      const alertUpdate = value as NonNullable<WrapsEmailConfig["alerts"]>;
      result.alerts = {
        ...result.alerts,
        ...alertUpdate,
        thresholds: {
          ...result.alerts?.thresholds,
          ...alertUpdate.thresholds,
        },
      } as NonNullable<WrapsEmailConfig["alerts"]>;
    } else if (key === "userWebhook" && typeof value === "object") {
      // Deep merge userWebhook
      result.userWebhook = {
        ...result.userWebhook,
        ...(value as NonNullable<WrapsEmailConfig["userWebhook"]>),
      } as NonNullable<WrapsEmailConfig["userWebhook"]>;
    } else {
      // Direct assignment for primitives and other objects
      setConfigValue(result, key, value as WrapsEmailConfig[typeof key]);
    }
  }

  return result;
}

/**
 * Update email configuration in metadata
 * @deprecated Use updateServiceConfig instead
 */
export function updateEmailConfig(
  metadata: ConnectionMetadata,
  emailConfig: Partial<WrapsEmailConfig>
): void {
  if (!metadata.services.email) {
    throw new Error("Email service not configured in metadata");
  }

  // Apply updates while preserving user-customized fields
  metadata.services.email.config = applyConfigUpdates(
    metadata.services.email.config,
    emailConfig
  );

  metadata.timestamp = new Date().toISOString();
}

/**
 * Add a service to an existing connection or create new connection metadata
 */
export function addServiceToConnection(
  accountId: string,
  region: string,
  provider: Provider,
  service: ServiceType,
  config: WrapsEmailConfig | WrapsSMSConfig | WrapsCdnConfig,
  preset?: EmailConfigPreset | SMSConfigPreset | CdnConfigPreset,
  existingMetadata?: ConnectionMetadata
): ConnectionMetadata {
  const timestamp = new Date().toISOString();

  if (existingMetadata) {
    // Add service to existing connection
    if (service === "email") {
      existingMetadata.services.email = {
        preset: preset as EmailConfigPreset,
        config: config as WrapsEmailConfig,
        deployedAt: timestamp,
      };
    } else if (service === "sms") {
      existingMetadata.services.sms = {
        preset: preset as SMSConfigPreset,
        config: config as WrapsSMSConfig,
        deployedAt: timestamp,
      };
    } else if (service === "cdn") {
      existingMetadata.services.cdn = {
        preset: preset as CdnConfigPreset,
        config: config as WrapsCdnConfig,
        deployedAt: timestamp,
      };
    }
    existingMetadata.timestamp = timestamp;
    return existingMetadata;
  }

  // Create new connection metadata
  const metadata: ConnectionMetadata = {
    version: "1.0.0",
    accountId,
    region,
    provider,
    timestamp,
    services: {},
  };

  if (service === "email") {
    metadata.services.email = {
      preset: preset as EmailConfigPreset,
      config: config as WrapsEmailConfig,
      deployedAt: timestamp,
    };
  } else if (service === "sms") {
    metadata.services.sms = {
      preset: preset as SMSConfigPreset,
      config: config as WrapsSMSConfig,
      deployedAt: timestamp,
    };
  } else if (service === "cdn") {
    metadata.services.cdn = {
      preset: preset as CdnConfigPreset,
      config: config as WrapsCdnConfig,
      deployedAt: timestamp,
    };
  }

  return metadata;
}

/**
 * Shallow merge that deep-merges nested objects (one level).
 * Used by updateServiceConfig for SMS/CDN configs to prevent
 * partial updates from replacing entire nested objects.
 */
function shallowMergeWithNestedObjects<T extends Record<string, unknown>>(
  existing: T,
  updates: Partial<T>
): T {
  const result = { ...existing };
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      continue;
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      (result as Record<string, unknown>)[key] = {
        ...(existing[key] as Record<string, unknown> | undefined),
        ...(value as Record<string, unknown>),
      };
    } else {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

/**
 * Update service configuration in metadata
 */
export function updateServiceConfig<T extends ServiceType>(
  metadata: ConnectionMetadata,
  service: T,
  config: T extends "email"
    ? Partial<WrapsEmailConfig>
    : T extends "sms"
      ? Partial<WrapsSMSConfig>
      : T extends "cdn"
        ? Partial<WrapsCdnConfig>
        : never
): void {
  if (service === "email" && metadata.services.email) {
    metadata.services.email.config = applyConfigUpdates(
      metadata.services.email.config,
      config as Partial<WrapsEmailConfig>
    );
  } else if (service === "sms" && metadata.services.sms) {
    metadata.services.sms.config = shallowMergeWithNestedObjects(
      metadata.services.sms.config,
      config as Partial<WrapsSMSConfig>
    );
  } else if (service === "cdn" && metadata.services.cdn) {
    metadata.services.cdn.config = shallowMergeWithNestedObjects(
      metadata.services.cdn.config,
      config as Partial<WrapsCdnConfig>
    );
  } else {
    throw new Error(`${service} service not configured in metadata`);
  }

  metadata.timestamp = new Date().toISOString();
}

/**
 * Remove a service from connection metadata
 */
export function removeServiceFromConnection(
  metadata: ConnectionMetadata,
  service: ServiceType
): void {
  if (service === "email") {
    const { email, ...rest } = metadata.services;
    metadata.services = rest;
  } else if (service === "sms") {
    const { sms, ...rest } = metadata.services;
    metadata.services = rest;
  } else if (service === "cdn") {
    const { cdn, ...rest } = metadata.services;
    metadata.services = rest;
  }
  metadata.timestamp = new Date().toISOString();
}

/**
 * Check if a service is configured in metadata
 */
export function hasService(
  metadata: ConnectionMetadata,
  service: ServiceType
): boolean {
  if (service === "email") {
    return metadata.services.email !== undefined;
  }
  if (service === "sms") {
    return metadata.services.sms !== undefined;
  }
  if (service === "cdn") {
    return metadata.services.cdn !== undefined;
  }
  return false;
}

/**
 * Get list of configured services in metadata
 */
export function getConfiguredServices(
  metadata: ConnectionMetadata
): ServiceType[] {
  const services: ServiceType[] = [];
  if (metadata.services.email) {
    services.push("email");
  }
  if (metadata.services.sms) {
    services.push("sms");
  }
  if (metadata.services.cdn) {
    services.push("cdn");
  }
  return services;
}

/**
 * Find all connections for a specific AWS account
 * Useful for auto-detecting region when user doesn't specify one
 */
export async function findConnectionsForAccount(
  accountId: string
): Promise<ConnectionMetadata[]> {
  const allConnections = await listConnections();
  return allConnections.filter((conn) => conn.accountId === accountId);
}

/**
 * Find connections for an account that have a specific service configured
 */
export async function findConnectionsWithService(
  accountId: string,
  service: ServiceType
): Promise<ConnectionMetadata[]> {
  const accountConnections = await findConnectionsForAccount(accountId);
  return accountConnections.filter((conn) => hasService(conn, service));
}

/**
 * Build a complete EmailStackConfig from metadata.
 *
 * All commands that redeploy existing infrastructure MUST use this helper
 * to prevent Pulumi from silently destroying late-configured resources
 * (e.g. webhook/EventBridge API Destination) when a property is missing
 * from the stack config.
 *
 * For fresh deployments (init, connect), use manual construction instead
 * since there is no existing metadata to preserve.
 */
export function buildEmailStackConfig(
  metadata: ConnectionMetadata,
  region: string,
  overrides?: {
    emailConfig?: WrapsEmailConfig;
    webhook?: EmailStackConfig["webhook"] | undefined;
  }
): EmailStackConfig {
  const emailService = metadata.services.email;
  let webhook: EmailStackConfig["webhook"] | undefined;

  if (overrides && "webhook" in overrides) {
    // Explicit override (including deliberate removal via undefined)
    webhook = overrides.webhook;
  } else if (emailService?.webhookSecret) {
    // Default: reconstruct from metadata
    webhook = {
      awsAccountNumber: metadata.accountId,
      webhookSecret: emailService.webhookSecret,
    };
  }

  const emailConfig = overrides?.emailConfig ?? emailService?.config;
  if (!emailConfig) {
    throw new Error("Email service config not found in metadata");
  }

  return {
    provider: metadata.provider,
    region,
    vercel: metadata.vercel,
    emailConfig,
    webhook,
  };
}

/**
 * Generate a secure webhook secret for EventBridge API Destination
 * Uses 32 bytes (256 bits) of cryptographically secure random data
 * @returns hex-encoded 64 character string
 */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

// ---------------------------------------------------------------------------
// Additional domain helpers (for `wraps email domains add/remove/list`)
// ---------------------------------------------------------------------------

/**
 * Tracked domain entry returned by getAllTrackedDomains
 */
export type TrackedDomain = {
  domain: string;
  isPrimary: boolean;
  managed: boolean;
  purpose?: AdditionalDomain["purpose"];
  mailFromDomain?: string;
  addedAt?: string;
};

/**
 * Upsert a domain into additionalDomains.
 * If the domain already exists it is replaced; otherwise it is appended.
 * Mutates metadata in place (caller should save afterwards).
 */
export function addDomainToMetadata(
  metadata: ConnectionMetadata,
  entry: AdditionalDomain
): void {
  if (!metadata.services.email) {
    throw new Error("Email service not configured in metadata");
  }

  const config = metadata.services.email.config;
  const existing = config.additionalDomains ?? [];

  const idx = existing.findIndex((d) => d.domain === entry.domain);
  if (idx >= 0) {
    existing[idx] = entry;
  } else {
    existing.push(entry);
  }

  config.additionalDomains = existing;
  metadata.timestamp = new Date().toISOString();
}

/**
 * Remove a domain from additionalDomains by domain name.
 * No-op if the domain is not tracked.
 */
export function removeDomainFromMetadata(
  metadata: ConnectionMetadata,
  domain: string
): void {
  if (!metadata.services.email) {
    return;
  }

  const config = metadata.services.email.config;
  if (!config.additionalDomains) {
    return;
  }

  config.additionalDomains = config.additionalDomains.filter(
    (d) => d.domain !== domain
  );
  metadata.timestamp = new Date().toISOString();
}

/**
 * Look up a domain in the primary domain or additionalDomains list.
 * Returns null if not tracked at all.
 */
export function getDomainFromMetadata(
  metadata: ConnectionMetadata,
  domain: string
): { isPrimary: boolean; entry?: AdditionalDomain } | null {
  if (!metadata.services.email) {
    return null;
  }

  const config = metadata.services.email.config;

  // Check primary domain
  if (config.domain === domain) {
    return { isPrimary: true };
  }

  // Check additional domains
  const entry = config.additionalDomains?.find((d) => d.domain === domain);
  if (entry) {
    return { isPrimary: false, entry };
  }

  return null;
}

/**
 * Return the primary domain plus all additional domains as a flat list.
 */
export function getAllTrackedDomains(
  metadata: ConnectionMetadata
): TrackedDomain[] {
  if (!metadata.services.email) {
    return [];
  }

  const config = metadata.services.email.config;
  const result: TrackedDomain[] = [];

  // Primary domain (managed by Pulumi)
  if (config.domain) {
    result.push({
      domain: config.domain,
      isPrimary: true,
      managed: true,
      mailFromDomain: config.mailFromDomain,
    });
  }

  // Additional domains (managed by SES API)
  for (const d of config.additionalDomains ?? []) {
    result.push({
      domain: d.domain,
      isPrimary: false,
      managed: true,
      purpose: d.purpose,
      mailFromDomain: d.mailFromDomain,
      addedAt: d.addedAt,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Inbound domain helpers (for `wraps email inbound add/remove`)
// ---------------------------------------------------------------------------

/**
 * Migrate single-domain inbound config to multi-domain inboundDomains array.
 * Detects inbound.enabled === true with no inboundDomains and populates from
 * the existing inbound.receivingDomain. Returns true if migration was applied.
 */
export function migrateInboundToMultiDomain(
  metadata: ConnectionMetadata
): boolean {
  const emailConfig = metadata.services.email?.config;
  if (!emailConfig?.inbound?.enabled) {
    return false;
  }

  if (emailConfig.inboundDomains && emailConfig.inboundDomains.length > 0) {
    return false;
  }

  const inbound = emailConfig.inbound;
  const receivingDomain =
    inbound.receivingDomain ||
    (inbound.subdomain
      ? `${inbound.subdomain}.${emailConfig.domain}`
      : emailConfig.domain || null);

  if (!receivingDomain) {
    return false;
  }

  const parentDomain = emailConfig.domain || "";
  const subdomain = inbound.subdomain ?? "";

  emailConfig.inboundDomains = [
    {
      subdomain,
      receivingDomain,
      parentDomain,
      addedAt: metadata.services.email?.deployedAt || new Date().toISOString(),
    },
  ];

  return true;
}

/**
 * Add an inbound domain to metadata.
 * If the domain already exists it is replaced; otherwise it is appended.
 * Mutates metadata in place (caller should save afterwards).
 */
export function addInboundDomainToMetadata(
  metadata: ConnectionMetadata,
  entry: InboundDomain
): void {
  if (!metadata.services.email) {
    throw new Error("Email service not configured in metadata");
  }

  const config = metadata.services.email.config;
  const existing = config.inboundDomains ?? [];

  const idx = existing.findIndex(
    (d) => d.receivingDomain === entry.receivingDomain
  );
  if (idx >= 0) {
    existing[idx] = entry;
  } else {
    existing.push(entry);
  }

  config.inboundDomains = existing;
  metadata.timestamp = new Date().toISOString();
}

/**
 * Remove an inbound domain from metadata by receiving domain name.
 * No-op if the domain is not tracked.
 */
export function removeInboundDomainFromMetadata(
  metadata: ConnectionMetadata,
  receivingDomain: string
): void {
  if (!metadata.services.email) {
    return;
  }

  const config = metadata.services.email.config;
  if (!config.inboundDomains) {
    return;
  }

  config.inboundDomains = config.inboundDomains.filter(
    (d) => d.receivingDomain !== receivingDomain
  );
  metadata.timestamp = new Date().toISOString();
}
