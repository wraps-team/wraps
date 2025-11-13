import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const sts = new STSClient({
      region: process.env.AWS_REGION || "us-east-1",
    });

    const command = new GetCallerIdentityCommand({});
    const identity = await sts.send(command);

    return NextResponse.json({
      success: true,
      identity: {
        account: identity.Account,
        arn: identity.Arn,
        userId: identity.UserId,
      },
      environment: {
        hasAccessKeyId: !!process.env.AWS_ACCESS_KEY_ID,
        hasSecretAccessKey: !!process.env.AWS_SECRET_ACCESS_KEY,
        hasRoleArn: !!process.env.AWS_ROLE_ARN,
        hasProfile: !!process.env.AWS_PROFILE,
        region: process.env.AWS_REGION,
        backendAccountId: process.env.AWS_BACKEND_ACCOUNT_ID,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        environment: {
          hasAccessKeyId: !!process.env.AWS_ACCESS_KEY_ID,
          hasSecretAccessKey: !!process.env.AWS_SECRET_ACCESS_KEY,
          hasRoleArn: !!process.env.AWS_ROLE_ARN,
          hasProfile: !!process.env.AWS_PROFILE,
          region: process.env.AWS_REGION,
          backendAccountId: process.env.AWS_BACKEND_ACCOUNT_ID,
        },
      },
      { status: 500 }
    );
  }
}
