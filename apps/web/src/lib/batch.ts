/**
 * Batch Send Types and Helpers
 */

// Status types matching the database enum
export const BATCH_STATUSES = [
  "draft",
  "queued",
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

// Channel types
export const CHANNELS = ["email", "sms"] as const;
export type Channel = (typeof CHANNELS)[number];

// Status display labels
export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  draft: "Draft",
  queued: "Queued",
  processing: "Sending",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

// Status colors for badges
export const BATCH_STATUS_COLORS: Record<BatchStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  queued: "bg-blue-100 text-blue-700",
  processing: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

// Channel display
export const CHANNEL_LABELS: Record<Channel, string> = {
  email: "Email",
  sms: "SMS",
};

// Batch send with metadata
export type BatchSendWithMeta = {
  id: string;
  name: string | null;
  channel: Channel;
  status: BatchStatus;
  // Email-specific
  subject: string | null;
  previewText: string | null;
  from: string | null;
  fromName: string | null;
  replyTo: string | null;
  templateId: string | null;
  templateName?: string;
  // Progress
  totalRecipients: number;
  processedRecipients: number;
  sent: number;
  delivered: number;
  failed: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  // Error
  errorMessage: string | null;
  // Timing
  scheduledFor: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  // Created by
  createdBy: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  // AWS Account
  awsAccount: {
    id: string;
    name: string;
    region: string;
  } | null;
};

// Recipient filter types
export type AudienceType = "all" | "topic" | "segment";

export type RecipientFilter = {
  audienceType: AudienceType;
  topicId?: string;
  segmentId?: string;
};

// Content type for email
export type ContentType = "template" | "html";

// Create batch input
export type CreateBatchInput = {
  name?: string;
  channel?: Channel;
  // Recipient targeting
  recipientFilter?: RecipientFilter;
  // Content type
  contentType?: ContentType;
  // Email-specific
  subject?: string;
  previewText?: string;
  from?: string;
  fromName?: string;
  replyTo?: string;
  templateId?: string;
  htmlContent?: string;
  // SMS-specific (Phase 3)
  body?: string;
  senderId?: string;
  // AWS account
  awsAccountId: string;
  // Scheduling
  scheduledFor?: Date;
};

// Result types
export type CreateBatchResult =
  | {
      success: true;
      batch: BatchSendWithMeta;
    }
  | {
      success: false;
      error: string;
    };

export type ListBatchesResult =
  | {
      success: true;
      batches: BatchSendWithMeta[];
      total: number;
    }
  | {
      success: false;
      error: string;
    };

export type GetBatchResult =
  | {
      success: true;
      batch: BatchSendWithMeta;
    }
  | {
      success: false;
      error: string;
    };

export type CancelBatchResult =
  | {
      success: true;
    }
  | {
      success: false;
      error: string;
    };

// Helper to calculate progress percentage
export function calculateProgress(batch: BatchSendWithMeta): number {
  if (batch.totalRecipients === 0) return 0;
  return Math.round((batch.processedRecipients / batch.totalRecipients) * 100);
}

// Helper to calculate delivery rate
export function calculateDeliveryRate(batch: BatchSendWithMeta): number {
  if (batch.sent === 0) return 0;
  return Math.round((batch.delivered / batch.sent) * 100);
}

// Helper to calculate open rate (email only)
export function calculateOpenRate(batch: BatchSendWithMeta): number {
  if (batch.delivered === 0) return 0;
  return Math.round((batch.opened / batch.delivered) * 100);
}

// Helper to calculate click rate
export function calculateClickRate(batch: BatchSendWithMeta): number {
  if (batch.delivered === 0) return 0;
  return Math.round((batch.clicked / batch.delivered) * 100);
}

// Helper to format duration
export function formatDuration(
  startedAt: Date | null,
  completedAt: Date | null
): string {
  if (!startedAt) return "-";
  const end = completedAt ?? new Date();
  const durationMs = end.getTime() - startedAt.getTime();

  if (durationMs < 1000) return "<1s";
  if (durationMs < 60_000) return `${Math.round(durationMs / 1000)}s`;
  if (durationMs < 3_600_000) return `${Math.round(durationMs / 60_000)}m`;
  return `${Math.round(durationMs / 3_600_000)}h`;
}
