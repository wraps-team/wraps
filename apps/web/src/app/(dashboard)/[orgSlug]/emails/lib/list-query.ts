/**
 * The emails list contract, shared by the route handler and the client.
 *
 * Postgres `message_send` is the single store behind this list (see
 * `.claude/experience/datastore-decision-memo-2026-08-18.md`). Browse and
 * search are the same query with one extra predicate, so everything that
 * defines the query - the page key, the status vocabulary, the minimum search
 * length - lives here rather than being restated on both sides of the wire.
 */

/** Rows per page. The footer counts in these, so the client must agree. */
export const EMAIL_LIST_PAGE_SIZE = 50;

/** Ceiling on a caller-supplied page size. The CSV export pages at this size. */
export const EMAIL_LIST_MAX_PAGE_SIZE = 200;

/** Widest window the list will serve, in days. */
export const EMAIL_LIST_MAX_DAYS = 365;

/**
 * Below three characters a trigram index cannot serve the term, so the query
 * degrades to a sequential scan over every message the organization ever sent
 * (1.95M rows for our largest). Refused on both sides: the client does not
 * fire it, the route rejects it if something else does.
 */
export const EMAIL_SEARCH_MIN_LENGTH = 3;

export const EMAIL_SEARCH_TOO_SHORT_MESSAGE =
  "Search needs at least 3 characters. Shorter terms cannot use the search index, so they would scan your whole history.";

/**
 * Most recent rows a CSV export will page through before it stops.
 *
 * INVARIANT: must be a whole multiple of `EMAIL_LIST_MAX_PAGE_SIZE`. The export
 * loop pages at that size and stops once `collected.length` reaches this cap,
 * and the route returns exactly `limit` rows whenever it reports another page,
 * so `collected` only ever lands on a page boundary. If the two stopped
 * dividing evenly the loop would overshoot and the export's `slice(0, cap)`
 * would silently drop rows while still reporting `was_truncated: false`.
 * Pinned by `lib/__tests__/list-query.test.ts`.
 */
export const EMAIL_EXPORT_ROW_CAP = 10_000;

/**
 * The statuses `message_send` can actually hold for an email. `pending`,
 * `queued` and `opted_out` exist in the enum but no email send reaches them
 * from this page's write paths, and SES's `rejected` / `rendering_failure` /
 * `delivery_delay` collapse into `failed` on the way in.
 */
export const EMAIL_LIST_STATUSES = [
  "sent",
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "suppressed",
  "failed",
] as const;

export type EmailListStatus = (typeof EMAIL_LIST_STATUSES)[number];

export function isEmailListStatus(
  value: string | null | undefined
): value is EmailListStatus {
  return (
    value != null && (EMAIL_LIST_STATUSES as readonly string[]).includes(value)
  );
}

export type EmailListSort = "asc" | "desc";

export function isEmailListSort(
  value: string | null | undefined
): value is EmailListSort {
  return value === "asc" || value === "desc";
}

const BASE64_PLUS = /\+/g;
const BASE64_SLASH = /\//g;
const BASE64_PADDING = /=+$/;
const BASE64URL_DASH = /-/g;
const BASE64URL_UNDERSCORE = /_/g;
const LIKE_SPECIALS = /[\\%_]/g;

function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(BASE64_PLUS, "-")
    .replace(BASE64_SLASH, "_")
    .replace(BASE64_PADDING, "");
}

