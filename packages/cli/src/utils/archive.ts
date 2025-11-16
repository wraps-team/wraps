import {
  GetArchiveMessageCommand,
  type GetArchiveMessageCommandOutput,
  MailManagerClient,
  SearchArchivedMessagesCommand,
  type SearchArchivedMessagesCommandOutput,
} from "@aws-sdk/client-sesv2";
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
      headers[key] = value;
    }
  }

  return {
    messageId: response.MessageMetadata?.MessageId || messageId,
    from: parsed.from?.text || "",
    to: parsed.to?.text || "",
    subject: parsed.subject || "",
    html: parsed.html || undefined,
    text: parsed.text || undefined,
    attachments,
    headers,
    timestamp: parsed.date || new Date(),
    metadata: {
      senderIp: response.MessageMetadata?.SenderIpAddress,
      tlsProtocol: response.MessageMetadata?.TlsProtocol,
      tlsCipherSuite: response.MessageMetadata?.TlsCipherSuite,
      senderHostname: response.MessageMetadata?.SenderHostname,
    },
  };
}

/**
 * Search archived emails
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
): Promise<SearchArchivedMessagesCommandOutput> {
  const client = new MailManagerClient({ region });

  // Build search filters
  const filters: any[] = [];

  if (params.from) {
    filters.push({
      StringExpression: {
        Operator: "CONTAINS",
        Values: [params.from],
      },
    });
  }

  if (params.to) {
    filters.push({
      StringExpression: {
        Operator: "CONTAINS",
        Values: [params.to],
      },
    });
  }

  if (params.subject) {
    filters.push({
      StringExpression: {
        Operator: "CONTAINS",
        Values: [params.subject],
      },
    });
  }

  const command = new SearchArchivedMessagesCommand({
    ArchiveId: archiveId,
    Filters: filters.length > 0 ? { Include: filters } : undefined,
    FromTimestamp: params.startDate,
    ToTimestamp: params.endDate || new Date(),
    MaxResults: params.maxResults || 100,
  });

  return client.send(command);
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
