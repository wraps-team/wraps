import * as clack from "@clack/prompts";

import pc from "picocolors";
import { trackError } from "../../telemetry/events.js";
import { isJsonMode, jsonError } from "./json-output.js";

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
 * Check if an error is an AWS SDK error
 */
export function isAWSError(
  error: unknown
): error is Error & { name: string; $metadata?: { httpStatusCode?: number } } {
  if (!(error instanceof Error)) {
    return false;
  }
  const awsErrorNames = [
    "ExpiredTokenException",
    "InvalidClientTokenId",
    "AccessDenied",
    "AccessDeniedException",
    "UnauthorizedAccess",
    "InvalidAccessKeyId",
    "SignatureDoesNotMatch",
    "UnrecognizedClientException",
    "CredentialsError",
    "TokenRefreshRequired",
    "SSOTokenExpired",
  ];
  return awsErrorNames.includes(error.name) || "$metadata" in error;
}

/**
 * Check if a DNS resolution error indicates a genuinely missing record
 * vs a network/DNS issue that should be surfaced to the user.
 *
 * Returns 'missing' for ENOTFOUND/ENODATA (record doesn't exist),
 * 'network' for ETIMEOUT/ESERVFAIL (DNS infrastructure issue),
 * or 'unknown' for other errors that should be re-thrown.
 */
export function classifyDNSError(
  error: unknown
): "missing" | "network" | "unknown" {
  if (!(error instanceof Error)) {
    return "unknown";
  }
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOTFOUND" || code === "ENODATA") {
    return "missing";
  }
  if (code === "ETIMEOUT" || code === "ESERVFAIL" || code === "ECONNREFUSED") {
    return "network";
  }
  return "unknown";
}

/**
 * Check if an error is an AWS SDK "not found" type error.
 * Does not gate on isAWSError() because these specific error names
 * are unambiguous — if the name matches, it's a not-found error.
 */
export function isAWSNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const awsError = error as Error & {
    $metadata?: { httpStatusCode?: number };
  };
  return (
    error.name === "NotFoundException" ||
    error.name === "NoSuchEntityException" ||
    error.name === "NoSuchEntity" ||
    error.name === "ResourceNotFoundException" ||
    awsError.$metadata?.httpStatusCode === 404
  );
}

/**
 * Check if an error is a Pulumi deployment error
 */
export function isPulumiError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message?.includes("pulumi") ||
    error.message?.includes("Pulumi") ||
    error.message?.includes("resource") ||
    error.message?.includes("creating") ||
    error.message?.includes("AccessDenied")
  );
}

/**
 * Parse AWS SDK error to extract code and action
 */
export function parseAWSError(error: Error): {
  code: string;
  action?: string;
  resource?: string;
} {
  const errorName = error.name || "UnknownError";

  // Extract action from error message if possible
  const actionMatch = error.message?.match(/when calling the (\w+) operation/i);
  const action = actionMatch?.[1];

  // Extract resource from error message if possible
  const resourceMatch = error.message?.match(/resource[:\s]+([^\s,]+)/i);
  const resource = resourceMatch?.[1];

  return { code: errorName, action, resource };
}

/**
 * Parse Pulumi error to extract IAM action that failed
 */
export function parsePulumiError(error: Error): {
  code: string;
  iamAction?: string;
  service?: string;
  resourceName?: string;
  resourceType?: string;
} {
  const message = error.message || "";

  // Check for AccessDenied patterns
  if (message.includes("AccessDenied") || message.includes("access denied")) {
    // Try to extract the AWS action
    const actionMatch = message.match(
      /(?:action|operation)[:\s]+["']?(\w+:\w+)["']?/i
    );
    if (actionMatch) {
      const [service] = actionMatch[1].split(":");
      return {
        code: "IAM_PERMISSION_DENIED",
        iamAction: actionMatch[1],
        service,
      };
    }

    // Try to extract service from resource patterns
    if (message.includes("ses:") || message.includes("SES")) {
      return { code: "SES_PERMISSION_DENIED", service: "ses" };
    }
    if (message.includes("dynamodb:") || message.includes("DynamoDB")) {
      return { code: "DYNAMODB_PERMISSION_DENIED", service: "dynamodb" };
    }
    if (message.includes("lambda:") || message.includes("Lambda")) {
      return { code: "LAMBDA_PERMISSION_DENIED", service: "lambda" };
    }
    if (message.includes("events:") || message.includes("EventBridge")) {
      return { code: "EVENTBRIDGE_PERMISSION_DENIED", service: "events" };
    }
    if (message.includes("sqs:") || message.includes("SQS")) {
      return { code: "SQS_PERMISSION_DENIED", service: "sqs" };
    }
    if (message.includes("iam:") || message.includes("IAM")) {
      return { code: "IAM_PERMISSION_DENIED", service: "iam" };
    }

    return { code: "IAM_PERMISSION_DENIED" };
  }

  // Check for resource conflict (already exists)
  if (
    message.includes("AlreadyExists") ||
    message.includes("already exists") ||
    message.includes("already exist") ||
    message.includes("ResourceConflictException") ||
    message.includes("ResourceInUse") ||
    message.includes("EntityAlreadyExists")
  ) {
    // Extract resource name from "error creating 'name'" pattern
    const nameMatch = message.match(/error creating '([^']+)'/);
    // Extract resource type from "(aws:service/type:Type)" pattern
    const typeMatch = message.match(/\((aws:[^)]+)\)/);

    return {
      code: "RESOURCE_CONFLICT",
      resourceName: nameMatch?.[1],
      resourceType: typeMatch?.[1],
    };
  }

  // Check for stack locked
  if (message.includes("stack is currently locked")) {
    return { code: "STACK_LOCKED" };
  }

  // Pulumi binary missing from PATH (e.g. "spawn pulumi ENOENT") — match the
  // ENOENT to the pulumi binary itself so a different missing binary during a
  // Pulumi operation isn't misreported as "Pulumi CLI is not installed".
  if (/ENOENT[:\s].*\bpulumi\b|spawn pulumi ENOENT/.test(message)) {
    return { code: "NOT_INSTALLED" };
  }

  return { code: "PULUMI_ERROR" };
}

