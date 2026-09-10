/**
 * check:answers — a ratchet proving every declared search-intent route
 * states its declared query in the first 100 words of its served markdown.
 *
 * Every route is served as markdown at https://wraps.dev/<route>.md (root ->
 * /index.md). That is the representation a model extracting an answer reads —
 * it lifts a claim from the opening, not the whole document — so a page can
 * pass every static test in search-intent-map.test.ts and still bury its
 * answer 150 words down. This script measures that directly against the live
 * site.
 *
 * This is a ratchet, not a pass/fail gate: the current count is not 100% and
 * this script does not fix pages, it only proves the number doesn't silently
 * regress. See FLOOR below.
 *
 * Usage: pnpm check:answers
 * (wired in package.json; not part of check:fast or check:all — see there
 * for why)
 */

import {
  SEARCH_INTENT,
  type SearchIntentEntry,
} from "../apps/website/src/config/search-intent.js";

const SITE = process.env.CHECK_ANSWERS_BASE_URL ?? "https://wraps.dev";
const FETCH_TIMEOUT_MS = 10_000;
const CONCURRENCY = 8;

/**
 * A page counts as "answer-shaped" at 75% term coverage, not 100% — matching
 * the bar used for the by-hand measurement this script replaces (see plan
 * 294's STOP conditions: "70 routes with >=75% coverage"). Requiring every
 * single content term, including incidental ones, would flag pages that are
 * genuinely fine.
 */
const THRESHOLD = 0.75;

/**
 * The floor this ratchet enforces. Only ever goes up — when pages improve,
 * raise it in the same commit that improved them.
 *
 * Measured, not chosen: running this script against the live site on
 * 2026-09-10 returned 70/84. This is a pre-293 baseline — plan 293 (which
 * fixes the two biggest templates' dropped openings) had not shipped yet
 * when this number was taken, so it will move once 293 deploys and the floor
 * should be raised then.
 */
const FLOOR = 70;

const STOPWORDS = new Set(
  "a an the to for of in on at is are do does how what why when your you my i and or vs with from get got been be it its this that not no".split(
    " "
  )
);

const WORD_SPLIT = /\s+/;
const TITLE_LINE = /^#\s+(.+)$/;
const SOURCE_LINE = /^Source:/;

function toWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(WORD_SPLIT)
    .filter((word) => word.length > 0);
}

/**
 * The query's content terms: lowercase words, minus stopwords. Frozen list —
 * see STOPWORDS above. Changing it changes every score and makes historical
 * numbers incomparable; re-baseline FLOOR in the same commit if it must
 * change.
 */
function contentTerms(query: string): string[] {
  return toWords(query).filter((word) => !STOPWORDS.has(word));
}

/**
 * Splits a derived-markdown document (the format `deriveMarkdownFromHtml`
 * produces: `# {title}`, blank, `Source: {url}`, blank, then body) into the
 * title text and the body that follows it. Robust to the exact blank-line
 * count, not just the nominal one-blank-line-each layout.
 */
export function splitDerivedMarkdown(markdown: string): {
  title: string;
  body: string;
} {
  const lines = markdown.split("\n");
  let index = 0;
  let title = "";

  const titleMatch = TITLE_LINE.exec(lines[0] ?? "");
  if (titleMatch) {
    title = titleMatch[1];
    index = 1;
  }

  while (
    index < lines.length &&
    (lines[index].trim().length === 0 || SOURCE_LINE.test(lines[index]))
  ) {
    index += 1;
  }

  return { title, body: lines.slice(index).join("\n") };
}

export type AnswerShapedMissingTerm = {
  term: string;
  /**
   * 1-based word position (counting title words, then body words) where the
   * term first actually appears in the document — undefined if it never
   * does. This is what makes a failure actionable: "hipaa first appears at
   * word 149" tells a writer exactly what to move, not just that something
   * is wrong.
   */
  firstWordIndex: number | undefined;
};

export type AnswerShapedScore = {
  coverage: number;
  missing: AnswerShapedMissingTerm[];
};

/**
 * The pure part of the check: given one page's already-fetched markdown and
 * its declared query, score how much of the query's content is stated in
 * "title + first 100 words of body". Exported separately from the fetching
 * below, exactly as `deriveMarkdownFromHtml` is exported separately from
 * `fetchDerivedMarkdown` in apps/website/src/lib/derive-markdown.ts — so it
 * can be tested against fixture strings with no network round trip.
 */
export function scoreAnswerShaped(
  markdown: string,
  primaryQuery: string
): AnswerShapedScore {
  const terms = contentTerms(primaryQuery);
  if (terms.length === 0) {
    return { coverage: 1, missing: [] };
  }

  const { title, body } = splitDerivedMarkdown(markdown);
  const titleWords = toWords(title);
  const bodyWords = toWords(body);
  const scoredWords = [...titleWords, ...bodyWords.slice(0, 100)];
  const fullDocWords = [...titleWords, ...bodyWords];

  const missing: AnswerShapedMissingTerm[] = [];
  for (const term of terms) {
    const stated = scoredWords.some((word) => word.includes(term));
    if (stated) {
      continue;
    }
    // Not in scope for the score, but worth naming where it does show up (if
    // anywhere) — that's the "first appears at word N" figure.
    const laterIndex = fullDocWords.findIndex((word) => word.includes(term));
    missing.push({
      term,
      firstWordIndex: laterIndex === -1 ? undefined : laterIndex + 1,
    });
  }

  const coverage = (terms.length - missing.length) / terms.length;
  return { coverage, missing };
}

