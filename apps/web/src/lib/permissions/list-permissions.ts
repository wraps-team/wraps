import { db } from "@wraps/db";

export async function listUserAWSAccountPermissions(params: {
  userId: string;
  organizationId: string;
}) {
  // Get all AWS accounts in the org
  const awsAccounts = await db.query.awsAccount.findMany({
    where: (a, { eq }) => eq(a.organizationId, params.organizationId),
  });

  // Get user's org membership
  const membership = await db.query.member.findFirst({
    where: (m, { and, eq }) =>
      and(
        eq(m.userId, params.userId),
        eq(m.organizationId, params.organizationId)
      ),
  });

  // If owner, return all accounts with full permissions
  if (membership?.role === "owner") {
    return awsAccounts.map((account) => ({
      awsAccountId: account.id,
      awsAccountName: account.name,
      permissions: ["view", "send", "manage"],
      reason: "owner",
      expiresAt: null,
    }));
  }

  // Get explicit grants for non-owners
  const grants = await db.query.awsAccountPermission.findMany({
    where: (p, { eq }) => eq(p.userId, params.userId),
  });

  // Map grants to accounts
  return awsAccounts
    .map((account) => {
      const grant = grants.find((g) => g.awsAccountId === account.id);
      if (!grant) return null;

      // Filter out expired grants
      if (grant.expiresAt && grant.expiresAt < new Date()) return null;

      return {
        awsAccountId: account.id,
        awsAccountName: account.name,
        permissions: grant.permissions,
        reason: "explicit",
        expiresAt: grant.expiresAt,
      };
    })
    .filter(Boolean);
}
