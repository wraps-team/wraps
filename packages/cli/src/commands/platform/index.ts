/**
 * Platform command - Show platform info and pricing
 * @module commands/platform
 */

import * as clack from "@clack/prompts";
import pc from "picocolors";

/**
 * Display platform information, pricing, and available commands
 */
export async function platform(): Promise<void> {
  clack.intro(pc.bold("Wraps Platform"));

  console.log();
  console.log(
    "  The Wraps Platform extends the free CLI with hosted features:"
  );
  console.log();
  console.log(`  ${pc.bold("Features:")}`);
  console.log(`    ${pc.green("✓")} Visual email template editor`);
  console.log(`    ${pc.green("✓")} Broadcast campaigns & scheduling`);
  console.log(`    ${pc.green("✓")} Contact management & segments`);
  console.log(`    ${pc.green("✓")} Workflow automations`);
  console.log(`    ${pc.green("✓")} Analytics dashboard`);
  console.log(`    ${pc.green("✓")} Team collaboration`);
  console.log();

  console.log(`  ${pc.bold("Pricing:")}`);
  console.log(`    ${pc.cyan("Starter")}      $10/mo   5,000 contacts`);
  console.log(`    ${pc.cyan("Growth")}       $25/mo   25,000 contacts`);
  console.log(`    ${pc.cyan("Scale")}        $50/mo   100,000 contacts`);
  console.log(`    ${pc.cyan("Enterprise")}   Custom   Unlimited contacts`);
  console.log();
  console.log(
    pc.dim("  + AWS costs at $0.10 per 1,000 emails (paid directly to AWS)")
  );
  console.log();

  console.log(
    `  ${pc.bold("Learn more:")} ${pc.cyan("https://wraps.dev/platform")}`
  );
  console.log();

  console.log(pc.dim("─────────────────────────────────────────────────────"));
  console.log();
  console.log(`  ${pc.bold("Platform Commands:")}`);
  console.log();
  console.log(
    `    ${pc.cyan("wraps platform connect")}      Connect infrastructure to Wraps Platform`
  );
  console.log(
    `    ${pc.cyan("wraps platform disconnect")}   Stop streaming events to Wraps Platform`
  );
  console.log(
    `    ${pc.cyan("wraps platform update-role")}  Update IAM permissions for dashboard`
  );
  console.log();
  console.log(
    pc.dim("  The connect command sets up event streaming and IAM permissions")
  );
  console.log(pc.dim("  in one step. Run it after deploying infrastructure."));
  console.log();
}
