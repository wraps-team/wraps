/**
 * Console-policy version probe: figures out which version of the
 * `wraps-console-access-role` policy a customer's role actually carries,
 * without asking IAM. The role has no `iam:*` actions at all, so IAM's own
 * policy-simulation API is not an option — granting the permission it needs
 * would require a policy change, which would need every stale role updated,
 * which is the problem this module exists to solve.
 *
 * Instead it probes actions the role *already has*, in the chronological
 * order they were granted (see plan 282 / `cloudformation/wraps-console-access-role.yaml`
 * history), and reads the version off which ones succeed. Because the ladder
 * is monotonic — each version is a strict superset of the last — it stops at
 * the first failure rather than probing every rung.
 *
 * Takes an already-built `SESv2Client` rather than credentials: the caller
 * (the account-health sweep) already has one, and building a second would
 * cost a second STS round-trip per account per hour for no gain.
 */

import {
  GetAccountCommand,
  ListConfigurationSetsCommand,
  ListEmailIdentitiesCommand,
  ListEmailTemplatesCommand,
  ListSuppressedDestinationsCommand,
  type SESv2Client,
} from "@aws-sdk/client-sesv2";
import { isRoleAccessError } from "./role-access-error";

/** The newest policy version this build knows how to probe for. */
export const CURRENT_CONSOLE_POLICY_VERSION = 5;

export type PolicyProbeResult = {
  /** Highest version whose marker action succeeded; 0 if even the baseline failed. */
  version: number;
  /** True when the answer is not a policy-version fact — throttled, timed out, or a transport error. */
  unreachable: boolean;
};

/**
 * SDK-v3 throttling/rate-limit errors, checked the same way
 * `isRoleAccessError` checks access errors: both `name` and `message`,
 * because some errors arrive as `name: "Error"` with the real code only in
 * the message.
 */
function isThrottlingError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "ThrottlingException" ||
    error.name === "TooManyRequestsException" ||
    error.message.includes("ThrottlingException") ||
    error.message.includes("TooManyRequestsException") ||
    error.message.includes("Rate exceeded")
  );
}

/**
 * Rungs of the ladder, in the chronological order the corresponding action
 * was granted to the CloudFormation and CLI-managed roles alike (see
 * "Current state" in plan 282). Do not reorder: rungs 1 and 2 are NOT
 * interchangeable — `ses:ListEmailIdentities` (rung 2) landed five weeks
 * after `ses:GetAccount` (rung 1), so a role created in that window has the
 * first and not the second.
 *
 * Rung 5 (`ses:ListSuppressedDestinations`) was granted by the suppressions
 * merge, `ed18a45b`, 2026-09-10 — see plan 299. It shipped before plan 282
 * itself landed, but the ladder didn't pick it up until 299, so a role
 * created any time up to and including that merge probes as version 4.
 */
const RUNGS: Array<{
  version: number;
  probe: (client: SESv2Client) => Promise<unknown>;
}> = [
  {
    version: 1,
    probe: (client) => client.send(new GetAccountCommand({})),
  },
  {
    version: 2,
    probe: (client) =>
      client.send(new ListEmailIdentitiesCommand({ PageSize: 1 })),
  },
  {
    version: 3,
    probe: (client) =>
      client.send(new ListEmailTemplatesCommand({ PageSize: 1 })),
  },
  {
    version: 4,
    probe: (client) =>
      client.send(new ListConfigurationSetsCommand({ PageSize: 1 })),
  },
  {
    version: 5,
    probe: (client) =>
      client.send(new ListSuppressedDestinationsCommand({ PageSize: 1 })),
  },
];

/**
 * Probes the ladder in ascending order, stopping at the first failure. Never
 * throws — the contract is that this function always returns a result, so a
 * caller on a hot production path never needs a try/catch around it.
 */
export async function probeConsolePolicyVersion(
  client: SESv2Client
): Promise<PolicyProbeResult> {
  let version = 0;
  for (const rung of RUNGS) {
    try {
      await rung.probe(client);
      version = rung.version;
    } catch (error) {
      if (isRoleAccessError(error)) {
        // This rung's marker action is not granted — the role is at the
        // last version that passed. That is a real, current fact.
        return { version, unreachable: false };
      }
      if (isThrottlingError(error)) {
        // Not a permission fact — do not lower or report a version.
        return { version: 0, unreachable: true };
      }
      // Any other failure — timeout, network, region outage, an SDK error
      // we don't recognize — must not be read as a missing permission
      // either. Telling a working customer their role is out of date is
      // worse than saying nothing.
      return { version: 0, unreachable: true };
    }
  }
  return { version, unreachable: false };
}
