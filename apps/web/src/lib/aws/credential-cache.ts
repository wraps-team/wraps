import { LRUCache } from "lru-cache";
import { assumeRole } from "./assume-role";

interface CachedCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

/**
 * LRU cache for temporary AWS credentials.
 * - Max 500 entries (supports many concurrent users/accounts)
 * - 50 minute TTL (10 minute buffer before 1 hour expiration)
 * - No age update on get (credentials have fixed expiration)
 */
const credentialCache = new LRUCache<string, CachedCredentials>({
  max: 500,
  ttl: 50 * 60 * 1000, // 50 minutes (10 min buffer before 1hr expiry)
  updateAgeOnGet: false,
});

/**
 * Gets temporary credentials from cache or assumes role if needed.
 * Automatically refreshes credentials if they're expired or close to expiration.
 *
 * @param params - Role ARN and external ID
 * @returns Temporary AWS credentials
 *
 * @example
 * ```ts
 * const creds = await getOrAssumeRole({
 *   roleArn: 'arn:aws:iam::123456789012:role/wraps-console-role',
 *   externalId: 'unique-external-id-123'
 * });
 *
 * // Use credentials with AWS SDK
 * const ses = new SESClient({
 *   region: 'us-east-1',
 *   credentials: {
 *     accessKeyId: creds.accessKeyId,
 *     secretAccessKey: creds.secretAccessKey,
 *     sessionToken: creds.sessionToken,
 *   }
 * });
 * ```
 */
export async function getOrAssumeRole(params: {
  roleArn: string;
  externalId: string;
}): Promise<CachedCredentials> {
  const cacheKey = `${params.roleArn}:${params.externalId}`;

  // Check cache
  const cached = credentialCache.get(cacheKey);
  if (cached) {
    const expiresIn = cached.expiration.getTime() - Date.now();

    // Only use cached credentials if they have >5 minutes left
    if (expiresIn > 5 * 60 * 1000) {
      return cached;
    }

    // Credentials are about to expire, remove from cache
    credentialCache.delete(cacheKey);
  }

  // Cache miss or expired - assume role
  const credentials = await assumeRole(params);

  const cachedCreds: CachedCredentials = {
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    sessionToken: credentials.sessionToken,
    expiration: credentials.expiration,
  };

  // Store in cache
  credentialCache.set(cacheKey, cachedCreds);

  return cachedCreds;
}

/**
 * Clears all cached credentials.
 * Useful for testing or when rotating backend credentials.
 */
export function clearCredentialCache(): void {
  credentialCache.clear();
}

/**
 * Removes credentials for a specific role from cache.
 * Useful when revoking access to a customer account.
 */
export function invalidateCredentials(params: {
  roleArn: string;
  externalId: string;
}): void {
  const cacheKey = `${params.roleArn}:${params.externalId}`;
  credentialCache.delete(cacheKey);
}