/**
 * Strip sensitive values (account IDs, emails, non-AWS domains, ARN account
 * portions) from a string. Used as the redaction layer for both error
 * messages displayed to users and free-form output (e.g. Pulumi deploy logs)
 * that may end up in bug reports.
 *
 * Does NOT truncate — callers that need length limits should apply them
 * after redaction. Splitting redaction from truncation lets the multi-line
 * Pulumi tail dump in `email connect` redact a 60-line block without losing
 * 90% of it to a 500-char cutoff.
 */
export function redactSensitiveValues(input: string): string {
  let message = input;

  // Remove AWS account IDs (12 digits)
  message = message.replace(/\b\d{12}\b/g, "[ACCOUNT_ID]");

  // Remove email addresses
  message = message.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "[EMAIL]"
  );

  // Remove domain names (but keep AWS service domains)
  message = message.replace(
    /(?<!\.amazonaws\.com|\.aws\.amazon\.com)\b[a-zA-Z0-9][a-zA-Z0-9-]+\.[a-zA-Z]{2,}\b/g,
    (match) => {
      // Keep AWS domains
      if (match.includes("amazonaws") || match.includes("aws.amazon")) {
        return match;
      }
      return "[DOMAIN]";
    }
  );

  // Remove ARNs (replace account ID portion)
  message = message.replace(
    /arn:aws:[^:]+:[^:]*:\d{12}:/g,
    "arn:aws:[SERVICE]:[REGION]:[ACCOUNT_ID]:"
  );

  return message;
}

/**
 * Sanitize an error for display: strip sensitive values and truncate.
 * Returns "Unknown error" for null/undefined input so the result is always
 * a non-empty user-facing string.
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (!error) {
    return "Unknown error";
  }

  const raw = error instanceof Error ? error.message : String(error);
  const redacted = redactSensitiveValues(raw);

  // Truncate very long messages so a wall-of-text error doesn't break
  // the CLI's formatted output.
  if (redacted.length > 500) {
    return `${redacted.slice(0, 500)}...`;
  }
  return redacted;
}

/**
 * Extract the meaningful error lines from Pulumi's verbose command output.
 *
 * Pulumi's CommandResult.toString() dumps code + full stdout + stderr which
 * can be hundreds of lines. This finds the lines that actually describe the
 * failure so the user sees a useful message rather than a truncated wall of
 * resource-update noise.
 */
export function extractPulumiErrorSummary(pulumiOutput: string): string {
  const lines = pulumiOutput.split("\n");

  // Collect lines that look like actual errors (not deprecation warnings)
  const errorLines: string[] = [];
  let inErrorBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // "error: one or more errors occurred:" signals the start of the error block
    if (
      trimmed.match(/^error:\s+\d+ error/i) ||
      trimmed.match(/^error: one or more/i)
    ) {
      inErrorBlock = true;
    }

    if (inErrorBlock) {
      // Stop at the trailing metadata lines
      if (
        trimmed.startsWith("err?:") ||
        trimmed.startsWith("code:") ||
        trimmed.startsWith("stdout:")
      ) {
        break;
      }
      if (trimmed) {
        errorLines.push(trimmed);
      }
      continue;
    }

    // Pick up individual "Failed to …" or "error:" lines outside the block
    if (
      (trimmed.startsWith("error:") &&
        !trimmed.includes("verification warning") &&
        !trimmed.includes("is deprecated")) ||
      trimmed.startsWith("Error:") ||
      trimmed.startsWith("Failed to ") ||
      trimmed.startsWith("panic:")
    ) {
      errorLines.push(trimmed);
    }
  }

  if (errorLines.length > 0) {
    const summary = errorLines.slice(0, 15).join("\n");
    return redactSensitiveValues(summary);
  }

  // Fallback: redact + truncate (more generous than before)
  const redacted = redactSensitiveValues(pulumiOutput);
  if (redacted.length > 1500) {
    return `${redacted.slice(0, 1500)}...`;
  }
  return redacted;
}

/**
 * Global error handler for CLI errors
 * Formats and displays errors with suggestions and docs
 * Tracks ALL errors to telemetry (with sanitized context)
 *
 * @param error - The error to handle
 * @param command - Optional command name for telemetry context
 */
