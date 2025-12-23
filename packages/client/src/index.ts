/**
 * Wraps Platform SDK
 *
 * Type-safe client for the Wraps Platform API.
 *
 * @example
 * ```typescript
 * import { createWrapsClient } from '@wraps.dev/client';
 *
 * const wraps = createWrapsClient({ apiKey: 'wraps_live_xxx' });
 *
 * // Batch send to all contacts
 * const batch = await wraps.batch.create({
 *   channel: 'email',
 *   subject: 'Product Update',
 *   templateId: 'tmpl_xxx',
 *   awsAccountId: 'aws_xxx',
 * });
 *
 * // Check batch status
 * const status = await wraps.batch.get(batch.id);
 * console.log(`Sent: ${status.sent}, Failed: ${status.failed}`);
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export interface WrapsClientConfig {
  /**
   * Your Wraps API key (starts with wraps_live_ or wraps_test_)
   */
  apiKey: string;

  /**
   * Base URL for the Wraps API. Defaults to https://api.wraps.dev
   */
  baseUrl?: string;
}

export interface BatchCreateParams {
  /**
   * Channel to send on (default: email)
   */
  channel?: "email" | "sms";

  /**
   * Name for this batch send
   */
  name?: string;

  // Email-specific
  /**
   * Email subject line
   */
  subject?: string;

  /**
   * Preview text shown in email clients
   */
  previewText?: string;

  /**
   * From email address
   */
  from?: string;

  /**
   * From name (display name)
   */
  fromName?: string;

  /**
   * Reply-to email address
   */
  replyTo?: string;

  /**
   * Template ID to use for the email body
   */
  templateId?: string;

  // SMS-specific (Phase 3)
  /**
   * SMS message body
   */
  body?: string;

  /**
   * SMS sender ID
   */
  senderId?: string;

  // Scheduling
  /**
   * ISO 8601 datetime to schedule the send
   */
  scheduledFor?: string;

  /**
   * AWS account ID to use for sending (required)
   */
  awsAccountId: string;
}

export interface BatchCreateResponse {
  /**
   * Unique batch ID
   */
  id: string;

  /**
   * Current status of the batch
   */
  status: "draft" | "queued" | "processing" | "completed" | "failed";

  /**
   * Channel being used
   */
  channel: "email" | "sms";

  /**
   * Total number of recipients
   */
  totalRecipients: number;

  /**
   * When the batch was created
   */
  createdAt: string;
}

export interface BatchGetResponse {
  /**
   * Unique batch ID
   */
  id: string;

  /**
   * Current status of the batch
   */
  status: "draft" | "queued" | "processing" | "completed" | "failed";

  /**
   * Channel being used
   */
  channel: "email" | "sms";

  /**
   * Name of the batch
   */
  name: string;

  /**
   * Total number of recipients
   */
  totalRecipients: number;

  /**
   * Number of recipients processed so far
   */
  processedRecipients: number;

  /**
   * Number of successful sends
   */
  sent: number;

  /**
   * Number of failed sends
   */
  failed: number;

  /**
   * When processing started
   */
  startedAt?: string;

  /**
   * When processing completed
   */
  completedAt?: string;

  /**
   * When the batch was created
   */
  createdAt: string;
}

export interface HealthResponse {
  status: "ok" | "degraded" | "down";
  timestamp: string;
}

export class WrapsError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "WrapsError";
  }
}

// ============================================================================
// Client Implementation
// ============================================================================

/**
 * Create a type-safe Wraps Platform client
 */
export function createWrapsClient(config: WrapsClientConfig) {
  const baseUrl = config.baseUrl ?? "https://api.wraps.dev";

  async function request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = "Request failed";
      let errorCode: string | undefined;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.message ?? errorJson.error ?? errorText;
        errorCode = errorJson.code;
      } catch {
        errorMessage = errorText || `HTTP ${response.status}`;
      }

      throw new WrapsError(errorMessage, response.status, errorCode);
    }

    return response.json() as Promise<T>;
  }

  return {
    /**
     * Batch sending operations
     */
    batch: {
      /**
       * Create a new batch send to all contacts
       */
      create: async (params: BatchCreateParams): Promise<BatchCreateResponse> =>
        request<BatchCreateResponse>("POST", "/v1/batch", params),

      /**
       * Get the status of a batch send
       */
      get: async (batchId: string): Promise<BatchGetResponse> =>
        request<BatchGetResponse>("GET", `/v1/batch/${batchId}`),
    },

    /**
     * Health check
     */
    health: async (): Promise<HealthResponse> =>
      request<HealthResponse>("GET", "/health"),
  };
}

/**
 * Type of the Wraps client
 */
export type WrapsClient = ReturnType<typeof createWrapsClient>;
