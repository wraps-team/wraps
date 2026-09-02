export { cn } from "cn";

/**
 * Get the correct URL for public assets
 * In Next.js, public assets are served from the root
 */
export function assetUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return cleanPath;
}

/**
 * Get the correct URL path for internal navigation
 * @param path - The internal path (e.g., "/", "/auth")
 * @returns The full path
 */
export function getAppUrl(path: string): string {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return cleanPath;
}
