import { del, put } from "@vercel/blob";
import { auth } from "@wraps/auth";
import { NextResponse } from "next/server";
import { getOrganizationWithMembership } from "@/lib/organization";

export const runtime = "edge";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

/**
 * Securely check if a URL is from Vercel Blob storage
 * Uses proper URL parsing to prevent bypass attacks like:
 * - https://evil.com/vercel-storage.com
 * - https://vercel-storage.com.evil.com
 */
function isVercelBlobUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith(".vercel-storage.com");
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    // 1. Authenticate user
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const orgSlug = formData.get("orgSlug") as string | null;
    const oldLogoUrl = formData.get("oldLogoUrl") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!orgSlug) {
      return NextResponse.json(
        { error: "Organization slug required" },
        { status: 400 }
      );
    }

    // 3. Verify organization membership and permissions
    const orgWithMembership = await getOrganizationWithMembership(
      orgSlug,
      session.user.id
    );

    if (!orgWithMembership) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    if (!["owner", "admin"].includes(orgWithMembership.userRole)) {
      return NextResponse.json(
        { error: "Only owners and admins can update organization logos" },
        { status: 403 }
      );
    }

    // 4. Validate file
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Only PNG, JPEG, and WebP are allowed" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 5MB" },
        { status: 400 }
      );
    }

    // 5. Upload to Vercel Blob
    const blob = await put(
      `organization-logos/${orgWithMembership.id}/${Date.now()}-${file.name}`,
      file,
      {
        access: "public",
        addRandomSuffix: true,
      }
    );

    // 6. Delete old logo if it exists and is from Vercel Blob
    if (oldLogoUrl && isVercelBlobUrl(oldLogoUrl)) {
      try {
        await del(oldLogoUrl);
      } catch (error) {
        // Non-critical error - log but don't fail the request
        console.error("Failed to delete old logo:", error);
      }
    }

    return NextResponse.json({
      url: blob.url,
      success: true,
    });
  } catch (error) {
    console.error("Error uploading organization logo:", error);
    return NextResponse.json(
      { error: "Failed to upload image" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    // 1. Authenticate user
    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Get URL from request
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    const orgSlug = searchParams.get("orgSlug");

    if (!url) {
      return NextResponse.json({ error: "No URL provided" }, { status: 400 });
    }

    if (!orgSlug) {
      return NextResponse.json(
        { error: "Organization slug required" },
        { status: 400 }
      );
    }

    // 3. Verify organization membership and permissions
    const orgWithMembership = await getOrganizationWithMembership(
      orgSlug,
      session.user.id
    );

    if (!orgWithMembership) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    if (!["owner", "admin"].includes(orgWithMembership.userRole)) {
      return NextResponse.json(
        { error: "Only owners and admins can delete organization logos" },
        { status: 403 }
      );
    }

    // 4. Only delete if it's a Vercel Blob URL
    if (!isVercelBlobUrl(url)) {
      return NextResponse.json(
        { error: "Can only delete Vercel Blob URLs" },
        { status: 400 }
      );
    }

    // 5. Delete from Vercel Blob
    await del(url);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting organization logo:", error);
    return NextResponse.json(
      { error: "Failed to delete image" },
      { status: 500 }
    );
  }
}
