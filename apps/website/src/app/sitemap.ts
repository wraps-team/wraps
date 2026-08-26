import { globSync, statSync } from "node:fs";
import { join } from "node:path";
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://wraps.dev";
  const appDir = join(process.cwd(), "src/app");

  const pages = globSync("**/page.tsx", { cwd: appDir });

  const routes = pages
    .map((file) => {
      const route = file
        .replace(/\/page\.tsx$/, "")
        .replace(/page\.tsx$/, "")
        .replace(/\([^)]+\)\/?/g, ""); // strip route groups like (auth)/
      return {
        path: `/${route}`.replace(/\/$/, "") || "/",
        // The page file's mtime. Not perfect — a page whose content lives in a
        // sibling page-content.tsx or in a shared component will not move — but
        // it is a real fact about this deployment. The previous value was
        // `new Date()`, which told every crawler that all 117 URLs had changed
        // on every single fetch.
        lastModified: fileModifiedAt(join(appDir, file)),
      };
    })
    .filter((route) => route.path !== "/sitemap")
    .sort((a, b) => a.path.localeCompare(b.path));

  return routes.map(({ path, lastModified }) => ({
    url: `${baseUrl}${path === "/" ? "" : path}`,
    lastModified,
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority:
      path === "/"
        ? 1
        : path.startsWith("/tools")
          ? 0.9
          : path.startsWith("/docs") || path.startsWith("/compare")
            ? 0.8
            : 0.7,
  }));
}

/** Falls back to undefined rather than lying if the file cannot be stat'd. */
function fileModifiedAt(absolutePath: string): Date | undefined {
  try {
    return statSync(absolutePath).mtime;
  } catch {
    return;
  }
}
