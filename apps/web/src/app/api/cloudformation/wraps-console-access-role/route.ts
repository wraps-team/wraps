import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Read the CloudFormation template
    const templatePath = join(
      process.cwd(),
      "public",
      "cloudformation",
      "wraps-console-access-role.yaml"
    );
    let template = await readFile(templatePath, "utf-8");

    // Replace the placeholder AWS account ID with the actual backend account ID
    const backendAccountId =
      process.env.AWS_BACKEND_ACCOUNT_ID || "123456789012";

    // Replace the default placeholder with actual account ID
    template = template.replace(
      'Default: "123456789012"',
      `Default: "${backendAccountId}"`
    );

    // Return the template with proper YAML content type
    return new NextResponse(template, {
      headers: {
        "Content-Type": "text/yaml",
        // Allow CloudFormation to fetch this template
        "Access-Control-Allow-Origin": "*",
        // Cache for 1 hour
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Failed to serve CloudFormation template:", error);
    return NextResponse.json(
      {
        error: "Failed to load CloudFormation template",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
