/**
 * Default placeholder images for email templates
 * Uses placehold.co for simple, reliable placeholder images
 */

export const PLACEHOLDER_IMAGES = {
  /** Default logo placeholder (200x50) */
  logo: "https://placehold.co/200x50/e2e8f0/64748b?text=Logo",

  /** Default avatar placeholder (64x64) */
  avatar: "https://placehold.co/64x64/e2e8f0/64748b?text=",

  /** Default hero/banner image placeholder (600x300) */
  hero: "https://placehold.co/600x300/e2e8f0/64748b?text=Hero+Image",

  /** Default product image placeholder (280x280) */
  product: "https://placehold.co/280x280/e2e8f0/64748b?text=Product",

  /** Default article/thumbnail image placeholder (280x180) */
  thumbnail: "https://placehold.co/280x180/e2e8f0/64748b?text=Image",

  /** Generic image placeholder (400x300) */
  generic: "https://placehold.co/400x300/e2e8f0/64748b?text=Image",
} as const;

/**
 * Checks if a URL is a variable placeholder (e.g., {{logoUrl}})
 */
export function isVariablePlaceholder(url: string | null | undefined): boolean {
  if (!url) return true;
  return /^\{\{.+\}\}$/.test(url.trim());
}

/**
 * Returns a placeholder image URL if the source is empty or a variable placeholder
 */
export function getImageWithPlaceholder(
  src: string | null | undefined,
  type: keyof typeof PLACEHOLDER_IMAGES = "generic"
): string {
  if (!src || isVariablePlaceholder(src)) {
    return PLACEHOLDER_IMAGES[type];
  }
  return src;
}
