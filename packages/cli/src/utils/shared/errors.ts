import * as clack from "@clack/prompts";
import pc from "picocolors";

/**
 * Custom error class for Wraps CLI errors
 */
export class WrapsError extends Error {
  constructor(
    message: string,
    public code: string,
    public suggestion?: string,
    public docsUrl?: string
  ) {
    super(message);
    this.name = "WrapsError";
  }
}

/**
 * Global error handler for CLI errors
 * Formats and displays errors with suggestions and docs
 */
export function handleCLIError(error: unknown): never {
  console.error(""); // Blank line

  if (error instanceof WrapsError) {
    clack.log.error(error.message);

    if (error.suggestion) {
      console.log(`\n${pc.yellow("Suggestion:")}`);
      console.log(`  ${pc.white(error.suggestion)}\n`);
    }

    if (error.docsUrl) {
      console.log(`${pc.dim("Documentation:")}`);
      console.log(`  ${pc.blue(error.docsUrl)}\n`);
    }

    process.exit(1);
  }

  // Unknown error
  clack.log.error("An unexpected error occurred");
  console.error(error);
  console.log(`\n${pc.dim("If this persists, please report at:")}`);
  console.log(`  ${pc.blue("https://github.com/wraps-team/wraps/issues")}\n`);
  process.exit(1);
}

/**
 * Common error factory functions
 */
export const errors = {
  noAWSCredentials: () =>
    new WrapsError(
      "AWS credentials not found",
      "NO_AWS_CREDENTIALS",
      "Run: aws configure\nOr set AWS_PROFILE environment variable",
      "https://wraps.dev/docs/setup/aws-credentials"
    ),

  stackExists: (stackName: string) =>
    new WrapsError(
      `Stack "${stackName}" already exists`,
      "STACK_EXISTS",
      `To update: wraps upgrade\nTo remove: wraps destroy --stack ${stackName}`,
      "https://wraps.dev/docs/cli/upgrade"
    ),

  invalidRegion: (region: string) =>
    new WrapsError(
      `Invalid AWS region: ${region}`,
      "INVALID_REGION",
      "Use a valid AWS region like: us-east-1, eu-west-1, ap-southeast-1",
      "https://docs.aws.amazon.com/general/latest/gr/rande.html"
    ),

  pulumiError: (message: string) =>
    new WrapsError(
      `Infrastructure deployment failed: ${message}`,
      "PULUMI_ERROR",
      "Check your AWS permissions and try again",
      "https://wraps.dev/docs/troubleshooting"
    ),

  noStack: () =>
    new WrapsError(
      "No Wraps infrastructure found in this AWS account",
      "NO_STACK",
      "Run: wraps email init\nTo deploy new infrastructure",
      "https://wraps.dev/docs/cli/init"
    ),

  pulumiNotInstalled: () =>
    new WrapsError(
      "Pulumi CLI is not installed",
      "PULUMI_NOT_INSTALLED",
      "Install Pulumi:\n  macOS: brew install pulumi/tap/pulumi\n  Linux: curl -fsSL https://get.pulumi.com | sh\n  Windows: choco install pulumi\n\nOr download from: https://www.pulumi.com/docs/install/",
      "https://www.pulumi.com/docs/install/"
    ),
};