function fromBase64Url(token: string): string | null {
  try {
    const base64 = token
      .replace(BASE64URL_DASH, "+")
      .replace(BASE64URL_UNDERSCORE, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export type EmailListWindow = {
  from: Date;
  to: Date;
};

export type EmailListCursor = {
  sentAt: Date;
  /** `message_send.id`, the primary key - not the SES message id. */
  id: string;
  /**
   * The sort the keyset was walked under. A cursor is a position in ONE
   * ordering: replayed against the opposite sort it would seek the wrong way
   * and serve a page from the middle of a set the reader never asked for. The
   * route refuses that rather than guessing. `null` on a legacy token.
   */
  sort: EmailListSort | null;
  /**
   * The `from`/`to` the FIRST page was served with, carried forward so every
   * later page queries that same window. Without it the route recomputes
   * `to = new Date()` per request and the window slides forward mid-walk:
   * sends that arrive between pages enter the set the keyset has already
   * passed, and rows sitting near the `from` edge fall out of the window
   * before the reader reaches them - dropped with no sign anything is missing.
   *
   * `null` for a legacy token minted before the window was carried. Those
   * still page (sliding, as they did before), they just cannot be pinned.
   */
  window: EmailListWindow | null;
};

/**
 * Payload shape tag: `v2|<from>|<to>|<sort>|<sentAt>|<id>`. Bump whenever the
 * encoded field list changes, and keep decoding the previous tag for as long
 * as a page-2 request minted under it could still be in flight.
 */
const CURSOR_VERSION = "v2";

/**
 * Opaque so the keyset can change without a client release. The client only
 * ever hands this straight back - which is exactly why it can grow fields.
 */
export function encodeEmailCursor(cursor: EmailListCursor): string {
  const from = cursor.window ? cursor.window.from.toISOString() : "";
  const to = cursor.window ? cursor.window.to.toISOString() : "";
  return toBase64Url(
    `${CURSOR_VERSION}|${from}|${to}|${cursor.sort ?? ""}|${cursor.sentAt.toISOString()}|${cursor.id}`
  );
}

function decodeCursorWindow(rawFrom: string, rawTo: string) {
  if (!(rawFrom || rawTo)) {
    return { ok: true, window: null } as const;
  }
  const from = new Date(rawFrom);
  const to = new Date(rawTo);
  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from.getTime() > to.getTime()
  ) {
    return { ok: false, window: null } as const;
  }
  return { ok: true, window: { from, to } } as const;
}

/** `null` for anything malformed - a bad cursor is a bad request, not a 500. */
export function decodeEmailCursor(token: string): EmailListCursor | null {
  const decoded = fromBase64Url(token);
  if (!decoded) {
    return null;
  }

  if (decoded.startsWith(`${CURSOR_VERSION}|`)) {
    const parts = decoded.split("|");
    const [, rawFrom, rawTo, rawSort, rawSentAt] = parts;
    if (
      rawFrom === undefined ||
      rawTo === undefined ||
      rawSort === undefined ||
      !rawSentAt
    ) {
      return null;
    }
    if (rawSort !== "" && !isEmailListSort(rawSort)) {
      return null;
    }
    // The id is last and may itself contain the separator, so take the rest.
    const id = parts.slice(5).join("|");
    const sentAt = new Date(rawSentAt);
    if (!id || Number.isNaN(sentAt.getTime())) {
      return null;
    }
    const { ok, window } = decodeCursorWindow(rawFrom, rawTo);
    if (!ok) {
      return null;
    }
    return { sentAt, id, sort: rawSort === "" ? null : rawSort, window };
  }

  // Legacy `<sentAt>|<id>` token, minted before the window was carried.
  const separator = decoded.indexOf("|");
  if (separator < 1 || separator === decoded.length - 1) {
    return null;
  }
  const sentAt = new Date(decoded.slice(0, separator));
  if (Number.isNaN(sentAt.getTime())) {
    return null;
  }
  return { sentAt, id: decoded.slice(separator + 1), sort: null, window: null };
}

/**
 * `timestamp without time zone` literal. node-postgres serializes a JS Date
 * using the process's local offset, which a timestamp column then silently
 * drops - so the value is written explicitly in UTC instead.
 */
export function toPgTimestamp(value: Date): string {
  return value.toISOString().replace("T", " ").replace("Z", "");
}

/** Keeps a user's `%` or `_` from turning a search into a wildcard scan. */
export function escapeLikeTerm(term: string): string {
  return term.replace(LIKE_SPECIALS, (char) => `\\${char}`);
}

/** "123456789012" -> "1234...9012". Named accounts, never "an account". */
export function maskAwsAccountId(accountId: string): string {
  if (accountId.length <= 8) {
    return accountId;
  }
  return `${accountId.slice(0, 4)}...${accountId.slice(-4)}`;
}
