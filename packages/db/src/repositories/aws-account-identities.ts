import { isNull, lt, or } from "drizzle-orm";
import { and, db, eq } from "../index";
import { awsAccount } from "../schema/app";

export type SnapshotIdentity = {
  identity: string;
  type: "DOMAIN" | "EMAIL_ADDRESS";
  configSetName?: string;
};

type Features = NonNullable<(typeof awsAccount.$inferSelect)["features"]>;

function mergeIdentities(
  current: Features | null | undefined,
  identities: SnapshotIdentity[]
): Features {
  return {
    ...(current ?? {}),
    email: { ...(current?.email ?? {}), identities },
  };
}

/**
 * Atomically claims the right to refresh one account's identities snapshot.
 * True iff this caller won the claim (never claimed, or last claim older than
 * cooldownMs). The stamp is a claim, not proof the scan succeeded.
 */
export async function claimIdentityRefresh(input: {
  organizationId: string;
  awsAccountId: string;
  cooldownMs: number;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  const rows = await db
    .update(awsAccount)
    .set({ identitiesScannedAt: now })
    .where(
      and(
        eq(awsAccount.id, input.awsAccountId),
        eq(awsAccount.organizationId, input.organizationId),
        or(
          isNull(awsAccount.identitiesScannedAt),
          lt(
            awsAccount.identitiesScannedAt,
            new Date(now.getTime() - input.cooldownMs)
          )
        )
      )
    )
    .returning({ id: awsAccount.id });
  return rows.length > 0;
}

/**
 * Replaces features.email.identities with a full scan result, preserving every
 * other key in features. Row-locked so it cannot clobber a concurrent write.
 */
export async function writeIdentitySnapshot(input: {
  organizationId: string;
  awsAccountId: string;
  identities: SnapshotIdentity[];
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ features: awsAccount.features })
      .from(awsAccount)
      .where(
        and(
          eq(awsAccount.id, input.awsAccountId),
          eq(awsAccount.organizationId, input.organizationId)
        )
      )
      .for("update");
    if (!row) {
      return;
    }

    const merged = mergeIdentities(row.features, input.identities);
    await tx
      .update(awsAccount)
      .set({
        features: merged,
        identitiesScannedAt: now,
        emailEnabled:
          input.identities.length > 0 || !!merged.email?.configSetName,
        updatedAt: now,
      })
      .where(
        and(
          eq(awsAccount.id, input.awsAccountId),
          eq(awsAccount.organizationId, input.organizationId)
        )
      );
  });
}

/**
 * Adds (or replaces, by identity string) one identity in the snapshot. Does not
 * touch identitiesScannedAt, which the refresh claim owns.
 */
export async function upsertSnapshotIdentity(input: {
  organizationId: string;
  awsAccountId: string;
  identity: SnapshotIdentity;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ features: awsAccount.features })
      .from(awsAccount)
      .where(
        and(
          eq(awsAccount.id, input.awsAccountId),
          eq(awsAccount.organizationId, input.organizationId)
        )
      )
      .for("update");
    if (!row) {
      return;
    }

    const existing = row.features?.email?.identities ?? [];
    const replaced = existing.some(
      (i) => i.identity === input.identity.identity
    );
    const identities = replaced
      ? existing.map((i) =>
          i.identity === input.identity.identity ? input.identity : i
        )
      : [...existing, input.identity];

    await tx
      .update(awsAccount)
      .set({
        features: mergeIdentities(row.features, identities),
        emailEnabled: true,
        updatedAt: now,
      })
      .where(
        and(
          eq(awsAccount.id, input.awsAccountId),
          eq(awsAccount.organizationId, input.organizationId)
        )
      );
  });
}

export type StackEmailFeatures = {
  configSetName?: string;
  eventTrackingEnabled?: boolean;
  eventHistoryEnabled?: boolean;
  archivingEnabled?: boolean;
  archiveArn?: string;
};

/**
 * Overlays what a CloudFormation stack reports onto features.email, leaving
 * every other key (sms, sandbox, identities, trackingBySet, ...) in place.
 * Keys whose value is undefined are skipped, so a stack without an output
 * never erases a value the feature scan stored.
 */
export async function applyStackEmailFeatures(input: {
  organizationId: string;
  awsAccountId: string;
  stack: StackEmailFeatures;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ features: awsAccount.features })
      .from(awsAccount)
      .where(
        and(
          eq(awsAccount.id, input.awsAccountId),
          eq(awsAccount.organizationId, input.organizationId)
        )
      )
      .for("update");
    if (!row) {
      return;
    }

    const overlay = Object.fromEntries(
      Object.entries(input.stack).filter(([, v]) => v !== undefined)
    );
    const merged: Features = {
      ...(row.features ?? {}),
      email: { ...(row.features?.email ?? {}), ...overlay },
    };
    await tx
      .update(awsAccount)
      .set({
        features: merged,
        emailEnabled:
          (merged.email?.identities?.length ?? 0) > 0 ||
          !!merged.email?.configSetName,
        updatedAt: now,
      })
      .where(
        and(
          eq(awsAccount.id, input.awsAccountId),
          eq(awsAccount.organizationId, input.organizationId)
        )
      );
  });
}
