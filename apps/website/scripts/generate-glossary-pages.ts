/**
 * Regenerates everything downstream of `src/lib/glossary.ts`:
 *
 *   1. `src/app/glossary/<slug>/page.tsx` — a 12-line route shim per term
 *   2. `public/llms.txt` — one bullet per route, inside a delimited block
 *   3. `src/config/search-intent.ts` — one entry per route, same idea
 *
 * All three or none. Five separate call sites discover routes by globbing
 * `**\/page.tsx` — the sitemap, the page-dates manifest, and three tests — and
 * two more enforce that every route appears in llms.txt and in the search
 * intent map. Generating only part of this leaves the suite red.
 *
 * ## Why shims and not a [slug] dynamic route
 *
 * A dynamic route contributes ONE glob hit no matter how many pages it serves,
 * so all five of those call sites would silently stop seeing these pages: no
 * sitemap entries, no lastmod dates, no coverage enforcement. Generated
 * boilerplate is ugly; losing the guardrails is worse. /ses/errors/* and
 * /versus/* already ship this way for the same reason.
 *
 *   pnpm --filter wraps-website glossary:generate
 *
 * Idempotent: run it twice and `git diff` is empty.
 *
 * Deliberately NOT touched here: `src/config/page-dates.ts`. That manifest is
 * regenerated with `pnpm sitemap:dates`, which reads `git log` — running it
 * against files this script just wrote, before they're committed, would give
 * every glossary route today's date, not a real history. Regenerate it
 * separately, after committing, the same way the versus/ses-errors pages do.
 */

import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { GLOSSARY, type GlossaryTerm } from "../src/lib/glossary";

const websiteRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(websiteRoot, "..", "..");
const glossaryAppDir = join(websiteRoot, "src/app/glossary");
const llmsFile = join(websiteRoot, "public/llms.txt");
const searchIntentFile = join(websiteRoot, "src/config/search-intent.ts");

const LLMS_BEGIN = "<!-- BEGIN GENERATED GLOSSARY -->";
const LLMS_END = "<!-- END GENERATED GLOSSARY -->";
const INTENT_BEGIN = "  // BEGIN GENERATED GLOSSARY INTENT";
const INTENT_END = "  // END GENERATED GLOSSARY INTENT";

function shimFor(term: GlossaryTerm): string {
  return `import {
  GlossaryArticle,
  glossaryMetadata,
} from "@/components/glossary-article";
import { glossaryTermBySlug } from "@/lib/glossary";

const term = glossaryTermBySlug("${term.slug}");

export const metadata = glossaryMetadata(term);

export default function Page() {
  return <GlossaryArticle term={term} />;
}
`;
}

/** Route shims: one directory per configured slug, and nothing else. */
function writeShims(): string[] {
  mkdirSync(glossaryAppDir, { recursive: true });
  const configured = new Set(GLOSSARY.map((term) => term.slug));

  // A slug that was renamed leaves an orphan directory behind, which the test
  // catches but which is easier to just not create.
  for (const entry of readdirSync(glossaryAppDir, { withFileTypes: true })) {
    if (entry.isDirectory() && !configured.has(entry.name)) {
      rmSync(join(glossaryAppDir, entry.name), {
        recursive: true,
        force: true,
      });
    }
  }

  const written: string[] = [];
  for (const term of GLOSSARY) {
    const dir = join(glossaryAppDir, term.slug);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, "page.tsx");
    writeFileSync(file, shimFor(term));
    written.push(file);
  }
  return written;
}

type Block = { file: string; begin: string; end: string };

/**
 * Rewrites the delimited region of a file in place. Both target files are
 * appended to by other work in the same tree, so we replace only what sits
 * between the markers and never reformat, reorder or reflow the rest.
 */
function replaceBlock(block: Block, body: string): void {
  const source = readFileSync(block.file, "utf8");
  const start = source.indexOf(block.begin);
  const finish = source.indexOf(block.end);
  if (start === -1 || finish === -1) {
    throw new Error(
      `${block.file} is missing the generated block markers. Expected "${block.begin}" and "${block.end}".`
    );
  }
  writeFileSync(
    block.file,
    `${source.slice(0, start + block.begin.length)}\n${body}\n${source.slice(finish)}`
  );
}

/**
 * llms.txt bullets. agent-surface.test.ts requires every page.tsx route to
 * appear here as a URL that ends where the route ends, with no exceptions
 * list, so a missing bullet is a red suite rather than a quiet gap.
 */
function writeLlmsTxt(): void {
  const bullets = [
    "- [All email terminology](https://wraps.dev/glossary): Every term grouped by authentication, deliverability, infrastructure, compliance, and metrics",
    ...GLOSSARY.map(
      (term) =>
        `- [${term.term}](https://wraps.dev/glossary/${term.slug}): ${term.shortDefinition}`
    ),
  ].join("\n");

  replaceBlock({ file: llmsFile, begin: LLMS_BEGIN, end: LLMS_END }, bullets);
}

/** Matches the two-space indentation of the SEARCH_INTENT array literal. */
function intentEntry(route: string, term: GlossaryTerm | null): string {
  const primaryQuery = term
    ? `what is ${term.term.toLowerCase()}`
    : "email terminology glossary";
  const secondaryQueries = term
    ? [...term.aliases.slice(0, 3).map((alias) => alias.toLowerCase())]
    : ["email jargon explained", "email deliverability glossary"];
  const rationale = term
    ? "Written from what packages/email-check actually evaluates for this term rather than general knowledge, and linked from every /ses, /versus, and /blog page that already uses the term without defining it."
    : "Every term a reader hits across the SES error pages, the versus comparisons, and the blog posts, defined once and linked from everywhere else it's used instead of re-explained per page.";
  const secondary = secondaryQueries
    .map((query) => `      ${JSON.stringify(query)},`)
    .join("\n");
  return `  {
    route: ${JSON.stringify(route)},
    primaryQuery: ${JSON.stringify(primaryQuery)},
    secondaryQueries: [
${secondary}
    ],
    audience: "stranger-with-problem",
    rationale:
      ${JSON.stringify(rationale)},
  },`;
}

function writeSearchIntent(): void {
  const entries = [
    intentEntry("/glossary", null),
    ...GLOSSARY.map((term) => intentEntry(`/glossary/${term.slug}`, term)),
  ].join("\n");

  replaceBlock(
    { file: searchIntentFile, begin: INTENT_BEGIN, end: INTENT_END },
    entries
  );
}

/**
 * Hand-emitted TypeScript will not match biome's line breaking, and an
 * unformatted generated file reds `pnpm check`. Format what we wrote rather
 * than trying to predict the formatter — the same approach the versus
 * generator takes.
 */
function format(files: string[]): void {
  execFileSync(
    join(repoRoot, "node_modules/.bin/biome"),
    ["format", "--write", ...files],
    { cwd: repoRoot, stdio: "inherit" }
  );
}

const shims = writeShims();
writeLlmsTxt();
writeSearchIntent();
format([...shims, searchIntentFile]);

process.stdout.write(
  `glossary: wrote ${shims.length} shims, ${GLOSSARY.length + 1} llms.txt bullets, ${GLOSSARY.length + 1} search-intent entries\n`
);
