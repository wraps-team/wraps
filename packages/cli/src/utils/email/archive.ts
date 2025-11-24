import {
  GetArchiveMessageCommand,
  type GetArchiveMessageCommandOutput,
  MailManagerClient,
} from "@aws-sdk/client-mailmanager";
import { type ParsedMail, simpleParser } from "mailparser";

/**
 * Parsed email from archive
 */
export type ParsedEmail = {
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

/**
 * Get an archived email by message ID
 *
 * @param archiveId Archive ARN or ID
 * @param messageId Email message ID
 * @param region AWS region
 * @returns Parsed email with full content
 */
export async function getArchivedEmail(
  _archiveId: string,
  messageId: string,
  region: string
): Promise<ParsedEmail> {
  const client = new MailManagerClient({ region });

  // Get archive message metadata and download link
  const command = new GetArchiveMessageCommand({
    ArchivedMessageId: messageId,
  });

  const response: GetArchiveMessageCommandOutput = await client.send(command);

  if (!response.MessageDownloadLink) {
    throw new Error("No download link available for archived message");
  }

  // Download raw email from presigned S3 URL
  const emailResponse = await fetch(response.MessageDownloadLink);
  if (!emailResponse.ok) {
    throw new Error(`Failed to download email: ${emailResponse.statusText}`);
  }

  const emailRaw = await emailResponse.text();

  // Parse RFC 822/MIME message
  const parsed: ParsedMail = await simpleParser(emailRaw);

  // Extract attachment metadata (don't include full content to save memory)
  const attachments =
    parsed.attachments?.map((att) => ({
      filename: att.filename,
      contentType: att.contentType,
      size: att.size,
    })) || [];

  // Convert headers Map to plain object
  const headers: Record<string, string | string[] | undefined> = {};
  if (parsed.headers) {
    for (const [key, value] of parsed.headers) {
      // Convert header values to string/string[]
      if (value instanceof Date) {
        headers[key] = value.toISOString();
      } else if (typeof value === "string") {
        headers[key] = value;
      } else if (
        Array.isArray(value) &&
        value.every((v) => typeof v === "string")
      ) {
        headers[key] = value as string[];
      } else {
        // Convert complex header types (AddressObject, StructuredHeader, etc.) to string
        headers[key] = JSON.stringify(value);
      }
    }
  }

  // Extract from/to as text
  const getAddressText = (
    addr: ParsedMail["from"] | ParsedMail["to"]
  ): string => {
    if (!addr) {
      return "";
    }
    if (Array.isArray(addr)) {
      return addr.map((a) => a.text).join(", ");
    }
    return addr.text || "";
  };

  return {
    messageId, // Use the input messageId since response may not have MessageMetadata
    from: getAddressText(parsed.from),
    to: getAddressText(parsed.to),
    subject: parsed.subject || "",
    html: parsed.html || undefined,
    text: parsed.text || undefined,
    attachments,
    headers,
    timestamp: parsed.date || new Date(),
    // Note: MessageMetadata is not available in GetArchiveMessageCommandOutput
    // These fields would need to be retrieved separately if needed
    metadata: {},
  };
}

/**
 * Search archived emails
 *
 * TODO: Update this to use the correct Mail Manager Archive Search API:
 * - StartArchiveSearchCommand to initiate search
 * - GetArchiveSearchResultsCommand to retrieve results
 * - Implement polling logic for async search completion
 *
 * @param archiveId Archive ARN or ID
 * @param params Search parameters
 * @param region AWS region
 * @returns Search results
 */
export async function searchArchivedEmails(
  archiveId: string,
  params: {
    from?: string;
    to?: string;
    subject?: string;
    startDate?: Date;
    endDate?: Date;
    maxResults?: number;
  },
  region: string
): Promise<never> {
  // TODO: Implement proper search using StartArchiveSearchCommand
  // and GetArchiveSearchResultsCommand
  // Suppress unused variable warnings
  void archiveId;
  void params;
  void region;

  throw new Error(
    "Archive search is not yet implemented. This requires:\n" +
      "1. Start search with StartArchiveSearchCommand\n" +
      "2. Poll for completion\n" +
      "3. Get results with GetArchiveSearchResultsCommand"
  );
}

/**
 * Sanitize HTML for safe rendering
 * Removes potentially dangerous elements and attributes
 *
 * @param html HTML content
 * @returns Sanitized HTML
 */
export function sanitizeEmailHtml(html: string): string {
  // Basic HTML sanitization
  // For production, consider using a library like DOMPurify
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "") // Remove inline event handlers
    .replace(/javascript:/gi, ""); // Remove javascript: protocols
}
