import { auth } from "@wraps/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { getOrganizationWithMembership } from "@/lib/organization";
import { validatePublicUrl } from "@/lib/ssrf-guard";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];

// POST /api/[orgSlug]/emails/templates/ai/validate-image - Validate an image URL before attaching
export async function POST(request: Request, context: RouteContext) {
  try {
    const { orgSlug } = await context.params;

    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgWithMembership = await getOrganizationWithMembership(
      orgSlug,
      session.user.id
    );

    if (!orgWithMembership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { valid: false, error: "URL is required" },
        { status: 400 }
      );
    }

    // Validate URL format and block private/internal addresses (SSRF prevention)
    const urlValidation = validatePublicUrl(url);
    if (!urlValidation.valid) {
      return NextResponse.json(
        { valid: false, error: urlValidation.error },
        { status: 400 }
      );
    }
    const parsedUrl = urlValidation.parsedUrl;

    // Send HEAD request to validate the image
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return NextResponse.json({
          valid: false,
          error: `Failed to reach image (HTTP ${response.status})`,
        });
      }

      const contentType = response.headers.get("content-type")?.split(";")[0];
      if (!(contentType && ALLOWED_CONTENT_TYPES.includes(contentType))) {
        return NextResponse.json({
          valid: false,
          error: `Unsupported image type: ${contentType || "unknown"}. Use PNG, JPEG, GIF, or WebP.`,
        });
      }

      const contentLength = response.headers.get("content-length");
      const size = contentLength ? Number.parseInt(contentLength, 10) : null;

      if (size && size > MAX_IMAGE_SIZE) {
        return NextResponse.json({
          valid: false,
          error: `Image too large (${Math.round(size / 1024 / 1024)}MB). Maximum size is 10MB.`,
        });
      }

      // Extract filename from URL path
      const pathSegments = parsedUrl.pathname.split("/");
      const filename = pathSegments.at(-1) || "image";

      return NextResponse.json({
        valid: true,
        filename: decodeURIComponent(filename),
        contentType,
        size,
      });
    } catch (fetchError) {
      clearTimeout(timeout);
      if (
        fetchError instanceof DOMException &&
        fetchError.name === "AbortError"
      ) {
        return NextResponse.json({
          valid: false,
          error: "Request timed out. The image URL may be unreachable.",
        });
      }
      return NextResponse.json({
        valid: false,
        error: "Failed to reach the image URL",
      });
    }
  } catch {
    return NextResponse.json(
      { valid: false, error: "Failed to validate image" },
      { status: 500 }
    );
  }
}
