/**
 * Seed Demo Batch Sends
 *
 * Creates realistic demo data for the Broadcasts table view.
 *
 * Usage:
 *   pnpm --filter @wraps/db seed:demo
 *
 * Or with specific org/account:
 *   ORG_ID=xxx AWS_ACCOUNT_ID=yyy pnpm --filter @wraps/db seed:demo
 */

import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../src/schema";

// Load env from apps/web/.env.local (same as drizzle.config.ts)
// Won't override if DATABASE_URL already set via command line
dotenv.config({ path: "../../apps/web/.env.local" });
dotenv.config({ path: "../../.env" }); // Fallback to root .env

if (!process.env.DATABASE_URL) {
  console.error(`
DATABASE_URL not found. Either:
  1. Create apps/web/.env.local with DATABASE_URL
  2. Or run with: DATABASE_URL="..." pnpm --filter @wraps/db seed:demo
`);
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql, { schema });

// Demo broadcast data
const demoBatches = [
  // Completed broadcasts with good stats
  {
    name: "December Newsletter",
    subject: "Your December Updates Are Here",
    status: "completed" as const,
    totalRecipients: 12500,
    processedRecipients: 12500,
    sent: 12450,
    delivered: 12380,
    failed: 50,
    opened: 4952,
    clicked: 1238,
    bounced: 45,
    complained: 5,
    daysAgo: 2,
  },
  {
    name: "Black Friday Sale",
    subject: "40% Off Everything - Today Only!",
    status: "completed" as const,
    totalRecipients: 15000,
    processedRecipients: 15000,
    sent: 14920,
    delivered: 14850,
    failed: 80,
    opened: 8910,
    clicked: 3712,
    bounced: 55,
    complained: 15,
    daysAgo: 5,
  },
  {
    name: "Product Launch Announcement",
    subject: "Introducing Our New Feature",
    status: "completed" as const,
    totalRecipients: 8500,
    processedRecipients: 8500,
    sent: 8480,
    delivered: 8420,
    failed: 20,
    opened: 4210,
    clicked: 1684,
    bounced: 40,
    complained: 3,
    daysAgo: 8,
  },
  // Scheduled broadcast (future)
  {
    name: "New Year Campaign",
    subject: "Happy New Year from Our Team!",
    status: "scheduled" as const,
    totalRecipients: 14200,
    processedRecipients: 0,
    sent: 0,
    delivered: 0,
    failed: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
    scheduledDaysFromNow: 2,
    daysAgo: 0,
  },
  {
    name: "January Newsletter",
    subject: "What's New in January",
    status: "scheduled" as const,
    totalRecipients: 12800,
    processedRecipients: 0,
    sent: 0,
    delivered: 0,
    failed: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
    scheduledDaysFromNow: 5,
    daysAgo: 0,
  },
  // Currently processing
  {
    name: "Weekly Digest",
    subject: "Your Weekly Roundup",
    status: "processing" as const,
    totalRecipients: 9800,
    processedRecipients: 6540,
    sent: 6520,
    delivered: 6480,
    failed: 20,
    opened: 0,
    clicked: 0,
    bounced: 12,
    complained: 0,
    daysAgo: 0,
  },
  // Queued
  {
    name: "Feature Update",
    subject: "New Features Just for You",
    status: "queued" as const,
    totalRecipients: 11000,
    processedRecipients: 0,
    sent: 0,
    delivered: 0,
    failed: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
    daysAgo: 0,
  },
  // Older completed broadcasts
  {
    name: "Welcome Series - Batch 1",
    subject: "Welcome to Our Platform!",
    status: "completed" as const,
    totalRecipients: 3200,
    processedRecipients: 3200,
    sent: 3195,
    delivered: 3180,
    failed: 5,
    opened: 2226,
    clicked: 954,
    bounced: 10,
    complained: 1,
    daysAgo: 12,
  },
  {
    name: "Thanksgiving Promotion",
    subject: "Thankful for You - Special Offer Inside",
    status: "completed" as const,
    totalRecipients: 14800,
    processedRecipients: 14800,
    sent: 14750,
    delivered: 14680,
    failed: 50,
    opened: 5872,
    clicked: 2202,
    bounced: 48,
    complained: 12,
    daysAgo: 15,
  },
  // Failed broadcast
  {
    name: "Test Campaign",
    subject: "Testing Email Delivery",
    status: "failed" as const,
    totalRecipients: 500,
    processedRecipients: 125,
    sent: 120,
    delivered: 118,
    failed: 5,
    opened: 0,
    clicked: 0,
    bounced: 2,
    complained: 0,
    errorMessage: "Sending quota exceeded. Please try again later.",
    daysAgo: 3,
  },
];

