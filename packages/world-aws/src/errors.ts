/**
 * Base error class for AWS World operations.
 *
 * Wraps AWS SDK errors with actionable codes and messages so callers can
 * distinguish between throttling, credential, and unexpected failures.
 */
export class WorldError extends Error {
  readonly code: string;

  constructor(message: string, code: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "WorldError";
    this.code = code;
  }
}

export function isThrottlingError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.name === "ThrottlingException" ||
      e.name === "ProvisionedThroughputExceededException" ||
      e.name === "RequestLimitExceeded")
  );
}

export function isCredentialError(e: unknown): boolean {
  return (
    e instanceof Error &&
    (e.name === "CredentialsProviderError" ||
      e.name === "AccessDeniedException" ||
      e.name === "UnrecognizedClientException")
  );
}

export function wrapAWSError(e: unknown, operation: string): never {
  if (isThrottlingError(e)) {
    throw new WorldError(
      `AWS throttled during ${operation} — consider increasing capacity or adding retry logic`,
      "THROTTLED",
      { cause: e }
    );
  }
  if (isCredentialError(e)) {
    throw new WorldError(
      `AWS credentials error during ${operation} — check IAM permissions and credential configuration`,
      "CREDENTIALS",
      { cause: e }
    );
  }
  throw e;
}