export function handleCLIError(error: unknown, command?: string): void {
  const cmdContext = command || "unknown";
  // Agent commands (e.g. "email:agent") opt into the agent-enforcement
  // resource-not-found mappings; every other command falls back to the generic
  // AWS error so it isn't told to "run wraps email agent create".
  const isAgentContext = cmdContext.includes("agent");

  // In JSON mode, convert any error to a JSON envelope and exit
  if (isJsonMode()) {
    let code = "UNKNOWN_ERROR";
    let message = "An unexpected error occurred";
    let suggestion: string | undefined;
    let docsUrl: string | undefined;

    if (error instanceof WrapsError) {
      trackError(error.code, cmdContext);
      code = error.code;
      message = error.message;
      suggestion = error.suggestion;
      docsUrl = error.docsUrl;
    } else if (isAWSError(error)) {
      const parsed = parseAWSError(error);
      code = `AWS_${parsed.code}`;
      trackError(code, cmdContext, { action: parsed.action });
      // Map to user-friendly WrapsError for message/suggestion
      const wrapsErr = awsErrorToWrapsError(
        parsed.code,
        parsed.action,
        error,
        isAgentContext
      );
      message = wrapsErr.message;
      suggestion = wrapsErr.suggestion;
      docsUrl = wrapsErr.docsUrl;
    } else if (isPulumiError(error)) {
      const parsed = parsePulumiError(error as Error);
      code = `PULUMI_${parsed.code}`;
      trackError(code, cmdContext, {
        iamAction: parsed.iamAction,
        service: parsed.service,
        errorType: (error as Error)?.constructor?.name,
      });
      const wrapsErr = pulumiErrorToWrapsError(
        parsed.code,
        parsed.iamAction,
        parsed.service,
        parsed.resourceName,
        parsed.resourceType,
        (error as Error)?.message
      );
      message = wrapsErr.message;
      suggestion = wrapsErr.suggestion;
      docsUrl = wrapsErr.docsUrl;
    } else {
      // Error type only, never the message: `trackError` spreads this
      // metadata straight onto the wire, and a raw message carries home
      // directory paths, project names, and credential material.
      trackError("UNHANDLED_ERROR", cmdContext, {
        errorType:
          error instanceof Error ? error.constructor.name : typeof error,
      });
      message =
        error instanceof Error ? error.message : String(error || message);
    }

    jsonError(cmdContext, { code, message, suggestion, docsUrl });
    // `process.exitCode`, not `process.exit`, so cli.ts's finally block still
    // flushes telemetry. The `return` is load-bearing: without it execution
    // falls out of this block into the human chain and prints the error twice.
    process.exitCode = 1;
    return;
  }

  console.error(""); // Blank line

  if (error instanceof WrapsError) {
    // Track error (code only, never message)
    trackError(error.code, cmdContext);

    clack.log.error(error.message);

    if (error.suggestion) {
      console.log(`\n${pc.yellow("Suggestion:")}`);
      // Format suggestion with proper indentation for multi-line
      const lines = error.suggestion.split("\n");
      for (const line of lines) {
        console.log(`  ${pc.white(line)}`);
      }
      console.log();
    }

    if (error.docsUrl) {
      console.log(`${pc.dim("Documentation:")}`);
      console.log(`  ${pc.blue(error.docsUrl)}\n`);
    }

    // `process.exitCode`, not `process.exit`, so cli.ts's finally block still
    // flushes telemetry.
    process.exitCode = 1;
    return;
  }

  // Check for AWS SDK errors
  if (isAWSError(error)) {
    const { code, action } = parseAWSError(error);
    trackError(`AWS_${code}`, cmdContext, { action });

    const wrapsError = awsErrorToWrapsError(
      code,
      action,
      error,
      isAgentContext
    );

    clack.log.error(wrapsError.message);
    if (wrapsError.suggestion) {
      console.log(`\n${pc.yellow("Suggestion:")}`);
      const lines = wrapsError.suggestion.split("\n");
      for (const line of lines) {
        console.log(`  ${pc.white(line)}`);
      }
      console.log();
    }
    if (wrapsError.docsUrl) {
      console.log(`${pc.dim("Documentation:")}`);
      console.log(`  ${pc.blue(wrapsError.docsUrl)}\n`);
    }
    process.exitCode = 1;
    return;
  }

  // Check for Pulumi errors
  if (isPulumiError(error)) {
    const { code, iamAction, service, resourceName, resourceType } =
      parsePulumiError(error as Error);
    trackError(`PULUMI_${code}`, cmdContext, {
      iamAction,
      service,
      errorType: (error as Error)?.constructor?.name,
    });

    const wrapsError = pulumiErrorToWrapsError(
      code,
      iamAction,
      service,
      resourceName,
      resourceType,
      (error as Error)?.message
    );

    clack.log.error(wrapsError.message);
    if (wrapsError.suggestion) {
      console.log(`\n${pc.yellow("Suggestion:")}`);
      const lines = wrapsError.suggestion.split("\n");
      for (const line of lines) {
        console.log(`  ${pc.white(line)}`);
      }
      console.log();
    }
    if (wrapsError.docsUrl) {
      console.log(`${pc.dim("Documentation:")}`);
      console.log(`  ${pc.blue(wrapsError.docsUrl)}\n`);
    }
    process.exitCode = 1;
    return;
  }

  // Unknown error - track the error type only, never the message. The message
  // is shown locally below; sending it would put home directory paths, project
  // names, and credential material into the `error:occurred` event.
  trackError("UNHANDLED_ERROR", cmdContext, {
    errorType: error instanceof Error ? error.constructor.name : typeof error,
  });

  clack.log.error("An unexpected error occurred");
  if (error instanceof Error) {
    console.error(pc.dim(error.message));
  } else if (typeof error === "string") {
    console.error(error);
  }
  console.log(`\n${pc.dim("If this persists, please report at:")}`);
  console.log(`  ${pc.blue("https://github.com/wraps-team/wraps/issues")}\n`);
  process.exitCode = 1;
}

/**
 * Convert AWS error code to a user-friendly WrapsError.
 * Extracted to share between JSON and human-readable paths.
 *
 * The default branch must NEVER lie about credentials — if the request reached
 * AWS far enough to throw a named exception, credentials are valid. Surface the
 * real error name and message so users can self-diagnose.
 */
export function awsErrorToWrapsError(
  code: string,
  action?: string,
  originalError?: unknown,
  isAgentContext = false
): WrapsError {
  // AWS SDK v3 sometimes returns name:"Error" with the real error code only in
  // the message (e.g. IAM GetRole throws name:"Error", message:"NoSuchEntity…").
  // Check BOTH the exception name (from `code`) and the raw message before the
  // name-based switch, so these don't fall through to the generic default and
  // get mislabeled. Agent create touches IAM (console-role invoke attach),
  // Lambda (enforcer), and DynamoDB (policy table).
  const originalName = originalError instanceof Error ? originalError.name : "";
  const originalMessage =
    originalError instanceof Error ? originalError.message : "";
  const mentions = (needle: string): boolean =>
    code === needle ||
    originalName === needle ||
    originalMessage.includes(needle);

  // These agent-enforcement not-found mappings (console-access IAM entity,
  // enforcer Lambda, policy table) only make sense for agent commands. Gating on
  // isAgentContext keeps a bare NoSuchEntity/ResourceNotFoundException from an
  // unrelated command from being mislabeled with "run wraps email agent create"
  // guidance — those fall through to the generic default (awsUnknownError).
  if (
    isAgentContext &&
    (mentions("NoSuchEntity") || mentions("NoSuchEntityException"))
  ) {
    return errors.iamEntityNotFound();
  }
  // Both Lambda and DynamoDB throw ResourceNotFoundException. Discriminate on
  // the Lambda signal, which is reliable: Lambda's message is
  // "Function not found: <arn>" (and the ARN contains ":function:"). DynamoDB's
  // data-plane message is just "Requested resource not found" — it carries no
  // "table"/"dynamodb" token, so the old free-text match mislabeled a missing
  // policy table as a missing enforcer Lambda. Default to the policy table
  // (COR-13).
  if (isAgentContext && mentions("ResourceNotFoundException")) {
    if (/function not found|:function:/i.test(originalMessage)) {
      return errors.lambdaFunctionNotFound();
    }
    return errors.dynamoTableNotFound();
  }

  switch (code) {
    // Credential / token errors — these mean the request never reached the API
    case "ExpiredTokenException":
    case "TokenRefreshRequired":
    case "SSOTokenExpired":
      return errors.sessionTokenExpired();
    case "InvalidClientTokenId":
    case "InvalidAccessKeyId":
    case "SignatureDoesNotMatch":
    case "UnrecognizedClientException":
      return errors.accessKeyInvalid();

    // IAM permission errors — request reached AWS but was denied
    case "AccessDenied":
    case "AccessDeniedException":
    case "UnauthorizedAccess":
      return errors.iamPermissionDenied(
        action || "unknown",
        "AWS resource",
        "Ensure your IAM user/role has the required permissions."
      );

    // SES SendEmail errors — request reached SES but was rejected
    case "MessageRejected":
      return errors.sesMessageRejected(sanitizeErrorMessage(originalError));
    case "MailFromDomainNotVerifiedException":
      return errors.sesMailFromNotVerified(sanitizeErrorMessage(originalError));
    case "AccountSendingPausedException":
      return errors.sesAccountSendingPaused();
    case "ConfigurationSetSendingPausedException":
      return errors.sesConfigSetSendingPaused();
    case "ConfigurationSetDoesNotExistException":
      return errors.sesConfigSetMissing(sanitizeErrorMessage(originalError));

    // Throughput / quota errors
    case "Throttling":
    case "ThrottlingException":
    case "TooManyRequestsException":
      return errors.awsThrottled(action);
    case "LimitExceededException":
    case "ServiceQuotaExceededException":
      return errors.awsLimitExceeded(
        action,
        sanitizeErrorMessage(originalError)
      );

    // Anything else — surface the real error instead of lying about credentials
    default:
      return errors.awsUnknownError(
        code,
        action,
        sanitizeErrorMessage(originalError)
      );
  }
}

