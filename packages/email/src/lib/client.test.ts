import type { SESClient } from "@aws-sdk/client-ses";
import type { AwsCredentialIdentity } from "@smithy/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROLE_ARN = "arn:aws:iam::010836206701:role/wraps-email-role";

const ASSUMED_CREDENTIALS: AwsCredentialIdentity = {
  accessKeyId: "ASIAASSUMED",
  secretAccessKey: "assumed-secret",
  sessionToken: "assumed-session-token",
};

const OIDC_CREDENTIALS: AwsCredentialIdentity = {
  accessKeyId: "ASIAOIDC",
  secretAccessKey: "oidc-secret",
  sessionToken: "oidc-session-token",
};

// Both mocks stand in for AWS credential resolution — the system boundary.
// Neither is an internal collaborator: they are the only two libraries that
// exchange an identity for temporary SES-capable credentials.
const fromTemporaryCredentials = vi.fn(
  () => () => Promise.resolve(ASSUMED_CREDENTIALS)
);
vi.mock("@aws-sdk/credential-providers", () => ({
  fromTemporaryCredentials: (...args: unknown[]) =>
    fromTemporaryCredentials(...(args as [])),
}));

const awsCredentialsProvider = vi.fn(
  () => () => Promise.resolve(OIDC_CREDENTIALS)
);
vi.mock("@vercel/oidc-aws-credentials-provider", () => ({
  awsCredentialsProvider: (...args: unknown[]) =>
    awsCredentialsProvider(...(args as [])),
}));

import { getWrapsClient } from "./client";

/**
 * Resolve the credentials the returned client would actually sign with.
 *
 * `sesClient` is private on WrapsEmail, so reach it by cast. The alternative —
 * asserting on constructor arguments — would pass for a client that is
 * configured but cannot resolve credentials, which is exactly the bug here.
 */
async function resolveCredentials(
  wraps: Awaited<ReturnType<typeof getWrapsClient>>
): Promise<AwsCredentialIdentity> {
  const ses = (wraps as unknown as { sesClient: SESClient }).sesClient;
  return await ses.config.credentials();
}

beforeEach(() => {
  // Start from an environment that has configured nothing, so each case
  // controls exactly which signal is present.
  vi.stubEnv("VERCEL", undefined);
  vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", undefined);
  vi.stubEnv("AWS_WEB_IDENTITY_TOKEN_FILE", undefined);
  vi.stubEnv("WRAPS_EMAIL_ROLE_ARN", undefined);
  vi.stubEnv("AWS_ROLE_ARN", undefined);
  vi.stubEnv("AWS_REGION", "us-east-1");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("getWrapsClient", () => {
  it("assumes the role from ambient credentials on Lambda", async () => {
    // The event-feed-staleness cron: a Lambda whose execution role is granted
    // sts:AssumeRole on the dogfood email role. There is no web identity token
    // file here, so a web-identity-only path throws CredentialsProviderError
    // ("Web identity configuration not specified") and every alert send dies.
    vi.stubEnv(
      "AWS_LAMBDA_FUNCTION_NAME",
      "wraps-production-EventFeedStaleness"
    );
    vi.stubEnv("WRAPS_EMAIL_ROLE_ARN", ROLE_ARN);

    const wraps = await getWrapsClient();

    await expect(resolveCredentials(wraps)).resolves.toEqual(
      ASSUMED_CREDENTIALS
    );
    expect(fromTemporaryCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ RoleArn: ROLE_ARN }),
      })
    );
  });

  it("uses Vercel OIDC when running on Vercel", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("WRAPS_EMAIL_ROLE_ARN", ROLE_ARN);

    const wraps = await getWrapsClient();

    await expect(resolveCredentials(wraps)).resolves.toEqual(OIDC_CREDENTIALS);
    expect(awsCredentialsProvider).toHaveBeenCalledWith(
      expect.objectContaining({ roleArn: ROLE_ARN })
    );
    expect(fromTemporaryCredentials).not.toHaveBeenCalled();
  });

  it("leaves the web identity token file to the SDK on EKS and CI", async () => {
    // EKS and GitHub Actions project a token file and the SDK's own roleArn
    // branch exchanges it. Assuming from ambient credentials there would fail:
    // the only identity available is the token itself.
    vi.stubEnv("AWS_WEB_IDENTITY_TOKEN_FILE", "/var/run/secrets/token");
    vi.stubEnv("WRAPS_EMAIL_ROLE_ARN", ROLE_ARN);

    await getWrapsClient();

    expect(fromTemporaryCredentials).not.toHaveBeenCalled();
    expect(awsCredentialsProvider).not.toHaveBeenCalled();
  });

  it("falls back to the default credential chain with no role configured", async () => {
    // Local development against a personal profile.
    const wraps = await getWrapsClient();

    expect(fromTemporaryCredentials).not.toHaveBeenCalled();
    expect(awsCredentialsProvider).not.toHaveBeenCalled();
    // The SDK's own chain is installed, not one of ours.
    const ses = (wraps as unknown as { sesClient: SESClient }).sesClient;
    expect(ses.config.credentials).toBeTypeOf("function");
  });
});
