import * as aws from "@pulumi/aws";
import { MANAGED_DEDICATED_IP_POOL_NAME } from "@wraps/core";
import { errors } from "../../utils/shared/errors.js";

/**
 * Current state of the `wraps-email-managed` pool name in this account/region.
 * "absent" means safe to create. "managed" means it's ours (or was created
 * outside Wraps as MANAGED) and can be imported. "standard" means a STANDARD
 * pool already holds this name — Wraps refuses rather than converting it,
 * because MANAGED is a one-way conversion in SES.
 *
 * Unlike `configurationSetExists` in ./ses.ts, this does NOT swallow unknown
 * errors: guessing "absent" here could create a duplicate pool, and guessing
 * "managed" could silently import (and later delete) a pool Wraps doesn't
 * actually own.
 */
export async function getManagedPoolState(
  region: string
): Promise<"absent" | "managed" | "standard"> {
  try {
    const { SESv2Client, GetDedicatedIpPoolCommand } = await import(
      "@aws-sdk/client-sesv2"
    );
    const ses = new SESv2Client({ region });

    const response = await ses.send(
      new GetDedicatedIpPoolCommand({
        PoolName: MANAGED_DEDICATED_IP_POOL_NAME,
      })
    );

    return response.DedicatedIpPool?.ScalingMode === "STANDARD"
      ? "standard"
      : "managed";
  } catch (error) {
    if (isNotFoundError(error)) {
      return "absent";
    }
    throw error;
  }
}

// AWS SDK v3 sometimes returns a generic "Error" with the real exception
// name only in the message — never rely on `error.name` alone.
function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "NotFoundException" ||
    error.message.includes("NotFoundException")
  );
}

/**
 * Create (or import) the SES managed dedicated IP pool Wraps attaches to its
 * configuration set. Refuses outright if a STANDARD pool already holds the
 * name — see getManagedPoolState.
 */
export async function createManagedDedicatedIpPool(options: {
  region: string;
  skipResourceImports?: boolean;
}): Promise<aws.sesv2.DedicatedIpPool> {
  const state = await getManagedPoolState(options.region);

  if (state === "standard") {
    throw errors.managedPoolNameTaken();
  }

  const args: aws.sesv2.DedicatedIpPoolArgs = {
    poolName: MANAGED_DEDICATED_IP_POOL_NAME,
    scalingMode: "MANAGED",
    tags: {
      ManagedBy: "wraps-cli",
      Service: "email",
      Description: "Wraps managed dedicated IP pool",
    },
  };

  if (state === "managed" && !options.skipResourceImports) {
    return new aws.sesv2.DedicatedIpPool(MANAGED_DEDICATED_IP_POOL_NAME, args, {
      import: MANAGED_DEDICATED_IP_POOL_NAME,
    });
  }

  return new aws.sesv2.DedicatedIpPool(MANAGED_DEDICATED_IP_POOL_NAME, args);
}
