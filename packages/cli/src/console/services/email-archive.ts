import { getArchivedEmail } from "../../utils/archive.js";

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
};

/**
 * Fetch archived email by message ID from AWS SES Mail Manager
 *
 * @param messageId Email message ID
 * @param options Configuration options
 * @returns Archived email with full content, or null if not found
 */
export async function fetchArchivedEmail(
  messageId: string,
  options: FetchArchivedEmailOptions
): Promise<ArchivedEmail | null> {
  const { region, archiveArn } = options;

  try {
    console.log("Fetching archived email:", {
      messageId,
      archiveArn,
      region,
    });

    // Call the archive utility to get the email
    const email = await getArchivedEmail(archiveArn, messageId, region);

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