/**
 * Convert Pulumi error code to a user-friendly WrapsError.
 * Extracted to share between JSON and human-readable paths.
 */
function pulumiErrorToWrapsError(
  code: string,
  iamAction?: string,
  service?: string,
  resourceName?: string,
  resourceType?: string,
  originalMessage?: string
): WrapsError {
  switch (code) {
    case "RESOURCE_CONFLICT":
      return errors.resourceConflict(
        resourceName || "unknown resource",
        resourceType
      );
    case "STACK_LOCKED":
      return errors.stackLocked();
    case "NOT_INSTALLED":
      return errors.pulumiNotInstalled();
    case "SES_PERMISSION_DENIED":
      return errors.sesPermissionDenied(iamAction || "unknown");
    case "DYNAMODB_PERMISSION_DENIED":
      return errors.dynamoDBPermissionDenied();
    case "LAMBDA_PERMISSION_DENIED":
      return errors.lambdaPermissionDenied();
    case "EVENTBRIDGE_PERMISSION_DENIED":
      return errors.eventBridgePermissionDenied();
    case "SQS_PERMISSION_DENIED":
      return errors.sqsPermissionDenied();
    case "IAM_PERMISSION_DENIED":
      return errors.iamPermissionDenied(
        iamAction || "unknown",
        "AWS resource",
        service
          ? `Your IAM user/role needs ${service.toUpperCase()} permissions.`
          : "Ensure your IAM user/role has the required permissions."
      );
    default:
      // sanitizeErrorMessage(undefined) returns "Unknown error", which is
      // truthy, so a `||` fallback to "Deployment failed" would be dead code.
      // Use an explicit check on the input instead.
      return errors.pulumiError(
        originalMessage
          ? sanitizeErrorMessage(originalMessage)
          : "Deployment failed"
      );
  }
}

// Shared by the credential-not-found errors. Deliberately neutral: list every
// way credentials can be provided without prescribing one.
const CREDENTIAL_OPTIONS =
  "Wraps couldn't find working AWS credentials. Any of these work:\n\nAWS SSO:\n  aws configure sso\n  aws sso login\n\nIAM access keys:\n  aws configure\n\nEnvironment variables:\n  export AWS_ACCESS_KEY_ID=<your-key>\n  export AWS_SECRET_ACCESS_KEY=<your-secret>\n\nExisting profile:\n  export AWS_PROFILE=<profile-name>";

/**
 * Common error factory functions
 */
