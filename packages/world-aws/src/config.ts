export type AWSWorldConfig = {
  region?: string;
  tablePrefix?: string;
  queuePrefix?: string;
  endpoint?: string;
  deploymentId?: string;
  encryptionKey?: string;
};

export type ResolvedConfig = {
  region: string;
  tablePrefix: string;
  queuePrefix: string;
  endpoint: string | undefined;
  deploymentId: string;
  encryptionKey: string | undefined;
};

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

  return {
    region,
    tablePrefix,
    queuePrefix,
    endpoint,
    deploymentId,
    encryptionKey,
  };
}
