import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { awsAccount } from "@wraps/db/schema/app";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getOrAssumeRole } from "@/lib/aws/credential-cache";
import { queryEmailEvents } from "@/lib/aws/dynamodb";
import { findWrapsArchive, getArchivedEmail } from "@/lib/aws/mailmanager";
import { getOrganizationWithMembership } from "@/lib/organization";

type RouteContext = {
  params: Promise<{
    orgSlug: string;
    emailId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { orgSlug, emailId } = await context.params;

    // Authenticate user
    const session = await auth.api.getSession({
      headers: await import("next/headers").then((mod) => mod.headers()),
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

    // Get all AWS accounts for this organization
    const accounts = await db.query.awsAccount.findMany({
      where: eq(awsAccount.organizationId, orgWithMembership.id),
    });

    if (accounts.length === 0) {
      return NextResponse.json(
        { error: "No AWS accounts found" },
        { status: 404 }
      );
    }

    // Search for the email across all accounts to get email metadata
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 90 * 24 * 60 * 60 * 1000);

    let emailMetadata: {
      from: string;
      to: string[];
      subject: string;
      sentAt: number;
      accountId: string;
    } | null = null;

    let awsAccountForEmail: (typeof accounts)[0] | null = null;

    // Find the email in DynamoDB to get metadata
    for (const account of accounts) {
      try {
        const events = await queryEmailEvents({
          awsAccountId: account.id,
          startTime,
          endTime,
          limit: 1000,
        });

        const emailEvents = events.filter((e) => e.messageId === emailId);
        if (emailEvents.length > 0) {
          const firstEvent = emailEvents[0];
          emailMetadata = {
            from: firstEvent.from,
            to: firstEvent.to,
            subject: firstEvent.subject,
            sentAt: firstEvent.sentAt,
            accountId: firstEvent.accountId,
          };
          awsAccountForEmail = account;
          break;
        }
      } catch (error) {
        console.error(
          `Failed to search for email in account ${account.id}:`,
          error
        );
        // Continue to next account
      }
    }

    if (!(emailMetadata && awsAccountForEmail)) {
      return NextResponse.json(
        { error: "Email metadata not found" },
        { status: 404 }
      );
    }

    // Get credentials for the AWS account
    const credentials = await getOrAssumeRole({
      roleArn: awsAccountForEmail.roleArn,
      externalId: awsAccountForEmail.externalId,
    });

    // Find the Wraps archive dynamically by querying AWS
    const archiveArn = await findWrapsArchive(
      awsAccountForEmail.region,
      credentials
    );

    if (!archiveArn) {
      return NextResponse.json(
        {
          error:
            "Email archiving is not enabled for this AWS account. Please enable archiving using the CLI: wraps upgrade",
        },
        { status: 400 }
      );
    }

    // Fetch the archived email
    const archivedEmail = await getArchivedEmail(
      archiveArn,
      {
        from: emailMetadata.from,
        to: emailMetadata.to[0], // Use first recipient
        subject: emailMetadata.subject,
        timestamp: new Date(emailMetadata.sentAt),
      },
      awsAccountForEmail.region,
      credentials
    );

    return NextResponse.json(archivedEmail);
  } catch (error) {
    console.error("Error fetching archived email:", error);

    // Handle specific error cases
    if (
      error instanceof Error &&
      error.message.includes("not found in archive")
    ) {
      return NextResponse.json(
        {
          error:
            "Email not found in archive. It may have been sent before archiving was enabled.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
