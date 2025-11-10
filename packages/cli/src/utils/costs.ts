import type {
  ArchiveRetention,
  FeatureCost,
  FeatureCostBreakdown,
  WrapsEmailConfig,
} from "../types/index.js";

/**
 * AWS pricing constants (as of 2025)
 * All costs in USD
 */
const AWS_PRICING = {
  // SES pricing
  SES_PER_EMAIL: 0.0001, // $0.10 per 1,000 emails
  SES_ATTACHMENT_PER_GB: 0.12, // $0.12 per GB of attachments

  // DynamoDB pricing (on-demand)
  DYNAMODB_WRITE_PER_MILLION: 1.25, // $1.25 per million write request units
  DYNAMODB_READ_PER_MILLION: 0.25, // $0.25 per million read request units
  DYNAMODB_STORAGE_PER_GB: 0.25, // $0.25 per GB-month

  // Lambda pricing
  LAMBDA_REQUESTS_PER_MILLION: 0.2, // $0.20 per 1M requests
  LAMBDA_COMPUTE_PER_GB_SECOND: 0.000_016_666_7, // $0.0000166667 per GB-second

  // SQS pricing
  SQS_REQUESTS_PER_MILLION: 0.4, // $0.40 per million requests (beyond free tier)

  // EventBridge pricing
  EVENTBRIDGE_EVENTS_PER_MILLION: 1.0, // $1.00 per million custom events

  // Dedicated IP
  DEDICATED_IP_PER_MONTH: 24.95, // $24.95 per dedicated IP per month

  // CloudWatch pricing
  CLOUDWATCH_LOGS_PER_GB: 0.5, // $0.50 per GB ingested
  CLOUDWATCH_LOGS_STORAGE_PER_GB: 0.03, // $0.03 per GB-month
} as const;

/**
 * Free tier limits (monthly)
 */
const FREE_TIER = {
  SES_EMAILS: 62_000, // 62,000 emails per month from EC2 (3,000 from other services)
  LAMBDA_REQUESTS: 1_000_000, // 1M requests per month
  LAMBDA_COMPUTE_GB_SECONDS: 400_000, // 400,000 GB-seconds per month
  DYNAMODB_WRITES: 1_000_000, // 1M write request units per month (on-demand)
  DYNAMODB_READS: 1_000_000, // 1M read request units per month (on-demand)
  DYNAMODB_STORAGE_GB: 25, // 25 GB storage per month
  SQS_REQUESTS: 1_000_000, // 1M requests per month
  CLOUDWATCH_LOGS_GB: 5, // 5 GB ingestion per month
} as const;

/**
 * Estimate storage size in GB based on retention period and email volume
 */
function estimateStorageSize(
  emailsPerMonth: number,
  retention: ArchiveRetention
): number {
  // Average email event record size: ~2 KB (including metadata)
  const avgRecordSizeKB = 2;

  // Calculate total months of retention
  const retentionMonths = {
    "7days": 0.25,
    "30days": 1,
    "90days": 3,
    "1year": 12,
    indefinite: 24, // Assume 2 years for cost estimation
  }[retention];

  // Total storage = emails/month * months * record size
  const totalKB = emailsPerMonth * retentionMonths * avgRecordSizeKB;
  return totalKB / 1024 / 1024; // Convert to GB
}

/**
 * Calculate cost for event tracking feature
 */
function calculateEventTrackingCost(
  config: WrapsEmailConfig,
  emailsPerMonth: number
): FeatureCost | undefined {
  if (!config.eventTracking?.enabled) {
    return;
  }

  let monthlyCost = 0;
  const components: string[] = [];

  // EventBridge custom events
  if (config.eventTracking.eventBridge) {
    const eventCount =
      emailsPerMonth * (config.eventTracking.events?.length || 10);
    const eventCost =
      Math.max(0, eventCount - FREE_TIER.SQS_REQUESTS) *
      (AWS_PRICING.EVENTBRIDGE_EVENTS_PER_MILLION / 1_000_000);
    monthlyCost += eventCost;
    components.push("EventBridge");
  }

  // SQS queue costs
  const sqsRequests = emailsPerMonth * 2; // 1 send + 1 receive
  const sqsCost =
    Math.max(0, sqsRequests - FREE_TIER.SQS_REQUESTS) *
    (AWS_PRICING.SQS_REQUESTS_PER_MILLION / 1_000_000);
  monthlyCost += sqsCost;
  components.push("SQS");

  // Lambda processing costs
  const lambdaInvocations = emailsPerMonth;
  const lambdaCost =
    Math.max(0, lambdaInvocations - FREE_TIER.LAMBDA_REQUESTS) *
    (AWS_PRICING.LAMBDA_REQUESTS_PER_MILLION / 1_000_000);
  // Assume 512MB memory, 100ms average execution
  const computeGBSeconds = lambdaInvocations * 0.5 * 0.1;
  const computeCost =
    Math.max(0, computeGBSeconds - FREE_TIER.LAMBDA_COMPUTE_GB_SECONDS) *
    AWS_PRICING.LAMBDA_COMPUTE_PER_GB_SECOND;
  monthlyCost += lambdaCost + computeCost;
  components.push("Lambda");

  return {
    monthly: monthlyCost,
    description: `Event processing pipeline (${components.join(" + ")})`,
  };
}

/**
 * Calculate cost for DynamoDB email history storage
 */
