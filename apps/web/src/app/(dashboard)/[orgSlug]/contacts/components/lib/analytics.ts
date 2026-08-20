"use client";

import posthog from "posthog-js";

/**
 * Product instrumentation for the contacts tree (audit finding F16).
 *
 * `posthog.capture` appeared zero times across the whole contacts / segments /
 * topics tree before this pass, so every fix proposed for this surface was
 * unmeasurable - most importantly the 4-step CSV import wizard, the main path
 * to a first audience, which could not be funnel-analysed at all.
 *
 * Conventions here match the only prior art in the app, `emails/lib/analytics.ts`
 * (audit finding F10) and the broadcast composer's `audience_type`:
 * - Event names and properties are snake_case.
 * - No contact PII. Email addresses, names, phone numbers, raw search terms,
 *   and CSV cell values never leave the browser - only counts, enums,
 *   booleans, and lengths.
 * - `contact_created` (single) and the `contacts_imported` milestone are
 *   already emitted server-side, unconditionally and only-on-first-success
 *   respectively, from `lib/activation-tracking.ts` (`trackContactCreated`,
 *   `trackContactsImported`, called from `actions/contacts.ts`,
 *   `actions/contacts-bulk.ts`, and `actions/import-contacts.ts`). This file
 *   never re-captures those - it reports what they miss: contact updates and
 *   deletes (no server capture exists for either), the import wizard's
 *   intermediate funnel steps and its failure path (the server only fires
 *   when `created > 0`, so an all-duplicates or all-error import is currently
 *   invisible), search, filters, export, and the detail view.
 *
 * Topic subscribe/unsubscribe (single, via the edit form, and bulk, via the
 * row-selection actions menu) were a gap left over from the initial contacts
 * pass, closed here in wave 3 alongside the topics tree's own instrumentation
 * (`topics/components/lib/analytics.ts` - see that file for
 * `topic_created`/`topic_updated`/etc). No server capture exists for either
 * direction of a subscription change.
 */

// ─── Import wizard funnel ───────────────────────────────────────────────────
// Steps in order: started -> file_parsed -> columns_mapped -> submitted ->
// completed | failed. `contacts_imported` (activation-tracking) still fires
// alongside `contacts_import_completed` on a successful import with
// created > 0 - it is a different, narrower signal (first-import milestone,
// created-count only) and is left alone.

export function captureContactsImportStarted() {
  posthog.capture("contacts_import_started");
}

export function captureContactsImportFileParsed(props: {
  row_count: number;
  total_rows: number;
  was_truncated: boolean;
}) {
  posthog.capture("contacts_import_file_parsed", props);
}

export function captureContactsImportColumnsMapped(props: {
  identifier_field: "both" | "email" | "phone";
  mapped_field_count: number;
  property_field_count: number;
}) {
  posthog.capture("contacts_import_columns_mapped", props);
}

export function captureContactsImportSubmitted(props: {
  contact_count: number;
  duplicate_strategy: "skip" | "update";
  topic_count: number;
  was_truncated: boolean;
}) {
  posthog.capture("contacts_import_submitted", props);
}

export function captureContactsImportCompleted(props: {
  contact_count: number;
  created: number;
  failed: number;
  skipped: number;
  updated: number;
}) {
  posthog.capture("contacts_import_completed", props);
}

export function captureContactsImportFailed(props: { contact_count: number }) {
  posthog.capture("contacts_import_failed", props);
}

// ─── Contact CRUD (single + bulk) ──────────────────────────────────────────

/** Updates have no server-side capture at all - not just a duplicate risk. */
export function captureContactUpdated(props: {
  fields: string[];
  topics_changed: boolean;
}) {
  posthog.capture("contact_updated", props);
}

export function captureContactDeleted() {
  posthog.capture("contact_deleted");
}

export function captureContactsBulkDeleted(props: { count: number }) {
  posthog.capture("contacts_bulk_deleted", props);
}

// ─── List: search, filter, export, detail ──────────────────────────────────

/** Reported by length only - the term itself can be a name, email, or phone number. */
export function captureContactsSearched(props: {
  has_results: boolean;
  query_length: number;
  result_count: number;
}) {
  posthog.capture("contacts_searched", props);
}

export function captureContactsFilterChanged(props: {
  control: "email_status" | "topic";
  from: string;
  to: string;
}) {
  posthog.capture("contacts_filter_changed", props);
}

export function captureContactsExportedCsv(props: {
  row_count: number;
  selection_only: boolean;
  was_truncated: boolean;
}) {
  posthog.capture("contacts_exported_csv", props);
}

export function captureContactDetailOpened() {
  posthog.capture("contact_detail_opened");
}

export function captureContactTimelineLoadMore(props: {
  events_loaded: number;
}) {
  posthog.capture("contact_timeline_load_more", props);
}

// ─── Topic subscribe/unsubscribe (single + bulk) ───────────────────────────

export function captureContactTopicSubscribed(props: {
  contact_count: number;
  source: "bulk" | "single";
}) {
  posthog.capture("contact_topic_subscribed", props);
}

export function captureContactTopicUnsubscribed(props: {
  contact_count: number;
  source: "bulk" | "single";
}) {
  posthog.capture("contact_topic_unsubscribed", props);
}
