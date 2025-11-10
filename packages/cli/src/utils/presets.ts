import type { ConfigPreset, WrapsEmailConfig } from "../types/index.js";
import { calculateCosts, formatCost } from "./costs.js";

/**
 * Preset configurations with recommended settings for different use cases
 */

/**
 * Starter preset - minimal features for low-volume senders
 * Perfect for: Side projects, MVPs, development/staging
 * Volume: Up to 10k emails/month
 * Cost: ~$1-2/month
 */
export const STARTER_PRESET: WrapsEmailConfig = {
  tracking: {
    enabled: true,
    opens: true,
    clicks: true,
  },
  tlsRequired: true,
  reputationMetrics: false,
  suppressionList: {
    enabled: true,
    reasons: ["BOUNCE", "COMPLAINT"],
  },
  eventTracking: {
    enabled: false,
  },
  sendingEnabled: true,
};

/**
 * Production preset - recommended for most production applications
 * Perfect for: SaaS apps, B2B products, moderate volume
 * Volume: 10k-500k emails/month
 * Cost: ~$10-50/month (scales with volume)
 */
export const PRODUCTION_PRESET: WrapsEmailConfig = {
  tracking: {
    enabled: true,
    opens: true,
    clicks: true,
  },
  tlsRequired: true,
  reputationMetrics: true,
  suppressionList: {
    enabled: true,
    reasons: ["BOUNCE", "COMPLAINT"],
  },
  eventTracking: {
    enabled: true,
    eventBridge: true,
    events: [
      "SEND",
      "DELIVERY",
      "OPEN",
      "CLICK",
      "BOUNCE",
      "COMPLAINT",
      "REJECT",
      "RENDERING_FAILURE",
    ],
    dynamoDBHistory: true,
    archiveRetention: "90days",
  },
  sendingEnabled: true,
};

/**
 * Enterprise preset - full features for high-volume senders
 * Perfect for: Large platforms, high-volume transactional email
 * Volume: 500k+ emails/month
 * Cost: ~$100-200/month (includes $24.95 dedicated IP)
 */
export const ENTERPRISE_PRESET: WrapsEmailConfig = {
  tracking: {
    enabled: true,
    opens: true,
    clicks: true,
  },
  tlsRequired: true,
  reputationMetrics: true,
  suppressionList: {
    enabled: true,
    reasons: ["BOUNCE", "COMPLAINT"],
  },
  eventTracking: {
    enabled: true,
    eventBridge: true,
    events: [
      "SEND",
      "DELIVERY",
      "OPEN",
      "CLICK",
      "BOUNCE",
      "COMPLAINT",
      "REJECT",
      "RENDERING_FAILURE",
      "DELIVERY_DELAY",
      "SUBSCRIPTION",
    ],
    dynamoDBHistory: true,
    archiveRetention: "1year",
  },
  dedicatedIp: true,
  sendingEnabled: true,
};

/**
 * Get preset configuration by name
 */
export function getPreset(preset: ConfigPreset): WrapsEmailConfig | null {
  switch (preset) {
    case "starter":
      return STARTER_PRESET;
    case "production":
      return PRODUCTION_PRESET;
    case "enterprise":
      return ENTERPRISE_PRESET;
    case "custom":
      return null; // User will configure manually
  }
}

/**
 * Preset metadata for display
 */
export type PresetInfo = {
  name: string;
  description: string;
  recommended: string;
  volume: string;
  estimatedCost: string;
  features: string[];
};

/**
 * Get preset information for display
 */
