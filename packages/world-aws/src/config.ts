/**
 * Configuration options for the AWS World implementation.
 *
 * All fields are optional — values are resolved from explicit config,
 * then environment variables, then built-in defaults (in that order).
 *
 * | Field           | Env Var                           | Default          |
 * |-----------------|-----------------------------------|------------------|
 * | `region`        | `AWS_REGION` / `AWS_DEFAULT_REGION`| `"us-east-1"`   |
 * | `tablePrefix`   | `WORKFLOW_AWS_TABLE_PREFIX`        | `"workflow"`     |
 * | `queuePrefix`   | `WORKFLOW_AWS_QUEUE_PREFIX`        | `"workflow"`     |
 * | `endpoint`      | `WORKFLOW_AWS_ENDPOINT`            | —                |
 * | `deploymentId`  | `WORKFLOW_AWS_DEPLOYMENT_ID`       | `"aws-{region}"` |
 * | `encryptionKey` | `WORKFLOW_AWS_ENCRYPTION_KEY`      | —                |
 */
export type AWSWorldConfig = {
  /** AWS region for DynamoDB and SQS. */
  region?: string;
  /** Prefix for DynamoDB table names (e.g. `"workflow"` → `"workflow-runs"`). */
  tablePrefix?: string;
  /** Prefix for SQS queue names (e.g. `"workflow"` → `"workflow-workflows"`). */
  queuePrefix?: string;
  /** Custom endpoint for local development (e.g. DynamoDB Local). */
  endpoint?: string;
  /** Deployment identifier used for encryption key derivation. Defaults to `"aws-{region}"`. */
  deploymentId?: string;
  /** Base64-encoded 32-byte key for per-run encryption via HKDF-SHA256. */
  encryptionKey?: string;
};

/** @internal Fully-resolved configuration with all defaults applied. */
export type ResolvedConfig = {
  region: string;
  tablePrefix: string;
  queuePrefix: string;
  endpoint: string | undefined;
  deploymentId: string;
  encryptionKey: string | undefined;
};

/**
 * @internal Resolves configuration from explicit config → env vars → defaults.
 *
 * Validates the encryption key format (must be base64-encoded 32 bytes) when
 * provided, throwing at config time rather than at first encryption call.
 */
export function resolveConfig(config?: AWSWorldConfig): ResolvedConfig {
  const region =
    config?.region ??
    process.env.AWS_REGION ??
    process.env.AWS_DEFAULT_REGION ??
    "us-east-1";

  const tablePrefix =
    config?.tablePrefix ?? process.env.WORKFLOW_AWS_TABLE_PREFIX ?? "workflow";
  const queuePrefix =
    config?.queuePrefix ?? process.env.WORKFLOW_AWS_QUEUE_PREFIX ?? "workflow";
  const endpoint = config?.endpoint ?? process.env.WORKFLOW_AWS_ENDPOINT;
  const deploymentId =
    config?.deploymentId ??
    process.env.WORKFLOW_AWS_DEPLOYMENT_ID ??
    `aws-${region}`;
  const encryptionKey =
    config?.encryptionKey ?? process.env.WORKFLOW_AWS_ENCRYPTION_KEY;

  if (encryptionKey) {
    try {
      const raw = Uint8Array.from(atob(encryptionKey), (c) => c.charCodeAt(0));
      if (raw.length !== 32) {
        throw new Error(`must decode to 32 bytes, got ${raw.length}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("must decode to")) {
        throw new Error(
          `Invalid WORKFLOW_AWS_ENCRYPTION_KEY: ${e.message}. Must be a base64-encoded 32-byte key.`
        );
      }
      throw new Error(
        "Invalid WORKFLOW_AWS_ENCRYPTION_KEY: not valid base64. Must be a base64-encoded 32-byte key."
      );
    }
  }

  return {
    region,
    tablePrefix,
    queuePrefix,
    endpoint,
    deploymentId,
    encryptionKey,
  };
}