async function main() {
  console.log("Seeding demo batch sends...\n");

  // Get organization and AWS account
  let organizationId = process.env.ORG_ID;
  let awsAccountId = process.env.AWS_ACCOUNT_ID;

  if (!organizationId) {
    // Find first organization
    const org = await db.query.organization.findFirst();
    if (!org) {
      console.error("No organization found. Create one first.");
      process.exit(1);
    }
    organizationId = org.id;
    console.log(`Using organization: ${org.name} (${org.id})`);
  }

  if (!awsAccountId) {
    // Find first AWS account for this org
    const account = await db.query.awsAccount.findFirst({
      where: eq(schema.awsAccount.organizationId, organizationId),
    });
    if (!account) {
      console.error("No AWS account found for this organization.");
      process.exit(1);
    }
    awsAccountId = account.id;
    console.log(`Using AWS account: ${account.name} (${account.id})`);
  }

  // Get a user for createdBy
  const member = await db.query.member.findFirst({
    where: eq(schema.member.organizationId, organizationId),
  });

  console.log("\nInserting demo batches...\n");

  for (const batch of demoBatches) {
    const now = new Date();
    const createdAt = new Date(now.getTime() - batch.daysAgo * 24 * 60 * 60 * 1000);

    let scheduledFor: Date | undefined;
    if (batch.status === "scheduled" && batch.scheduledDaysFromNow) {
      scheduledFor = new Date(now.getTime() + batch.scheduledDaysFromNow * 24 * 60 * 60 * 1000);
      // Set to 9am
      scheduledFor.setHours(9, 0, 0, 0);
    }

    let startedAt: Date | undefined;
    let completedAt: Date | undefined;

    if (batch.status === "completed") {
      startedAt = new Date(createdAt.getTime() + 5 * 60 * 1000); // 5 min after created
      completedAt = new Date(startedAt.getTime() + 30 * 60 * 1000); // 30 min to complete
    } else if (batch.status === "processing") {
      startedAt = new Date(now.getTime() - 10 * 60 * 1000); // Started 10 min ago
    } else if (batch.status === "failed") {
      startedAt = new Date(createdAt.getTime() + 5 * 60 * 1000);
    }

    const [inserted] = await db
      .insert(schema.batchSend)
      .values({
        organizationId,
        awsAccountId,
        channel: "email",
        name: batch.name,
        subject: batch.subject,
        from: "hello@demo.wraps.dev",
        fromName: "Wraps Demo",
        status: batch.status,
        totalRecipients: batch.totalRecipients,
        processedRecipients: batch.processedRecipients,
        sent: batch.sent,
        delivered: batch.delivered,
        failed: batch.failed,
        opened: batch.opened,
        clicked: batch.clicked,
        bounced: batch.bounced,
        complained: batch.complained,
        errorMessage: batch.errorMessage,
        scheduledFor,
        startedAt,
        completedAt,
        createdBy: member?.userId,
        createdAt,
        updatedAt: now,
      })
      .returning({ id: schema.batchSend.id });

    const statusIcon = {
      completed: "✓",
      processing: "⏳",
      queued: "⏸",
      scheduled: "📅",
      failed: "✗",
      draft: "📝",
      cancelled: "🚫",
    }[batch.status];

    console.log(`  ${statusIcon} ${batch.name} (${batch.status})`);
  }

  console.log(`\n✅ Created ${demoBatches.length} demo batches!\n`);
  console.log("View them at: http://localhost:3000/<org-slug>/send");
}

main().catch(console.error);