export function getPresetInfo(preset: ConfigPreset): PresetInfo {
  const config = getPreset(preset);

  if (preset === "custom" || !config) {
    return {
      name: "Custom",
      description: "Configure each feature individually",
      recommended: "Advanced users who need specific configuration",
      volume: "Any volume",
      estimatedCost: "Varies",
      features: ["Full control over all features"],
    };
  }

  const costs = calculateCosts(
    config,
    preset === "starter"
      ? 10_000
      : preset === "production"
        ? 100_000
        : 1_000_000
  );

  const baseInfo = {
    starter: {
      name: "Starter",
      description: "Minimal features for low-volume senders",
      recommended: "Side projects, MVPs, development/staging",
      volume: "Up to 10k emails/month",
      features: [
        "Open & click tracking",
        "TLS encryption required",
        "Automatic bounce/complaint suppression",
      ],
    },
    production: {
      name: "Production",
      description: "Recommended for most production applications",
      recommended: "SaaS apps, B2B products, moderate volume (RECOMMENDED)",
      volume: "10k-500k emails/month",
      features: [
        "Everything in Starter",
        "Reputation metrics dashboard",
        "Real-time event tracking (EventBridge)",
        "90-day email history storage",
        "Complete event visibility",
      ],
    },
    enterprise: {
      name: "Enterprise",
      description: "Full features for high-volume senders",
      recommended: "Large platforms, high-volume transactional email",
      volume: "500k+ emails/month",
      features: [
        "Everything in Production",
        "Dedicated IP address",
        "1-year email history",
        "All event types tracked",
        "Priority support eligibility",
      ],
    },
  }[preset];

  return {
    ...baseInfo,
    estimatedCost: formatCost(costs.total.monthly),
  } as PresetInfo;
}

/**
 * Get all preset options for CLI prompts
 */
export function getAllPresetInfo(): PresetInfo[] {
  return [
    getPresetInfo("starter"),
    getPresetInfo("production"),
    getPresetInfo("enterprise"),
    getPresetInfo("custom"),
  ];
}

/**
 * Compare two configurations to determine upgrade path
 */
export function getUpgradePath(
  current: WrapsEmailConfig,
  target: WrapsEmailConfig
): string[] {
  const changes: string[] = [];

  // Check tracking changes
  if (!current.tracking?.enabled && target.tracking?.enabled) {
    changes.push("Enable email tracking (opens & clicks)");
  }

  // Check reputation metrics
  if (!current.reputationMetrics && target.reputationMetrics) {
    changes.push("Enable reputation metrics");
  }

  // Check event tracking
  if (!current.eventTracking?.enabled && target.eventTracking?.enabled) {
    changes.push("Enable real-time event tracking");
  }

  // Check DynamoDB history
  if (
    !current.eventTracking?.dynamoDBHistory &&
    target.eventTracking?.dynamoDBHistory
  ) {
    changes.push("Enable email history storage");
  }

  // Check retention upgrade
  if (
    current.eventTracking?.archiveRetention !==
      target.eventTracking?.archiveRetention &&
    target.eventTracking?.archiveRetention
  ) {
    changes.push(
      `Upgrade retention: ${current.eventTracking?.archiveRetention || "none"} → ${target.eventTracking.archiveRetention}`
    );
  }

  // Check dedicated IP
  if (!current.dedicatedIp && target.dedicatedIp) {
    changes.push("Add dedicated IP address");
  }

  return changes;
}

/**
 * Validate configuration for common issues
 */
export function validateConfig(config: WrapsEmailConfig): string[] {
  const warnings: string[] = [];

  // Warn about dedicated IP without high volume
  if (config.dedicatedIp) {
    warnings.push(
      "⚠️  Dedicated IPs require 100k+ emails/day for proper warmup. Consider starting with shared IPs."
    );
  }

  // Warn about event tracking without storage
  if (config.eventTracking?.enabled && !config.eventTracking?.dynamoDBHistory) {
    warnings.push(
      "💡 Event tracking is enabled but history storage is disabled. Events will only be available in real-time."
    );
  }

  // Warn about long retention without need
  if (config.eventTracking?.archiveRetention === "indefinite") {
    warnings.push(
      "⚠️  Indefinite retention can become expensive. Consider 90-day or 1-year retention."
    );
  }

  return warnings;
}