export const errors = {
  noAWSCredentials: () =>
    new WrapsError(
      "AWS credentials not found",
      "NO_AWS_CREDENTIALS",
      CREDENTIAL_OPTIONS,
      "https://wraps.dev/docs/guides/aws-setup"
    ),

  stackExists: (stackName: string) =>
    new WrapsError(
      `Stack "${stackName}" already exists`,
      "STACK_EXISTS",
      `To update: wraps email upgrade\nTo remove: wraps destroy --stack ${stackName}`,
      "https://wraps.dev/docs/cli-reference"
    ),

  invalidRegion: (region: string) =>
    new WrapsError(
      `Invalid AWS region: ${region}`,
      "INVALID_REGION",
      "Use a valid AWS region like: us-east-1, eu-west-1, ap-southeast-1",
      "https://docs.aws.amazon.com/general/latest/gr/rande.html"
    ),

  // The accountId parameter is kept in the signature so callers don't
  // have to change, but it is deliberately not included in the output —
  // the user ran the command so they know their own account, and keeping
  // IDs out of error text matches the `sanitizeErrorMessage` posture used
  // elsewhere in the error system.
  regionRequired: (_accountId: string, savedRegions: readonly string[]) =>
    new WrapsError(
      "Region is required and could not be determined",
      "REGION_REQUIRED",
      savedRegions.length > 0
        ? `Pass --region or set AWS_REGION.\nSaved regions: ${savedRegions.join(", ")}`
        : "Pass --region or set AWS_REGION.\nNo saved Wraps deployments found.",
      "https://wraps.dev/docs/cli-reference"
    ),

  nonInteractiveInput: (what: string, flagHint: string) =>
    new WrapsError(
      `${what} is required in non-interactive mode`,
      "NON_INTERACTIVE_INPUT",
      `Pass ${flagHint} (or run in an interactive terminal).`,
      "https://wraps.dev/docs/reference/json-output"
    ),

  // ── User-input rejections ──────────────────────────────────────────────────
  // "The user gave us bad input and this message says exactly what was wrong."
  // These are WrapsErrors on purpose: handleCLIError's WrapsError branch
  // (errors.ts:424 human, :369 JSON) already renders the exact target shape —
  // a specific telemetry code, the message, the suggestion, exit non-zero —
  // whereas a bare `throw new Error(...)` falls through to the generic tail,
  // which prints "An unexpected error occurred" plus a GitHub-issue link and
  // reports the user's typo as UNHANDLED_ERROR.
  //
  // Callers throw these INSTEAD of printing their own clack.log.error and
  // usage line. That is not tidiness: an unguarded clack.log.error writes to
  // stdout ahead of the JSON envelope, so `--json` consumers were parsing the
  // human text and the envelope out of one stream.
  unknownCommand: (
    what: string,
    typed: string | undefined,
    suggestion: string
  ) =>
    new WrapsError(
      `Unknown ${what}: ${typed || "(none)"}`,
      "UNKNOWN_COMMAND",
      suggestion,
      "https://wraps.dev/docs/cli-reference"
    ),

  // Code deliberately reuses MISSING_REQUIRED_FLAG rather than minting a new one:
  // four commands already emit it inline (commands/sms/verify-number.ts:193,
  // commands/sms/test.ts:71, commands/email/config-domain.ts:208,
  // commands/email/test.ts:108), it is already on the errors reference page (:583),
  // and domains.test.ts:1251 already asserts it. A second code for one condition is
  // exactly the machine-readable inconsistency this feature exists to remove.
  missingInput: (what: string, usage: string) =>
    new WrapsError(
      `${what} is required`,
      "MISSING_REQUIRED_FLAG",
      `Usage: ${usage}`,
      "https://wraps.dev/docs/cli-reference"
    ),

  pulumiError: (message: string) =>
    new WrapsError(
      `Infrastructure deployment failed: ${message}`,
      "PULUMI_ERROR",
      "Check your AWS permissions and try again",
      "https://wraps.dev/docs/guides/aws-setup/troubleshooting"
    ),

  noStack: () =>
    new WrapsError(
      "No Wraps infrastructure found in this AWS account",
      "NO_STACK",
      "Run: wraps email init\nTo deploy new infrastructure",
      "https://wraps.dev/docs/quickstart/email"
    ),

  pulumiNotInstalled: () =>
    new WrapsError(
      "Pulumi CLI is not installed",
      "PULUMI_NOT_INSTALLED",
      "Install Pulumi:\n  macOS: brew install pulumi/tap/pulumi\n  Linux: curl -fsSL https://get.pulumi.com | sh\n  Windows: choco install pulumi\n\nOr download from: https://www.pulumi.com/docs/install/",
      "https://www.pulumi.com/docs/install/"
    ),

  stackLocked: () =>
    new WrapsError(
      "The Pulumi stack is locked from a previous run",
      "STACK_LOCKED",
      "This happens when a previous deployment was interrupted.\n\nFor local state, run:\n  rm -rf ~/.wraps/pulumi/.pulumi/locks\n\nFor S3 state, delete the lock object in your wraps-state-* bucket under .pulumi/locks/\n\nThen try your command again.",
      "https://wraps.dev/docs/guides/aws-setup/troubleshooting"
    ),

  // SMS-specific errors
  smsNotConfigured: () =>
    new WrapsError(
      "SMS infrastructure not found",
      "SMS_NOT_CONFIGURED",
      "Run: wraps sms init\nTo deploy SMS infrastructure",
      "https://wraps.dev/docs/quickstart/sms"
    ),

  smsPhoneNotVerified: () =>
    new WrapsError(
      "Phone number registration not complete",
      "SMS_PHONE_NOT_VERIFIED",
      "Toll-free numbers require registration (15+ days).\nCheck status in AWS console.",
      "https://wraps.dev/docs/quickstart/sms"
    ),

  smsOptedOut: (phoneNumber: string) =>
    new WrapsError(
      `Destination number ${phoneNumber} has opted out`,
      "SMS_OPTED_OUT",
      "The recipient has opted out of receiving messages.\nThey can opt back in by texting START to your number.",
      "https://wraps.dev/docs/quickstart/sms"
    ),

  smsSpendingLimit: () =>
    new WrapsError(
      "AWS SMS spending limit reached",
      "SMS_SPENDING_LIMIT",
      "Request a spending limit increase in the AWS console:\nAWS → End User Messaging → Account Settings → Spending Limits",
      "https://docs.aws.amazon.com/sms-voice/latest/userguide/spend-limit-increase.html"
    ),

  smsInvalidPhoneNumber: (phoneNumber: string) =>
    new WrapsError(
      `Invalid phone number format: ${phoneNumber}`,
      "SMS_INVALID_PHONE_NUMBER",
      "Phone numbers must be in E.164 format:\n  Example: +14155551234 (US)\n  Example: +447911123456 (UK)",
      "https://wraps.dev/docs/sms-sdk-reference"
    ),

  smsInvalidCountries: (raw: string) =>
    new WrapsError(
      `Invalid --countries value: ${raw}`,
      "SMS_INVALID_COUNTRIES",
      "Pass a comma-separated list of ISO 3166-1 alpha-2 codes.\n  Example: --countries US,CA,GB",
      "https://wraps.dev/docs/cli-reference"
    ),

  smsInvalidVolume: (raw: string) =>
    new WrapsError(
      `Invalid --volume value: ${raw}`,
      "SMS_INVALID_VOLUME",
      "Pass a positive whole number of messages per month.\n  Example: --volume 10000",
      "https://wraps.dev/docs/cli-reference"
    ),

  smsSimulatorLimit: () =>
    new WrapsError(
      "Simulator daily message limit reached (100 messages)",
      "SMS_SIMULATOR_LIMIT",
      "Upgrade to a toll-free number for production use:\n  wraps sms upgrade --phone-type toll-free",
      "https://wraps.dev/docs/cli-reference"
    ),

  // SMTP-specific errors
  smtpRequiresSending: () =>
    new WrapsError(
      "SMTP credentials require email sending to be enabled",
      "SMTP_REQUIRES_SENDING",
      "Enable sending first:\n  wraps email upgrade\nAnd select 'Custom configuration' to enable sending.",
      "https://wraps.dev/docs/cli-reference"
    ),

  smtpCredentialsNotFound: () =>
    new WrapsError(
      "SMTP credentials not found",
      "SMTP_CREDENTIALS_NOT_FOUND",
      "Enable SMTP credentials:\n  wraps email upgrade\nAnd select 'Enable SMTP credentials'",
      "https://wraps.dev/docs/cli-reference"
    ),

  // Credential-specific errors
  ssoSessionExpired: (profile?: string) =>
    new WrapsError(
      `AWS SSO session has expired${profile ? ` for profile "${profile}"` : ""}`,
      "SSO_SESSION_EXPIRED",
      profile
        ? `Run: aws sso login --profile ${profile}`
        : "Run: aws sso login",
      "https://wraps.dev/docs/guides/aws-setup/permissions"
    ),

  profileNotFound: (profile: string, availableProfiles: string[]) =>
    new WrapsError(
      `AWS profile "${profile}" not found`,
      "PROFILE_NOT_FOUND",
      availableProfiles.length > 0
        ? `Available profiles: ${availableProfiles.join(", ")}\n\nSet a valid profile:\n  export AWS_PROFILE=<profile-name>\n\nOr configure a new profile:\n  aws configure --profile ${profile}`
        : "No AWS profiles configured.\n\nConfigure AWS credentials:\n  aws configure\n\nOr set up SSO:\n  aws configure sso",
      "https://wraps.dev/docs/guides/aws-setup/permissions"
    ),

  credentialsFileMissing: () =>
    new WrapsError(
      "AWS credentials file not found",
      "CREDENTIALS_FILE_MISSING",
      CREDENTIAL_OPTIONS,
      "https://wraps.dev/docs/guides/aws-setup/permissions"
    ),

  accessKeyInvalid: () =>
    new WrapsError(
      "AWS access key is invalid or has been deactivated",
      "ACCESS_KEY_INVALID",
      "Check your AWS access keys in the IAM console.\n\nReconfigure credentials:\n  aws configure\n\nOr generate new access keys in AWS IAM.",
      "https://wraps.dev/docs/guides/aws-setup/permissions"
    ),

  sessionTokenExpired: () =>
    new WrapsError(
      "AWS session token has expired",
      "SESSION_TOKEN_EXPIRED",
      "Your temporary credentials have expired.\n\nFor SSO users:\n  aws sso login\n\nFor assumed roles:\n  Re-run your assume-role command",
      "https://wraps.dev/docs/guides/aws-setup/permissions"
    ),

  // IAM permission errors
  iamPermissionDenied: (action: string, resource: string, suggestion: string) =>
    new WrapsError(
      `Permission denied: ${action} on ${resource}`,
      "IAM_PERMISSION_DENIED",
      `Your AWS credentials lack the "${action}" permission.\n\n${suggestion}\n\nView required permissions:\n  wraps permissions --json`,
      "https://wraps.dev/docs/guides/aws-setup/permissions"
    ),

  sesPermissionDenied: (action: string) =>
    new WrapsError(
      `SES permission denied: ${action}`,
      "SES_PERMISSION_DENIED",
      `Your IAM user/role needs the "ses:${action}" permission.\n\nView required SES permissions:\n  wraps permissions --service email --json`,
      "https://wraps.dev/docs/guides/aws-setup/permissions"
    ),

  // SES SendEmail rejection errors — request reached SES but the send failed
  // for a reason unrelated to credentials.
  sesMessageRejected: (detail: string) =>
    new WrapsError(
      `SES rejected the message: ${detail}`,
      "SES_MESSAGE_REJECTED",
      "Common causes:\n  • Account is in the SES sandbox and the recipient is not a verified address\n  • Sender identity (domain or email) is not verified for sending\n  • The sender domain is verified for receiving but not for sending\n\nCheck status:\n  wraps email status\n  wraps email doctor\n\nRequest production access (exit sandbox):\n  https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html",
      "https://wraps.dev/docs/guides/aws-setup/troubleshooting"
    ),

  sesMailFromNotVerified: (detail: string) =>
    new WrapsError(
      `SES MAIL FROM domain is not verified: ${detail}`,
      "SES_MAIL_FROM_NOT_VERIFIED",
      "The custom MAIL FROM domain configured for this identity is not fully verified.\n\nCheck DNS records:\n  wraps email verify\n\nOr remove the custom MAIL FROM domain in the SES console and retry.",
      "https://docs.aws.amazon.com/ses/latest/dg/mail-from.html"
    ),

  sesAccountSendingPaused: () =>
    new WrapsError(
      "SES account-level sending is paused",
      "SES_ACCOUNT_SENDING_PAUSED",
      "Your SES account is currently paused from sending email. This is usually caused by:\n  • A high bounce or complaint rate\n  • An AWS-initiated review\n\nCheck the SES console → Reputation Dashboard for details, then resume sending once the issue is resolved.",
      "https://docs.aws.amazon.com/ses/latest/dg/reputationdashboard.html"
    ),

  sesConfigSetSendingPaused: () =>
    new WrapsError(
      "SES configuration set sending is paused",
      "SES_CONFIG_SET_SENDING_PAUSED",
      "The configuration set used for this send has sending paused. Resume it in the SES console under Configuration Sets, or send without specifying the paused configuration set.",
      "https://docs.aws.amazon.com/ses/latest/dg/using-configuration-sets.html"
    ),

  sesConfigSetMissing: (detail: string) =>
    new WrapsError(
      `SES configuration set does not exist: ${detail}`,
      "SES_CONFIG_SET_MISSING",
      "The configuration set referenced by this send does not exist in the current region. Create it in the SES console, switch regions, or remove the ConfigurationSetName from the request.",
      "https://docs.aws.amazon.com/ses/latest/dg/using-configuration-sets.html"
    ),

  // eventTracking.events filters which SES event types reach the customer's
  // own EventBridge bus. BOUNCE and COMPLAINT feed the suppression-tracking
  // path (a Suppressed webhook event arrives as a Bounce with
  // bounceSubType === "Suppressed") — dropping either leaves the account
  // blind to bounces/complaints, so bad addresses keep getting sent to and
  // domain reputation degrades.
  eventTypesMissingSuppressionEvents: (missing: string[]) =>
    new WrapsError(
      `eventTracking.events is missing required event type(s): ${missing.join(", ")}`,
      "EVENT_TYPES_MISSING_SUPPRESSION_EVENTS",
      'BOUNCE and COMPLAINT must always be included in eventTracking.events. Without them your pipeline never learns about bounces or complaints, so bad addresses keep getting sent to and your domain reputation degrades.\n\nTo stop OPEN/CLICK tracking without losing suppression visibility, drop only those types:\n  eventTracking: { events: ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT", "REJECT", "RENDERING_FAILURE", "DELIVERY_DELAY", "SUBSCRIPTION"] }',
      "https://wraps.dev/docs/infrastructure/events"
    ),

  // Generic AWS error fallbacks — used by awsErrorToWrapsError when no specific
  // mapping exists. These NEVER claim credentials are missing.
  awsThrottled: (action?: string) =>
    new WrapsError(
      `AWS request was throttled${action ? ` (${action})` : ""}`,
      "AWS_THROTTLED",
      "AWS is rate-limiting requests to this API. Wait a moment and retry.\n\nIf this happens repeatedly, request a service quota increase in the AWS console.",
      "https://docs.aws.amazon.com/general/latest/gr/api-retries.html"
    ),

  awsLimitExceeded: (action?: string, detail?: string) =>
    new WrapsError(
      `AWS service limit exceeded${action ? ` (${action})` : ""}${detail ? `: ${detail}` : ""}`,
      "AWS_LIMIT_EXCEEDED",
      "You've hit a service quota for this AWS API.\n\nRequest a quota increase in the AWS console:\n  Service Quotas → AWS Services → (your service)",
      "https://docs.aws.amazon.com/general/latest/gr/aws_service_limits.html"
    ),

  awsUnknownError: (code: string, action?: string, detail?: string) =>
    new WrapsError(
      `AWS API error: ${code}${action ? ` (${action})` : ""}${detail ? ` — ${detail}` : ""}`,
      `AWS_${code}`,
      `This is an AWS API error, not a credentials problem. Look up "${code}" in the AWS documentation for the failing service.\n\nIf you believe this is a Wraps bug, report it at:\n  https://github.com/wraps-team/wraps/issues`,
      "https://wraps.dev/docs/guides/aws-setup/troubleshooting"
    ),

  // Agent enforcement resource-not-found errors. These surface when the
  // console-access role, enforcer Lambda, or policy table is missing — usually
  // because platform connect or the agent deploy hasn't run yet.
  iamEntityNotFound: () =>
    new WrapsError(
      "IAM entity not found",
      "IAM_ENTITY_NOT_FOUND",
      "The expected IAM role or user does not exist. This usually means platform connect hasn't run for this account.\n\nConnect first:\n  wraps platform connect",
      "https://wraps.dev/docs/guides/aws-setup/permissions"
    ),

  lambdaFunctionNotFound: () =>
    new WrapsError(
      "Agent enforcer Lambda not found",
      "LAMBDA_FUNCTION_NOT_FOUND",
      "The agent enforcer function (wraps-agent-enforcer) does not exist in this region.\n\nDeploy it by creating an agent:\n  wraps email agent create",
      "https://wraps.dev/docs/guides/aws-setup/troubleshooting"
    ),

  dynamoTableNotFound: () =>
    new WrapsError(
      "Agent policy table not found",
      "DYNAMODB_TABLE_NOT_FOUND",
      "The agent policy table (wraps-email-agent-policy) does not exist in this region.\n\nDeploy it by creating an agent:\n  wraps email agent create",
      "https://wraps.dev/docs/guides/aws-setup/troubleshooting"
    ),

  dynamoDBPermissionDenied: () =>
    new WrapsError(
      "DynamoDB permission denied",
      "DYNAMODB_PERMISSION_DENIED",
      "Your IAM user/role needs DynamoDB permissions.\nRequired actions: CreateTable, DeleteTable, DescribeTable, UpdateTable\n\nView required permissions:\n  wraps permissions --json",
      "https://wraps.dev/docs/guides/aws-setup/permissions"
    ),

  lambdaPermissionDenied: () =>
    new WrapsError(
      "Lambda permission denied",
      "LAMBDA_PERMISSION_DENIED",
      "Your IAM user/role needs Lambda permissions.\nRequired actions: CreateFunction, UpdateFunctionCode, DeleteFunction\n\nView required permissions:\n  wraps permissions --json",
      "https://wraps.dev/docs/guides/aws-setup/permissions"
    ),

  eventBridgePermissionDenied: () =>
    new WrapsError(
      "EventBridge permission denied",
      "EVENTBRIDGE_PERMISSION_DENIED",
      "Your IAM user/role needs EventBridge permissions.\nRequired actions: PutRule, PutTargets, DeleteRule\n\nView required permissions:\n  wraps permissions --json",
      "https://wraps.dev/docs/guides/aws-setup/permissions"
    ),

  sqsPermissionDenied: () =>
    new WrapsError(
      "SQS permission denied",
      "SQS_PERMISSION_DENIED",
      "Your IAM user/role needs SQS permissions.\nRequired actions: CreateQueue, DeleteQueue, GetQueueAttributes\n\nView required permissions:\n  wraps permissions --json",
      "https://wraps.dev/docs/guides/aws-setup/permissions"
    ),

  cloudWatchLogsPermissionDenied: (action: string) =>
    new WrapsError(
      "CloudWatch Logs permission denied",
      "CLOUDWATCH_LOGS_PERMISSION_DENIED",
      `Your IAM user/role is not allowed to call ${action}.\nRequired actions: logs:DescribeLogGroups, logs:FilterLogEvents, logs:StartLiveTail\n\nView required permissions:\n  wraps permissions --json`,
      "https://wraps.dev/docs/guides/aws-setup/permissions"
    ),

  // Discovery scans for /aws/lambda/wraps-selfhost*, which both the Pulumi and
  // SST variants create — no groups means no deployment in this region, not an
  // unsupported variant.
  noSelfhostLogGroups: (region: string) =>
    new WrapsError(
      `No self-hosted log groups found in ${region}`,
      "SELFHOST_NO_LOG_GROUPS",
      "Nothing matching /aws/lambda/wraps-selfhost* exists in this region. The deployment may live in another region, or may not have run yet.\n\nCheck the deployment:\n  wraps selfhost status\n\nOr target a different region:\n  wraps selfhost logs --region <region>",
      "https://wraps.dev/docs/self-hosting"
    ),

  invalidLogSource: (value: string) =>
    new WrapsError(
      `Unknown --source value: ${value}`,
      "INVALID_LOG_SOURCE",
      "Valid sources are: api, web, workers, other, all.\n\nExample:\n  wraps selfhost logs --source api",
      "https://wraps.dev/docs/self-hosting"
    ),

  // The Pulumi variant deploys the API Lambda only, so `--source web` is a
  // legitimate request with no matching groups rather than a typo.
  noLogGroupsForSource: (source: string, available: string) =>
    new WrapsError(
      `No ${source} log groups in this deployment`,
      "SELFHOST_NO_LOG_GROUPS_FOR_SOURCE",
      `This deployment has: ${available}.\n\nA deployment that did not finish may be missing its dashboard or worker Lambdas.\n\nDrop the filter to see everything:\n  wraps selfhost logs`,
      "https://wraps.dev/docs/self-hosting"
    ),

  invalidLogWindow: (value: string) =>
    new WrapsError(
      `Invalid --since value: ${value}`,
      "INVALID_LOG_WINDOW",
      "Use a positive number followed by s, m, h, or d.\n\nExamples:\n  wraps selfhost logs --since 30m\n  wraps selfhost logs --since 6h\n  wraps selfhost logs --since 2d",
      "https://wraps.dev/docs/self-hosting"
    ),

  route53PermissionDenied: () =>
    new WrapsError(
      "Route53 permission denied",
      "ROUTE53_PERMISSION_DENIED",
      "Your IAM user/role needs Route53 permissions for automatic DNS management.\nRequired actions: ChangeResourceRecordSets, ListHostedZones\n\nThis is optional - you can add DNS records manually instead.",
      "https://wraps.dev/docs/guides/aws-setup/permissions"
    ),

  s3StateBucketCreationFailed: (bucketName: string) =>
    new WrapsError(
      `Failed to create S3 state bucket: ${bucketName}`,
      "S3_STATE_BUCKET_CREATION_FAILED",
      "Ensure your IAM user/role has s3:CreateBucket, s3:PutBucketEncryption, s3:PutBucketVersioning permissions.\n\nTo use local-only state instead:\n  export WRAPS_LOCAL_ONLY=1",
      "https://wraps.dev/docs/guides/aws-setup/permissions"
    ),

  inboundRegionNotSupported: (region: string) =>
    new WrapsError(
      `SES email receiving is not supported in ${region}`,
      "INBOUND_REGION_NOT_SUPPORTED",
      "SES receipt rules are only available in:\n  us-east-1 (N. Virginia)\n  us-west-2 (Oregon)\n  eu-west-1 (Ireland)\n\nDeploy email infrastructure in one of these regions to enable inbound email.",
      "https://docs.aws.amazon.com/ses/latest/dg/regions.html#region-receive-email"
    ),

  inboundRequiresOutbound: () =>
    new WrapsError(
      "Inbound email requires outbound email infrastructure",
      "INBOUND_REQUIRES_OUTBOUND",
      "Deploy email infrastructure first:\n  wraps email init\n\nThen enable inbound email:\n  wraps email inbound init",
      "https://wraps.dev/docs/quickstart/email"
    ),

  receiptRuleSetConflict: (activeRuleSet: string) =>
    new WrapsError(
      `Another receipt rule set is active: ${activeRuleSet}`,
      "RECEIPT_RULE_SET_CONFLICT",
      `SES only allows one active receipt rule set at a time.\nCurrently active: "${activeRuleSet}"\n\nWraps will activate "wraps-inbound-rules" which will deactivate the current set.\nYou may need to merge your existing rules into the wraps rule set.`,
      "https://docs.aws.amazon.com/ses/latest/dg/receiving-email-concepts.html"
    ),

  s3StateAccessDenied: () =>
    new WrapsError(
      "Access denied to S3 state bucket",
      "S3_STATE_ACCESS_DENIED",
      "Ensure your IAM user/role has s3:GetObject, s3:PutObject, s3:ListBucket permissions on wraps-state-* buckets.\n\nTo use local-only state instead:\n  export WRAPS_LOCAL_ONLY=1",
      "https://wraps.dev/docs/guides/aws-setup/permissions"
    ),

  stateMigrationFailed: () =>
    new WrapsError(
      "Failed to migrate Pulumi state to S3",
      "STATE_MIGRATION_FAILED",
      "The migration from local to S3 state storage failed.\nYour local state is still intact.\n\nTo skip migration and use local-only state:\n  export WRAPS_LOCAL_ONLY=1",
      "https://wraps.dev/docs/guides/aws-setup/permissions"
    ),

  resourceConflict: (resourceName: string, resourceType?: string) =>
    new WrapsError(
      `Resource already exists: ${resourceName}${resourceType ? ` (${resourceType})` : ""}`,
      "RESOURCE_CONFLICT",
      "Existing Wraps resources were found in your AWS account.\n\nTo diagnose and clean up:\n  wraps email doctor --cleanup\n\nThen retry your deployment.",
      "https://wraps.dev/docs/guides/aws-setup/troubleshooting"
    ),

  // Templates-as-code errors
  wrapsConfigNotFound: () =>
    new WrapsError(
      "wraps/wraps.config.ts not found",
      "WRAPS_CONFIG_NOT_FOUND",
      "Initialize templates first:\n  wraps email templates init",
      "https://wraps.dev/docs/guides/templates"
    ),

  templateCompilationFailed: (name: string, error: string) =>
    new WrapsError(
      `Failed to compile template "${name}": ${error}`,
      "TEMPLATE_COMPILATION_FAILED",
      "Check your template for syntax errors and ensure all imports are valid.",
      "https://wraps.dev/docs/guides/templates"
    ),

  notAuthenticated: () =>
    new WrapsError(
      "Not authenticated to Wraps Platform",
      "NOT_AUTHENTICATED",
      "Sign in first:\n  wraps auth login\n\nOr provide an API key:\n  wraps push --token wraps_...\n  WRAPS_API_KEY=wraps_... wraps push",
      "https://wraps.dev/docs/cli-reference/auth"
    ),

  templatePushFailed: (name: string, error: string) =>
    new WrapsError(
      `Failed to push template "${name}": ${error}`,
      "TEMPLATE_PUSH_FAILED",
      "Check your API key and network connection.",
      "https://wraps.dev/docs/guides/templates"
    ),
};
