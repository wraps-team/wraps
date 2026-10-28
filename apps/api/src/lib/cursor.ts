import { decodeCursor } from "@wraps/db";

export const INVALID_CURSOR_MESSAGE =
  "Invalid cursor. Pass the nextCursor from a previous page unchanged, or omit cursor to start from the first page.";

/**
 * Decode a client-supplied keyset cursor from a query string.
 *
 * An absent cursor is the first page and returns null. A present cursor that
 * does not decode is a 400: treating it as the first page makes a client that
 * follows a stale or corrupted cursor loop over page one with no error.
 */
export function parseCursorParam(
  cursor: string | undefined,
  set: { status?: unknown }
): { createdAt: Date; id: string } | null {
  if (cursor === undefined) {
    return null;
  }
  const decoded = decodeCursor(cursor);
  if (decoded === null) {
    set.status = 400;
    throw new Error(INVALID_CURSOR_MESSAGE);
  }
  return decoded;
}
