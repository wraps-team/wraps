import { NextResponse } from "next/server";

export async function GET() {
  // Check what OIDC-related env vars Vercel provides
  return NextResponse.json({
    environment: {
      // AWS OIDC vars
      AWS_ROLE_ARN: process.env.AWS_ROLE_ARN,
      AWS_REGION: process.env.AWS_REGION,
      AWS_WEB_IDENTITY_TOKEN_FILE: process.env.AWS_WEB_IDENTITY_TOKEN_FILE,

      // Check for explicit credentials (should NOT be set)
      hasAccessKeyId: !!process.env.AWS_ACCESS_KEY_ID,
      hasSecretAccessKey: !!process.env.AWS_SECRET_ACCESS_KEY,
      hasSessionToken: !!process.env.AWS_SESSION_TOKEN,

      // Vercel deployment info
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_GIT_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF,

      // Check all AWS-related env vars
      awsEnvVars: Object.keys(process.env)
        .filter((key) => key.startsWith("AWS_"))
        .map((key) => ({
          key,
          hasValue: !!process.env[key],
          length: process.env[key]?.length,
        })),
    },
  });
}
