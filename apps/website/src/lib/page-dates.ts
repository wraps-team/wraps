/**
 * Which files under src/app belong to which route.
 *
 * Shared by scripts/generate-page-dates.ts (which writes the sitemap's
 * lastmod manifest) and src/__tests__/sitemap.test.ts (which fails when the
 * manifest falls behind). Keeping one copy is not tidiness: when the two had
 * their own exclusion lists they disagreed about mcp/server-card and the test
 * reported drift that was not there.
 */

/**
 * Paths under src/app that hold no page content. The route files at the root
 * are listed by name because the nearest-ancestor rule would otherwise hand
 * them to "/" — editing the sitemap generator is not a change to the homepage.
 */
const NOT_PAGE_CONTENT = [
  "api/",
  ".well-known/",
  "robots.txt/",
  "mcp/server-card/",
  "sitemap.ts",
];

/** Only files that end up in the rendered page count — not a stray .md draft. */
const RENDERED_EXTENSIONS = [".tsx", ".ts", ".css"];

const NESTED_PAGE_FILE = /\/page\.tsx$/;
const ROOT_PAGE_FILE = /page\.tsx$/;
const ROUTE_GROUP = /\([^)]+\)\/?/g;
const TRAILING_SLASH = /\/$/;

/** Route path for a src/app-relative page.tsx. Mirrors sitemap.ts. */
export function routeForPageFile(pageFile: string): string {
  const route = pageFile
    .replace(NESTED_PAGE_FILE, "")
    .replace(ROOT_PAGE_FILE, "")
    .replace(ROUTE_GROUP, "");
  return `/${route}`.replace(TRAILING_SLASH, "") || "/";
}

/**
 * Route directories, longest first, so the nearest route ancestor wins.
 * `page.tsx` at the root becomes ".", which owns anything no deeper route does.
 */
export function routeDirsByDepth(pageFiles: string[]): string[] {
  return pageFiles
    .map((file) =>
      file === "page.tsx" ? "." : file.replace(NESTED_PAGE_FILE, "")
    )
    .sort((a, b) => b.length - a.length);
}

/**
 * The route whose own content this file is part of — its page.tsx, its
 * page-content.tsx, and any components private to it. Returns undefined for
 * files that are not page content at all.
 */
export function ownerRouteFor(
  appRelativeFile: string,
  routeDirsLongestFirst: string[]
): string | undefined {
  if (NOT_PAGE_CONTENT.some((prefix) => appRelativeFile.startsWith(prefix))) {
    return;
  }
  if (!RENDERED_EXTENSIONS.some((ext) => appRelativeFile.endsWith(ext))) {
    return;
  }
  const dir = routeDirsLongestFirst.find(
    (routeDir) => routeDir === "." || appRelativeFile.startsWith(`${routeDir}/`)
  );
  if (dir === undefined) {
    return;
  }
  return dir === "." ? "/" : `/${dir.replace(ROUTE_GROUP, "")}`;
}
