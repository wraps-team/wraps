/**
 * Finding rows a CSV repeats, before any of it is sent.
 *
 * The server also guards against this, but it can only see one chunk at a
 * time: a repeat whose two copies land either side of a chunk boundary reaches
 * the second call as an ordinary "this contact already exists" and is counted
 * as skipped, with no way to know it came from the same file. The browser holds
 * the whole file, so this is the only place the question can be answered
 * completely — and answering it here means the server never receives a repeat
 * at all.
 *
 * Normalization mirrors actions/import-contacts.ts: email lowercased and
 * trimmed, phone trimmed, empty treated as absent.
 */

import type { ImportContactInput } from "@/actions/import-contacts";
import type { ImportDuplicateRow } from "@/lib/contacts";

/** A row that survived deduplication, with the file row it came from. */
export type KeptRow = {
  contact: ImportContactInput;
  /** 1-based position among the file's data rows, header excluded. */
  row: number;
};

export type DedupeResult = {
  kept: KeptRow[];
  duplicates: ImportDuplicateRow[];
};

function normalizeEmail(value: string | undefined): string | null {
  return value?.toLowerCase().trim() || null;
}

function normalizePhone(value: string | undefined): string | null {
  return value?.trim() || null;
}

/**
 * Split mapped rows into the ones to import and the ones the file repeated.
 *
 * The first row to claim an email or phone wins; every later row carrying
 * either is reported against it. A row is reported once, even when it repeats
 * both fields, because it is one row the operator has to go and look at.
 *
 * Rows with neither an email nor a phone are kept: they cannot collide, and
 * rejecting them is the server's job so there is one place that decides what a
 * valid row is.
 */
export function splitRepeats(contacts: ImportContactInput[]): DedupeResult {
  const kept: KeptRow[] = [];
  const duplicates: ImportDuplicateRow[] = [];
  const emailFirstSeen = new Map<string, number>();
  const phoneFirstSeen = new Map<string, number>();

  for (const [index, contact] of contacts.entries()) {
    const row = index + 1;
    const email = normalizeEmail(contact.email);
    const phone = normalizePhone(contact.phone);

    const firstEmailRow = email ? emailFirstSeen.get(email) : undefined;
    const firstPhoneRow = phone ? phoneFirstSeen.get(phone) : undefined;

    if (firstEmailRow !== undefined) {
      duplicates.push({
        row,
        firstRow: firstEmailRow,
        field: "email",
        value: email as string,
      });
      continue;
    }
    if (firstPhoneRow !== undefined) {
      duplicates.push({
        row,
        firstRow: firstPhoneRow,
        field: "phone",
        value: phone as string,
      });
      continue;
    }

    if (email) {
      emailFirstSeen.set(email, row);
    }
    if (phone) {
      phoneFirstSeen.set(phone, row);
    }
    kept.push({ contact, row });
  }

  return { kept, duplicates };
}
