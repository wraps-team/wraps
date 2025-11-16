import {
  type ArchiveSearchCriteria,
  getArchivedEmail,
} from "../../utils/archive.js";

/**
 * Archived email with full content
 */
export type ArchivedEmail = {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  attachments: Array<{
    filename?: string;
    contentType: string;
    size: number;
  }>;
  headers: Record<string, string | string[] | undefined>;
  timestamp: Date;
  metadata?: {
    senderIp?: string;
    tlsProtocol?: string;
    tlsCipherSuite?: string;
    senderHostname?: string;
  };
};

type FetchArchivedEmailOptions = {
  region: string;
  archiveArn: string;
  from?: string;
  to?: string;
  subject?: string;
  timestamp?: Date;
};

/**
 * Fetch archived email by message ID from AWS SES Mail Manager
 *
 * This function searches the archive using email metadata (from, to, subject)
 * to find the archived message, since MailManager doesn't support direct
 * search by SES Message-ID.
 *
 * @param messageId Email message ID (for logging/correlation only)
 * @param options Configuration options including search criteria
 * @returns Archived email with full content, or null if not found
 */
export async function fetchArchivedEmail(
  messageId: string,
  options: FetchArchivedEmailOptions
): Promise<ArchivedEmail | null> {
  const { region, archiveArn, from, to, subject, timestamp } = options;

  try {
    console.log("Fetching archived email:", {
      messageId,
      archiveArn,
      region,
    });

    // Build search criteria from email metadata
    const searchCriteria: ArchiveSearchCriteria = {
      from,
      to,
      subject,
      timestamp,
    };

    // Call the archive utility to get the email
    const email = await getArchivedEmail(archiveArn, searchCriteria, region);

    console.log("Archived email fetched successfully:", {
      messageId: email.messageId,
      hasHtml: !!email.html,
      hasText: !!email.text,
      attachmentCount: email.attachments.length,
    });

    // Return the email data
    return email;
  } catch (error: unknown) {
    // If the email is not found, return null instead of throwing
    if (
      error instanceof Error &&
      (error.message.includes("not found") ||
        error.message.includes("ResourceNotFoundException"))
    ) {
      console.log("Archived email not found:", messageId);
      return null;
    }

    // For other errors, log and rethrow
    console.error("Error fetching archived email:", error);
    throw error;
  }
}
