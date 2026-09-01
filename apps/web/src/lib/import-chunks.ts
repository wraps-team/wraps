/**
 * Splitting a mapped contact list into Server Action-sized calls.
 *
 * The importer used to post every mapped row in one body. Next caps a Server
 * Action body at `serverActions.bodySizeLimit`, and the cap is enforced by the
 * framework before our code runs — so a large file died with a bare "Body
 * exceeded 1 MB limit" that no action could catch or explain. Raising the cap
 * only moves the wall; splitting the send removes it, and the file size the
 * importer accepts stops being tied to a request limit at all.
 *
 * Chunks are measured in bytes rather than rows because row size is not
 * uniform: a file mapping ten custom properties per contact serializes several
 * times larger than one carrying an email alone.
 */

/**
 * Serialized bytes to aim for per call. Comfortably under the configured
 * `bodySizeLimit` so per-request overhead and multi-byte characters have room.
 */
export const IMPORT_CHUNK_BYTES = 3 * 1024 * 1024;

/**
 * Rows per call, whatever the byte budget allows. Each chunk is one
 * transaction batch loop server-side; keeping it bounded keeps any single
 * request's database work bounded too.
 */
export const IMPORT_CHUNK_ROWS = 2000;

/** UTF-8 byte length of a value once serialized. */
export function serializedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/**
 * Split `items` into chunks that each stay within the byte and row budgets.
 *
 * A single item larger than the byte budget still gets its own chunk rather
 * than being dropped — the caller reports it, since silently skipping a
 * contact is worse than a request that fails loudly.
 */
export function chunkForImport<T>(
  items: T[],
  options?: { maxBytes?: number; maxRows?: number }
): T[][] {
  const maxBytes = options?.maxBytes ?? IMPORT_CHUNK_BYTES;
  const maxRows = options?.maxRows ?? IMPORT_CHUNK_ROWS;

  if (items.length === 0) {
    return [];
  }

  const chunks: T[][] = [];
  let current: T[] = [];
  // Tracks the serialized size of `current` as a JSON array: the items plus
  // the separating commas and the enclosing brackets.
  let currentBytes = 2;

  for (const item of items) {
    const itemBytes = serializedBytes(item) + 1;

    const wouldExceedBytes =
      current.length > 0 && currentBytes + itemBytes > maxBytes;
    const wouldExceedRows = current.length >= maxRows;

    if (wouldExceedBytes || wouldExceedRows) {
      chunks.push(current);
      current = [];
      currentBytes = 2;
    }

    current.push(item);
    currentBytes += itemBytes;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}
