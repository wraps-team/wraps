/**
 * Client-side CSV parser (RFC 4180 compliant)
 *
 * Hand-written to avoid new dependencies.
 * Supports: BOM stripping, auto-detect delimiter, quoted fields, max row limit.
 */

export type ParseCSVOptions = {
  /** Override delimiter detection. Default: auto-detect (comma, semicolon, tab) */
  delimiter?: string;
  /** Maximum rows to parse (excluding header). Default: 10000 */
  maxRows?: number;
};

export type ParseCSVResult = {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
  truncated: boolean;
};

/**
 * The importer reads the whole file into browser memory before parsing, so it
 * needs a ceiling. This is the only limit on how large a file may be: the send
 * is chunked (see lib/import-chunks.ts), so request size no longer caps it.
 */
export const MAX_CSV_BYTES = 25 * 1024 * 1024;

/**
 * Rows kept per import. Not a request limit — the importer splits the send
 * into several calls — but a bound on how much the browser parses and holds
 * at once. 25 MB of contact rows lands near this.
 */
export const MAX_CSV_ROWS = 250_000;

/**
 * Ceiling on a single call's JSON payload, matching `serverActions.bodySizeLimit`
 * in next.config.ts.
 *
 * The importer chunks its send well under this (IMPORT_CHUNK_BYTES), so a
 * normal import never approaches it. It stays as the floor under the chunker:
 * one pathological row — a contact carrying megabytes of custom properties —
 * is a chunk of its own and could still exceed the cap, and Next enforces that
 * cap before our code runs. `describePayloadTooLarge` catches it in the browser
 * so the operator gets a sentence rather than a framework error.
 */
export const MAX_IMPORT_PAYLOAD_BYTES = 8 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Explain an import too large to send, or null when it fits.
 *
 * Takes the serialized byte length so the caller measures the payload it is
 * actually about to send, not an estimate of it.
 */
export function describePayloadTooLarge(
  payloadBytes: number,
  rowCount: number
): string | null {
  if (payloadBytes <= MAX_IMPORT_PAYLOAD_BYTES) {
    return null;
  }
  const rowsThatFit = Math.max(
    1,
    Math.floor(rowCount * (MAX_IMPORT_PAYLOAD_BYTES / payloadBytes))
  );
  return `These ${rowCount.toLocaleString()} rows come to ${formatBytes(payloadBytes)}, over the ${formatBytes(MAX_IMPORT_PAYLOAD_BYTES)} an import can send at once. Split the file into batches of about ${rowsThatFit.toLocaleString()} rows and import them one at a time.`;
}

/**
 * Reject a file before reading it. Returns the sentence to show the operator,
 * or null when the file is worth reading.
 */
export function validateCSVFile(file: {
  name: string;
  size: number;
}): string | null {
  if (file.size === 0) {
    return "That file is empty.";
  }
  if (file.size > MAX_CSV_BYTES) {
    return `That file is ${formatBytes(file.size)}. The importer reads the whole file in your browser, so it stops at ${formatBytes(MAX_CSV_BYTES)} — split it into smaller files and import them one at a time.`;
  }
  if (!/\.csv$/i.test(file.name)) {
    return `Wraps reads CSV files, and "${file.name}" isn't one. Export it as CSV and try again.`;
  }
  return null;
}

/**
 * Explain why a parsed file can't be imported, or null when it can.
 *
 * The upload step used to `return` silently on both of these, so picking a
 * malformed file left the dialog sitting on step 1 with nothing said.
 */
export function describeParseFailure(result: ParseCSVResult): string | null {
  if (result.headers.length === 0) {
    return "Couldn't read any columns from that file. The first line needs to be a header row.";
  }
  if (result.rows.length === 0) {
    return "That file has a header row but no contacts under it.";
  }
  return null;
}

/**
 * Auto-detect the delimiter by counting occurrences in the first few lines.
 */
