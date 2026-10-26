/**
 * Pure helpers for the changelog's surface filter. Kept free of runtime imports
 * from `./releases`: the filter is a client component, and importing the entry
 * data there would ship every entry's JSX to the browser a second time.
 */

/** Query parameter that holds the selected surface, e.g. `/changelog?tag=cli`. */
export const TAG_PARAM = "tag";

export type TagOption<T extends string> = {
  tag: T;
  label: string;
  count: number;
};

/**
 * One option per surface that at least one entry carries, in the order of
 * `labels`. A surface nothing is tagged with is left out, so no chip leads to
 * an empty page.
 */
export function tagOptions<T extends string>(
  labels: Record<T, string>,
  entries: ReadonlyArray<{ tags: readonly T[] }>
): TagOption<T>[] {
  const options: TagOption<T>[] = [];
  for (const tag of Object.keys(labels) as T[]) {
    const count = entries.filter((entry) => entry.tags.includes(tag)).length;
    if (count > 0) {
      options.push({ tag, label: labels[tag], count });
    }
  }
  return options;
}

/** The selected surface from a query string, or `null` when absent or unknown. */
export function parseTagParam<T extends string>(
  search: string,
  known: readonly T[]
): T | null {
  const value = new URLSearchParams(search).get(TAG_PARAM);
  return known.find((tag) => tag === value) ?? null;
}

/** Whether an entry belongs under the selection. No selection shows everything. */
export function matchesTag(
  tags: readonly string[],
  selected: string | null
): boolean {
  return selected === null || tags.includes(selected);
}

/**
 * The query string for a selection, leaving any other parameters alone. Returns
 * `""` or a string that starts with `?`.
 */
export function withTagParam(search: string, tag: string | null): string {
  const params = new URLSearchParams(search);
  if (tag === null) {
    params.delete(TAG_PARAM);
  } else {
    params.set(TAG_PARAM, tag);
  }
  const next = params.toString();
  return next === "" ? "" : `?${next}`;
}
