import { and, db, eq } from "../index";
import { domainAuthCheck } from "../schema/app";

export type DomainAuthObservation = {
  recordKind: "dkim" | "mailfrom_mx" | "mailfrom_spf" | "dmarc";
  recordName: string;
  status: "verified" | "incorrect" | "missing" | "unknown";
  found: string[];
};

export type DomainAuthRecordState = {
  recordKind: DomainAuthObservation["recordKind"];
  recordName: string;
  status: "verified" | "incorrect" | "missing" | "unknown";
  found: string[];
  drifted: boolean; // regressed from verified on THIS check, or still in a drifted state
  lastVerifiedAt: Date | null;
  driftedAt: Date | null;
};

/**
 * Persists the latest live-DNS observation for each record of one sending
 * identity and reports drift. An "unknown" observation (resolver failure)
 * writes nothing: not being able to tell must never create, clear or trigger
 * drift. Every query is scoped by organizationId as well as awsAccountId.
 */
export async function recordDomainAuthCheck(input: {
  organizationId: string;
  awsAccountId: string;
  identity: string;
  observations: DomainAuthObservation[];
  now?: Date;
}): Promise<DomainAuthRecordState[]> {
  const { organizationId, awsAccountId, identity, observations } = input;
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(domainAuthCheck)
      .where(
        and(
          eq(domainAuthCheck.organizationId, organizationId),
          eq(domainAuthCheck.awsAccountId, awsAccountId),
          eq(domainAuthCheck.identity, identity)
        )
      );
    const prior = new Map(
      existing.map((row) => [`${row.recordKind}:${row.recordName}`, row])
    );

    const states: DomainAuthRecordState[] = [];

    for (const obs of observations) {
      const previous = prior.get(`${obs.recordKind}:${obs.recordName}`);

      if (obs.status === "unknown") {
        states.push({
          recordKind: obs.recordKind,
          recordName: obs.recordName,
          status: previous?.status ?? "unknown",
          found: previous?.found ?? [],
          drifted: previous ? previous.driftedAt !== null : false,
          lastVerifiedAt: previous?.lastVerifiedAt ?? null,
          driftedAt: previous?.driftedAt ?? null,
        });
        continue;
      }

      const lastVerifiedAt =
        obs.status === "verified" ? now : (previous?.lastVerifiedAt ?? null);
      let driftedAt: Date | null;
      if (obs.status === "verified") {
        driftedAt = null;
      } else if (previous?.status === "verified") {
        driftedAt = now;
      } else {
        driftedAt = previous?.driftedAt ?? null;
      }

      await tx
        .insert(domainAuthCheck)
        .values({
          organizationId,
          awsAccountId,
          identity,
          recordKind: obs.recordKind,
          recordName: obs.recordName,
          status: obs.status,
          found: obs.found,
          checkedAt: now,
          lastVerifiedAt,
          driftedAt,
        })
        .onConflictDoUpdate({
          target: [
            domainAuthCheck.organizationId,
            domainAuthCheck.awsAccountId,
            domainAuthCheck.identity,
            domainAuthCheck.recordKind,
            domainAuthCheck.recordName,
          ],
          set: {
            status: obs.status,
            found: obs.found,
            checkedAt: now,
            lastVerifiedAt,
            driftedAt,
          },
        });

      states.push({
        recordKind: obs.recordKind,
        recordName: obs.recordName,
        status: obs.status,
        found: obs.found,
        drifted: driftedAt !== null,
        lastVerifiedAt,
        driftedAt,
      });
    }

    return states;
  });
}
