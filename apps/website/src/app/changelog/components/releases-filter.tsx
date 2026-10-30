"use client";

import { type ReactNode, useEffect, useState } from "react";
import {
  matchesTag,
  parseTagParam,
  type TagOption,
  withTagParam,
} from "../filter";

type FilterableEntry = {
  slug: string;
  tags: string[];
  /** The whole timeline row, rendered on the server. */
  node: ReactNode;
};

type ReleasesFilterProps = {
  entries: FilterableEntry[];
  options: TagOption<string>[];
};

const chipClass =
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-3xs uppercase tracking-eyebrow transition-colors focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2";
const chipIdle =
  "border-border text-muted-foreground hover:border-brand/40 hover:text-foreground";
const chipActive = "border-brand/40 bg-brand/10 text-brand-text";

/**
 * Surface filter for the changelog index. Every entry is rendered on the server,
 * so with scripts off, or before hydration, the full list shows. The selection
 * lives in `?tag=` so a filtered view can be linked, and is written with
 * `replaceState` so stepping through chips does not fill the back stack.
 */
export function ReleasesFilter({ entries, options }: ReleasesFilterProps) {
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const known = options.map((option) => option.tag);
    const sync = () =>
      setSelected(parseTagParam(window.location.search, known));
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [options]);

  const select = (tag: string | null) => {
    setSelected(tag);
    const url = new URL(window.location.href);
    url.search = withTagParam(url.search, tag);
    window.history.replaceState(null, "", url);
  };

  const visible = entries.filter((entry) => matchesTag(entry.tags, selected));

  return (
    <>
      <div className="mb-10">
        <fieldset className="flex min-w-0 flex-wrap items-center gap-2">
          <legend className="sr-only">Filter by surface</legend>
          <button
            aria-pressed={selected === null}
            className={`${chipClass} ${selected === null ? chipActive : chipIdle}`}
            onClick={() => select(null)}
            type="button"
          >
            All
            <span className="opacity-60">{entries.length}</span>
          </button>
          {options.map((option) => (
            <button
              aria-pressed={selected === option.tag}
              className={`${chipClass} ${selected === option.tag ? chipActive : chipIdle}`}
              key={option.tag}
              onClick={() => select(option.tag)}
              type="button"
            >
              {option.label}
              <span className="opacity-60">{option.count}</span>
            </button>
          ))}
        </fieldset>
        <p aria-live="polite" className="sr-only">
          {selected === null
            ? `Showing all ${entries.length} entries`
            : `Showing ${visible.length} of ${entries.length} entries`}
        </p>
      </div>

      <div className="relative">
        {/* Timeline line - contained to releases section */}
        <div className="absolute top-0 bottom-0 left-[24px] w-[1.5px] bg-border" />
        <div className="space-y-12">
          {visible.map((entry) => (
            <div key={entry.slug}>{entry.node}</div>
          ))}
        </div>
      </div>
    </>
  );
}