function detectDelimiter(text: string): string {
  const sample = text.slice(0, 4096);
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = 0;

  for (const candidate of candidates) {
    // Count occurrences outside quoted fields in first line
    let count = 0;
    let inQuote = false;
    for (const ch of sample) {
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === candidate && !inQuote) {
        count++;
      } else if (ch === "\n" && !inQuote) {
        break; // Only look at first line for detection
      }
    }
    if (count > bestCount) {
      bestCount = count;
      best = candidate;
    }
  }

  return best;
}

/**
 * Parse a single CSV row respecting RFC 4180 quoting rules.
 * Returns null if the row is incomplete (unterminated quote spanning lines).
 */
function parseRow(
  text: string,
  start: number,
  delimiter: string
): { fields: string[]; nextIndex: number } | null {
  const fields: string[] = [];
  let i = start;
  const len = text.length;

  while (i <= len) {
    if (i === len || text[i] === "\n" || text[i] === "\r") {
      // Empty trailing field
      fields.push("");
      // Skip \r\n or \n
      if (i < len && text[i] === "\r") {
        i++;
      }
      if (i < len && text[i] === "\n") {
        i++;
      }
      return { fields, nextIndex: i };
    }

    if (text[i] === '"') {
      // Quoted field
      let value = "";
      i++; // skip opening quote
      while (i < len) {
        if (text[i] === '"') {
          if (i + 1 < len && text[i + 1] === '"') {
            // Escaped quote
            value += '"';
            i += 2;
          } else {
            // End of quoted field
            i++; // skip closing quote
            break;
          }
        } else {
          value += text[i];
          i++;
        }
      }
      fields.push(value);
      // After closing quote, expect delimiter or end of line
      if (i < len && text[i] === delimiter) {
        i++;
      } else if (i < len && (text[i] === "\r" || text[i] === "\n")) {
        if (text[i] === "\r") {
          i++;
        }
        if (i < len && text[i] === "\n") {
          i++;
        }
        return { fields, nextIndex: i };
      }
    } else {
      // Unquoted field
      let value = "";
      while (
        i < len &&
        text[i] !== delimiter &&
        text[i] !== "\n" &&
        text[i] !== "\r"
      ) {
        value += text[i];
        i++;
      }
      fields.push(value);
      if (i < len && text[i] === delimiter) {
        i++;
      } else {
        // End of line or end of text
        if (i < len && text[i] === "\r") {
          i++;
        }
        if (i < len && text[i] === "\n") {
          i++;
        }
        return { fields, nextIndex: i };
      }
    }
  }

  return { fields, nextIndex: i };
}

/**
 * Parse CSV text into headers and rows of Record<string, string>.
 */
export function parseCSV(
  text: string,
  options?: ParseCSVOptions
): ParseCSVResult {
  const maxRows = options?.maxRows ?? 10_000;

  // Strip BOM
  let cleaned = text;
  if (cleaned.charCodeAt(0) === 0xfe_ff) {
    cleaned = cleaned.slice(1);
  }

  // Normalize line endings
  cleaned = cleaned.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Remove trailing newlines
  cleaned = cleaned.replace(/\n+$/, "");

  if (cleaned.length === 0) {
    return { headers: [], rows: [], totalRows: 0, truncated: false };
  }

  const delimiter = options?.delimiter ?? detectDelimiter(cleaned);

  // Parse header row
  const headerResult = parseRow(cleaned, 0, delimiter);
  if (!headerResult) {
    return { headers: [], rows: [], totalRows: 0, truncated: false };
  }

  const headers = headerResult.fields.map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  let pos = headerResult.nextIndex;
  let totalRows = 0;
  let truncated = false;

  while (pos < cleaned.length) {
    const result = parseRow(cleaned, pos, delimiter);
    if (!result) {
      break;
    }

    // Skip empty rows (all fields empty)
    const isEmptyRow = result.fields.every((f) => f.trim() === "");
    if (isEmptyRow) {
      pos = result.nextIndex;
      continue;
    }

    totalRows++;

    if (rows.length < maxRows) {
      const row: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = (result.fields[j] ?? "").trim();
      }
      rows.push(row);
    } else {
      truncated = true;
    }

    pos = result.nextIndex;
  }

  return { headers, rows, totalRows, truncated };
}
