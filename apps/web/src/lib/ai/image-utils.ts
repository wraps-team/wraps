import { validatePublicUrl } from "@/lib/ssrf-guard";

export type ProcessedImage = {
  base64: string;
  mediaType: string;
};

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Fetches an image URL and converts it to base64 for use with AI models.
 */
export async function fetchAndProcessImage(
  url: string
): Promise<ProcessedImage> {
  const urlValidation = validatePublicUrl(url);
  if (!urlValidation.valid) {
    throw new Error(`Invalid image URL: ${urlValidation.error}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Failed to fetch image (HTTP ${response.status})`);
    }

    const contentType = response.headers.get("content-type")?.split(";")[0];
    if (!contentType?.startsWith("image/")) {
      throw new Error(`Not an image: ${contentType}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    if (arrayBuffer.byteLength > MAX_IMAGE_SIZE) {
      throw new Error(
        `Image too large (${Math.round(arrayBuffer.byteLength / 1024 / 1024)}MB)`
      );
    }

    const base64 = Buffer.from(arrayBuffer).toString("base64");

    return {
      base64,
      mediaType: contentType,
    };
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Image fetch timed out");
    }
    throw error;
  }
}
