import * as clack from "@clack/prompts";
import * as pulumi from "@pulumi/pulumi";
import getPort from "get-port";
import open from "open";
import pc from "picocolors";
import { startConsoleServer } from "../../console/server.js";
import type { DashboardOptions } from "../../types/index.js";
import {
  getAWSRegion,
  validateAWSCredentials,
} from "../../utils/shared/aws.js";
import {
  ensurePulumiWorkDir,
  getPulumiWorkDir,
} from "../../utils/shared/fs.js";
import { DeploymentProgress } from "../../utils/shared/output.js";

/**
 * Dashboard command - Start local web dashboard
 */
export async function dashboard(options: DashboardOptions): Promise<void> {
  clack.intro(pc.bold("Wraps Dashboard"));

  const progress = new DeploymentProgress();

  // 1. Validate AWS credentials
  const identity = await progress.execute(
    "Validating AWS credentials",
    async () => validateAWSCredentials()
  );

  // 2. Get region
  const region = await getAWSRegion();

  // 3. Load stack outputs to get IAM role ARN
  let stackOutputs: any = {};
  try {
    // Ensure Pulumi workspace is configured (sets backend URL)
    await ensurePulumiWorkDir();

    const stack = await pulumi.automation.LocalWorkspace.selectStack({
      stackName: `wraps-${identity.accountId}-${region}`,
      workDir: getPulumiWorkDir(),
    });

    stackOutputs = await stack.outputs();
  } catch (_error: unknown) {
    progress.stop();
    clack.log.error("No Wraps infrastructure found");
    console.log(
      `\\nRun ${pc.cyan("wraps email init")} to deploy infrastructure first.\\n`
    );
    process.exit(1);
  }

  // Extract outputs from stack (optional - console uses current AWS credentials)
  const tableName = stackOutputs.tableName?.value;
  const archiveArn = stackOutputs.archiveArn?.value;
  const archivingEnabled = stackOutputs.archivingEnabled?.value ?? false;

  // 4. Find available port
  const port =
    options.port || (await getPort({ port: [5555, 5556, 5557, 5558, 5559] }));

  // 5. Start server
  progress.stop();
  clack.log.success("Starting dashboard server...");
  console.log(
    `${pc.dim("Using current AWS credentials (no role assumption)")}\\n`
  );

  const { url } = await startConsoleServer({
    port,
    roleArn: undefined, // Use current credentials instead of assuming role
    region,
    tableName,
    accountId: identity.accountId,
    noOpen: options.noOpen ?? false,
    archiveArn,
    archivingEnabled,
  });

  console.log(`\\n${pc.bold("Dashboard:")} ${pc.cyan(url)}`);
  console.log(`${pc.dim("Press Ctrl+C to stop")}\\n`);

  // 6. Open browser (unless --no-open)
  if (!options.noOpen) {
    await open(url);
  }

  // Keep process alive
  await new Promise(() => {});
}
