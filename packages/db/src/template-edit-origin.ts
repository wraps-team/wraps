/**
 * Which template fields a CLI push owns.
 *
 * `wraps push` overwrites these columns on every push
 * (apps/api/src/routes/templates-sync.ts, upsertTemplateFromCli). The push
 * refuses to overwrite a template whose lastEditedFrom is "dashboard" or
 * "api", so any dashboard write that changes one of these fields must set
 * lastEditedFrom: "dashboard", or the next push silently discards it.
 *
 * Pure module with no imports: safe to use from any server code.
 */
export const TEMPLATE_PUSH_OWNED_FIELDS = [
  "source",
  "subject",
  "previewText",
  "compiledHtml",
  "compiledText",
  "emailType",
  "variables",
] as const;

/** True when a pending template update changes a field a CLI push owns. */
export function editsPushOwnedTemplateField(
  changes: Record<string, unknown>
): boolean {
  return TEMPLATE_PUSH_OWNED_FIELDS.some(
    (field) => changes[field] !== undefined
  );
}
