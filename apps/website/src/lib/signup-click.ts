const APP_HOST = "app.wraps.dev";
const SIGNUP_PATHS = new Set(["/auth", "/sign-up"]);
const MAX_LINK_TEXT = 80;

/**
 * Properties for a `signup_click` event, or null when the link is not a
 * signup link.
 *
 * `cta_click` is hand-wired on the homepage and a few landing pages, so every
 * other page looks like zero intent. This classifies any link into the
 * dashboard's signup flow, so one delegated listener covers all pages.
 */
export function signupClickProperties(
  href: string,
  pagePath: string,
  linkText: string
): Record<string, string> | null {
  let url: URL;
  try {
    url = new URL(href, "https://wraps.dev");
  } catch {
    return null;
  }

  if (url.hostname !== APP_HOST || !SIGNUP_PATHS.has(url.pathname)) {
    return null;
  }
  if (url.searchParams.get("mode") === "signin") {
    return null;
  }

  const properties: Record<string, string> = {
    page_path: pagePath,
    link_text: linkText.replace(/\s+/g, " ").trim().slice(0, MAX_LINK_TEXT),
  };
  const plan = url.searchParams.get("plan");
  if (plan) {
    properties.plan = plan;
  }
  return properties;
}
