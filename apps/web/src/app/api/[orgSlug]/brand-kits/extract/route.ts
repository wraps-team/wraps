import { auth } from "@wraps/auth";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { extractBrandKitFromDomain } from "@/lib/brand-kit/extractor";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
  }>;
};

// POST /api/[orgSlug]/brand-kits/extract - Extract brand kit from domain
export async function POST(request: Request, context: RouteContext) {
  try {
    const { orgSlug } = await context.params;

    // Authenticate user
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify organization membership
    const orgWithMembership = await getOrganizationWithMembership(
      orgSlug,
      session.user.id
    );

    if (!orgWithMembership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { domain } = body;

    if (!domain || typeof domain !== "string") {
      return NextResponse.json(
        { error: "Domain is required" },
        { status: 400 }
      );
    }

    // Validate domain format
    const domainRegex =
      /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    const cleanDomain = domain.replace(/^https?:\/\//, "").split("/")[0];

    if (!domainRegex.test(cleanDomain)) {
      return NextResponse.json(
        { error: "Invalid domain format" },
        { status: 400 }
      );
    }

    // Extract brand kit from domain
    const extractedBrandKit = await extractBrandKitFromDomain(cleanDomain);

    return NextResponse.json({
      success: true,
      brandKit: {
        name: extractedBrandKit.companyName || `Brand from ${cleanDomain}`,
        logoUrl: extractedBrandKit.logoUrl,
        primaryColor: extractedBrandKit.primaryColor,
        secondaryColor: extractedBrandKit.secondaryColor,
        backgroundColor: extractedBrandKit.backgroundColor,
        textColor: extractedBrandKit.textColor,
        fontFamily: extractedBrandKit.fontFamily,
        companyName: extractedBrandKit.companyName,
        sourceDomain: extractedBrandKit.sourceDomain,
        autoExtracted: true,
      },
    });
  } catch (error) {
    console.error("Error extracting brand kit:", error);
    return NextResponse.json(
      { error: "Failed to extract brand kit from domain" },
      { status: 500 }
    );
  }
}
