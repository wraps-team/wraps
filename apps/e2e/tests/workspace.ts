import type { Browser } from "@e2e-dev/web";
import { expect } from "e2e";

type App = { open(path?: string): Promise<void> };

// The setup picks a fresh slug each run; the root redirect is how a test finds
// it. Pass it to agent steps as unique(slug) so recordings replay across runs.
export const openInWorkspace = async (
  app: App,
  browser: Browser,
  path: string
) => {
  await app.open("/");
  await expect(browser).toHaveURL(/\/emails$/);
  const slug = new URL(await browser.url()).pathname.split("/")[1];
  await app.open(`/${slug}${path}`);
  return slug;
};