function calculateDynamoDBCost(
  config: WrapsEmailConfig,
  emailsPerMonth: number
): FeatureCost | undefined {
  if (!config.eventTracking?.dynamoDBHistory) {
    return;
  }

  const retention = config.eventTracking.archiveRetention || "90days";

  // Write costs (one write per email event)
  const writes = emailsPerMonth;
  const writeCost =
    Math.max(0, writes - FREE_TIER.DYNAMODB_WRITES) *
    (AWS_PRICING.DYNAMODB_WRITE_PER_MILLION / 1_000_000);

  // Storage costs
  const storageGB = estimateStorageSize(emailsPerMonth, retention);
  const storageCost =
    Math.max(0, storageGB - FREE_TIER.DYNAMODB_STORAGE_GB) *
    AWS_PRICING.DYNAMODB_STORAGE_PER_GB;

  return {
    monthly: writeCost + storageCost,
    description: `Email history storage (${retention}, ~${storageGB.toFixed(1)} GB)`,
  };
}

/**
 * Calculate cost for tracking features (opens/clicks)
 */
function calculateTrackingCost(
  config: WrapsEmailConfig
): FeatureCost | undefined {
  if (!config.tracking?.enabled) {
    return;
  }

  // Tracking is free - it's built into SES
  // Custom redirect domain might have minimal Route53 costs (~$0.50/month for hosted zone)
  const cost = config.tracking.customRedirectDomain ? 0.5 : 0;

  return {
    monthly: cost,
    description: config.tracking.customRedirectDomain
      ? "Open/click tracking with custom domain (Route53 hosted zone)"
      : "Open/click tracking (no additional cost)",
  };
}

/**
 * Calculate cost for reputation metrics
 */
function calculateReputationMetricsCost(
  config: WrapsEmailConfig
): FeatureCost | undefined {
  if (!config.reputationMetrics) {
    return;
  }

  // Reputation metrics are free in CloudWatch
  return {
    monthly: 0,
    description: "Reputation metrics in CloudWatch (no additional cost)",
  };
}

/**
 * Calculate cost for dedicated IP
 */
function calculateDedicatedIpCost(
  config: WrapsEmailConfig
): FeatureCost | undefined {
  if (!config.dedicatedIp) {
    return;
  }

  return {
    monthly: AWS_PRICING.DEDICATED_IP_PER_MONTH,
    description: "Dedicated IP address (requires 100k+ emails/day for warmup)",
  };
}

/**
 * Calculate total infrastructure costs
 *
 * @param config Email configuration
 * @param emailsPerMonth Estimated monthly email volume
 * @returns Detailed cost breakdown
 */
export function calculateCosts(
  config: WrapsEmailConfig,
  emailsPerMonth = 10_000
): FeatureCostBreakdown {
  const tracking = calculateTrackingCost(config);
  const reputationMetrics = calculateReputationMetricsCost(config);
  const eventTracking = calculateEventTrackingCost(config, emailsPerMonth);
  const dynamoDBHistory = calculateDynamoDBCost(config, emailsPerMonth);
  const dedicatedIp = calculateDedicatedIpCost(config);

  // Calculate SES base costs (always present)
  const sesEmailCost =
    Math.max(0, emailsPerMonth - FREE_TIER.SES_EMAILS) *
    AWS_PRICING.SES_PER_EMAIL;

  // Sum all costs
  const totalMonthlyCost =
    sesEmailCost +
    (tracking?.monthly || 0) +
    (reputationMetrics?.monthly || 0) +
    (eventTracking?.monthly || 0) +
    (dynamoDBHistory?.monthly || 0) +
    (dedicatedIp?.monthly || 0);

  return {
    tracking,
    reputationMetrics,
    eventTracking,
    dynamoDBHistory,
    dedicatedIp,
    total: {
      monthly: totalMonthlyCost,
      perEmail: AWS_PRICING.SES_PER_EMAIL,
      description: `Total estimated cost for ${emailsPerMonth.toLocaleString()} emails/month`,
    },
  };
}

/**
 * Format cost for display
 */
export function formatCost(cost: number): string {
  if (cost === 0) {
    return "Free";
  }
  if (cost < 0.01) {
    return "< $0.01";
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Get cost estimate summary for display
 */
export function getCostSummary(
  config: WrapsEmailConfig,
  emailsPerMonth = 10_000
): string {
  const costs = calculateCosts(config, emailsPerMonth);
  const lines: string[] = [];

  lines.push(
    `Estimated cost for ${emailsPerMonth.toLocaleString()} emails/month: ${formatCost(costs.total.monthly)}/mo`
  );

  if (costs.tracking) {
    lines.push(
      `  - ${costs.tracking.description}: ${formatCost(costs.tracking.monthly)}`
    );
  }
  if (costs.reputationMetrics) {
    lines.push(
      `  - ${costs.reputationMetrics.description}: ${formatCost(costs.reputationMetrics.monthly)}`
    );
  }
  if (costs.eventTracking) {
    lines.push(
      `  - ${costs.eventTracking.description}: ${formatCost(costs.eventTracking.monthly)}`
    );
  }
  if (costs.dynamoDBHistory) {
    lines.push(
      `  - ${costs.dynamoDBHistory.description}: ${formatCost(costs.dynamoDBHistory.monthly)}`
    );
  }
  if (costs.dedicatedIp) {
    lines.push(
      `  - ${costs.dedicatedIp.description}: ${formatCost(costs.dedicatedIp.monthly)}`
    );
  }

  return lines.join("\n");
}
