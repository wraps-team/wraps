import { auth } from "@wraps/auth";
import { NextResponse } from "next/server";
import { checkAWSAccountAccess } from "./check-access";
import type { Permission } from "./types";

export async function requireAWSAccountAccess(
  request: Request,
  params: {
    organizationId: string;
    awsAccountId: string;
    permission: Permission;
  }
) {
  // Get session
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // Check access
  const access = await checkAWSAccountAccess({
    userId: session.user.id,
    organizationId: params.organizationId,
    awsAccountId: params.awsAccountId,
    permission: params.permission,
  });

  if (!access.authorized) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: "Access denied", reason: access.reason },
        { status: 403 }
      ),
    };
  }

  return {
    authorized: true,
    userId: session.user.id,
  };
}