type FetchOutcome =
  | { ok: true; markdown: string }
  | { ok: false; reason: string };

async function fetchRouteMarkdown(route: string): Promise<FetchOutcome> {
  const path = route === "/" ? "/index.md" : `${route}.md`;
  const url = `${SITE}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    // A timeout and a transport failure both end here; say which one
    // happened, same as fetchDerivedMarkdown does for the same reason.
    const reason =
      error instanceof Error && error.name === "TimeoutError"
        ? `timed out after ${FETCH_TIMEOUT_MS}ms`
        : `network error: ${error instanceof Error ? error.message : String(error)}`;
    return { ok: false, reason };
  }

  if (!response.ok) {
    return { ok: false, reason: `HTTP ${response.status}` };
  }

  return { ok: true, markdown: await response.text() };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

type RouteResult =
  | {
      kind: "fetch-error";
      route: string;
      primaryQuery: string;
      reason: string;
    }
  | {
      kind: "scored";
      route: string;
      primaryQuery: string;
      coverage: number;
      missing: AnswerShapedMissingTerm[];
    };

async function scoreEntry(entry: SearchIntentEntry): Promise<RouteResult> {
  const outcome = await fetchRouteMarkdown(entry.route);
  if (!outcome.ok) {
    return {
      kind: "fetch-error",
      route: entry.route,
      primaryQuery: entry.primaryQuery,
      reason: outcome.reason,
    };
  }

  const { coverage, missing } = scoreAnswerShaped(
    outcome.markdown,
    entry.primaryQuery
  );
  return {
    kind: "scored",
    route: entry.route,
    primaryQuery: entry.primaryQuery,
    coverage,
    missing,
  };
}

function describeMissing(missing: AnswerShapedMissingTerm[]): string {
  return missing
    .map((m) =>
      m.firstWordIndex === undefined
        ? `"${m.term}" (not found anywhere on the page)`
        : `"${m.term}" (first appears at word ${m.firstWordIndex})`
    )
    .join(", ");
}

export async function main(): Promise<number> {
  const results = await mapWithConcurrency(
    SEARCH_INTENT,
    CONCURRENCY,
    scoreEntry
  );

  const fetchErrors = results.filter((r) => r.kind === "fetch-error");

  // A fetch failure is never a content finding — it means the page could not
  // be retrieved (network error, timeout, non-200), not that it stopped
  // stating its query. Reported and exit-coded separately from coverage, the
  // same distinction scripts/check-cloudformation-published.sh draws for the
  // same reason. Printed first, and the run produces NO coverage summary at
  // all in this case — a partial "N/84" is exactly the number someone copies
  // into the discoverability scoreboard, and a fraction computed from
  // unusable data is worse than no number.
  if (fetchErrors.length > 0) {
    console.error(
      `❌ FETCH FAILED for ${fetchErrors.length} route(s) — this is NOT a content finding.`
    );
    console.error(
      "   The page(s) below could not be retrieved (network error, timeout,"
    );
    console.error(
      "   or non-200 response). Do not read this as a drop in answer-shaped"
    );
    console.error("   coverage; investigate the fetch first.\n");
    for (const failure of fetchErrors) {
      console.error(`   ${failure.route}: ${failure.reason}`);
    }
    console.error(
      "\nNo coverage measurement was produced — fix the fetch and re-run."
    );
    return 1;
  }

  const scored = results.filter((r) => r.kind === "scored");
  const belowThreshold = scored.filter((r) => r.coverage < THRESHOLD);
  const passing = scored.length - belowThreshold.length;
  const total = SEARCH_INTENT.length;

  if (belowThreshold.length > 0) {
    console.log(
      `\nBelow ${Math.round(THRESHOLD * 100)}% coverage (${belowThreshold.length}):\n`
    );
    for (const r of belowThreshold) {
      console.log(
        `  ${r.route} — declares "${r.primaryQuery}" — ${Math.round(r.coverage * 100)}% — missing: ${describeMissing(r.missing)}`
      );
    }
  }

  console.log(
    `\n${passing}/${total} routes state their declared query in the first 100 words`
  );

  if (passing < FLOOR) {
    console.error(
      `\n❌ Below floor: ${passing} < ${FLOOR}. A page that used to state its query up front no longer does — that is a real regression.`
    );
    return 1;
  }

  if (passing > FLOOR) {
    console.log(
      `\n✓ ${passing} is above the floor of ${FLOOR} — raise FLOOR in scripts/check-answer-shaped.ts to lock in the improvement.`
    );
  }

  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
