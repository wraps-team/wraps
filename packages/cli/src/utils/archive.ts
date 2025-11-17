import {
  GetArchiveMessageCommand,
  type GetArchiveMessageCommandOutput,
  GetArchiveSearchResultsCommand,
  MailManagerClient,
  StartArchiveSearchCommand,
} from "@aws-sdk/client-mailmanager";
import DOMPurify from "isomorphic-dompurify";
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
 * Extract archive ID from ARN
 * ARN format: arn:aws:ses:region:account-id:mailmanager-archive/archive-id
 * Returns just the archive-id part
 */
function extractArchiveId(archiveArnOrId: string): string {
  if (archiveArnOrId.startsWith("arn:")) {
    // Extract ID from ARN
    const parts = archiveArnOrId.split("/");
    return parts.at(-1) as string;
  }
  // Already just an ID
  return archiveArnOrId;
}

/**
 * Search criteria for finding archived email
 */
export type ArchiveSearchCriteria = {
  from?: string;
  to?: string;
  subject?: string;
  timestamp?: Date;
};

/**
 * Get an archived email using search criteria
 *
 * This function performs a two-step process:
 * 1. Search the archive using FROM/TO/SUBJECT to find the ArchivedMessageId
 * 2. Retrieve the actual email content using the ArchivedMessageId
 *
 * Note: MailManager Archive doesn't support searching by SES Message-ID directly.
 * We search using FROM, TO, and SUBJECT which we get from DynamoDB events.
 *
 * @param archiveArnOrId Archive ARN or ID (will extract ID if ARN provided)
 * @param searchCriteria Email search criteria (from, to, subject, timestamp)
 * @param region AWS region
 * @returns Parsed email with full content
 */
export async function getArchivedEmail(
  archiveArnOrId: string,
  searchCriteria: ArchiveSearchCriteria,
  region: string
): Promise<ParsedEmail> {
  const client = new MailManagerClient({ region });

  // Extract archive ID from ARN if needed
  const archiveId = extractArchiveId(archiveArnOrId);

  // Step 1: Search for the message to get the ArchivedMessageId
  // MailManager doesn't support MESSAGE_ID search, so we use FROM/TO/SUBJECT
  // Use timestamp to narrow the search window (±1 day)
  const searchTime = searchCriteria.timestamp || new Date();
  const dayBefore = new Date(searchTime.getTime() - 24 * 60 * 60 * 1000);
  const dayAfter = new Date(searchTime.getTime() + 24 * 60 * 60 * 1000);

  // Build search filters
  const filters: any[] = [];

  if (searchCriteria.from) {
    filters.push({
      StringExpression: {
        Evaluate: {
          Attribute: "FROM",
        },
        Operator: "CONTAINS",
        Values: [searchCriteria.from],
      },
    });
  }

  if (searchCriteria.to) {
    filters.push({
      StringExpression: {
        Evaluate: {
          Attribute: "TO",
        },
        Operator: "CONTAINS",
        Values: [searchCriteria.to],
      },
    });
  }

  if (searchCriteria.subject) {
    filters.push({
      StringExpression: {
        Evaluate: {
          Attribute: "SUBJECT",
        },
        Operator: "CONTAINS",
        Values: [searchCriteria.subject],
      },
    });
  }

  // If no filters provided, throw error
  if (filters.length === 0) {
    throw new Error(
      "At least one search criterion (from, to, or subject) is required"
    );
  }

  const searchCommand = new StartArchiveSearchCommand({
    ArchiveId: archiveId,
    FromTimestamp: dayBefore,
    ToTimestamp: dayAfter,
    Filters: {
      Include: filters,
    },
    MaxResults: 10, // Get a few results in case there are multiple matches
  });

  const searchResponse = await client.send(searchCommand);
  const searchId = searchResponse.SearchId;

  if (!searchId) {
    throw new Error("Failed to start archive search");
  }

  // Step 2: Poll for search results (searches are async)
  let archivedMessageId: string | undefined;
  let attempts = 0;
  const maxAttempts = 20; // Increased max attempts
  const pollInterval = 1000; // 1 second between polls

  // Wait a bit before first poll to let search start
  await new Promise((resolve) => setTimeout(resolve, 1000));

  while (attempts < maxAttempts) {
    try {
      const resultsCommand = new GetArchiveSearchResultsCommand({
        SearchId: searchId,
      });

      const resultsResponse = await client.send(resultsCommand);

      if (resultsResponse.Rows && resultsResponse.Rows.length > 0) {
        // Found the message!
        archivedMessageId = resultsResponse.Rows[0].ArchivedMessageId;
        break;
      }

      // No results yet, but search completed - email not found
      if (resultsResponse.Rows && resultsResponse.Rows.length === 0) {
        // Search completed but no results
        break;
      }
    } catch (error: unknown) {
      // If search is still in progress, continue polling
      if (
        error instanceof Error &&
        error.name === "ConflictException" &&
        error.message.includes("still in progress")
      ) {
        console.log(`Search still in progress, attempt ${attempts + 1}...`);
      } else {
        // Other errors should be thrown
        throw error;
      }
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    attempts++;
  }

  if (!archivedMessageId) {
    throw new Error(
      "Email not found in archive with the provided search criteria. It may have been sent before archiving was enabled."
    );
  }

  // Step 3: Get the actual archived message using the ArchivedMessageId
  const command = new GetArchiveMessageCommand({
    ArchivedMessageId: archivedMessageId,
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
    if (!addr) return "";
    if (Array.isArray(addr)) {
      return addr.map((a) => a.text).join(", ");
    }
    return addr.text || "";
  };

  return {
    messageId: parsed.messageId || headers["message-id"]?.toString() || "",
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
 * Sanitize HTML for safe rendering using DOMPurify
 * Removes potentially dangerous elements and attributes
 *
 * Uses isomorphic-dompurify which provides secure HTML sanitization
 * that works in both Node.js and browser environments.
 *
 * @param html HTML content to sanitize
 * @returns Sanitized HTML safe for rendering
 */
export function sanitizeEmailHtml(html: string): string {
  // DOMPurify provides comprehensive XSS protection including:
  // - Script tag removal (including nested bypass attacks like <scr<script>ipt>)
  // - Event handler removal (onclick, onload, etc.)
  // - Protocol sanitization (javascript:, data:text/html, etc.)
  // - Object/embed/iframe removal
  // - Style-based XSS protection
  return DOMPurify.sanitize(html, {
    // Allow common safe HTML elements for email rendering
    ALLOWED_TAGS: [
      "p",
      "div",
      "span",
      "a",
      "img",
      "br",
      "strong",
      "em",
      "b",
      "i",
      "u",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "ul",
      "ol",
      "li",
      "table",
      "thead",
      "tbody",
      "tr",
      "td",
      "th",
      "blockquote",
      "pre",
      "code",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "style", "target"],
    // Keep safe URIs only (removes javascript:, data:text/html, etc.)
    ALLOW_DATA_ATTR: false,
  });
}
