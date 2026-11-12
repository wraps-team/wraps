import { errors } from "./errors.js";
import { ensurePulumiWorkDir } from "./fs.js";
import { getS3BackendUrl } from "./s3-state.js";

/**
 * Point Pulumi at the account's state backend, and refuse to continue on local
 * state. ensurePulumiWorkDir falls back to the local file backend when S3 is
 * unreachable; a migrated account still has a stale local stack, so removing a
 * stack from it would orphan resources created since. Every command that
 * removes a Pulumi stack calls this after its last prompt and before its first
 * delete, outside any try/catch that would wrap or swallow the error.
 */
export async function requireAccountStateBackend(
  accountId: string,
  region: string
): Promise<void> {
  await ensurePulumiWorkDir({ accountId, region });
  if (
    process.env.WRAPS_LOCAL_ONLY !== "1" &&
    process.env.PULUMI_BACKEND_URL !== getS3BackendUrl(accountId, region)
  ) {
    throw errors.stateBackendUnreachable(accountId, region);
  }
}
