/**
 * Console-policy version probe
 *
 * `probeConsolePolicyVersion` figures out which version of the
 * `wraps-console-access-role` policy a customer's role carries by probing
 * read-only marker actions in the chronological order they were granted
 * (see plan 282), stopping at the first failure because the ladder is
 * monotonic.
 *
 * The function under test takes an already-built SDK client, so no SDK mock
 * is needed at module scope — a stub `{ send }` that dispatches on
 * `args[0].constructor.name` is enough. If this file needs `vi.mock` for
 * `../lib/sentry` or `@wraps/db` to run, the import-cycle fix in step 3 of
 * plan 282 was not done as written: `isRoleAccessError` must come from
 * `../lib/role-access-error`, not from the worker.
 */

import { describe, expect, it } from "vitest";
import {
  CURRENT_CONSOLE_POLICY_VERSION,
  probeConsolePolicyVersion,
} from "../lib/console-policy-version";

function accessDeniedError(): Error {
  const error = new Error("User is not authorized to perform this action");
  error.name = "AccessDeniedException";
  return error;
}

function throttlingError(): Error {
  const error = new Error("Rate exceeded");
  error.name = "ThrottlingException";
  return error;
}

/** A stub SESv2Client whose `send` resolves/rejects per command class name. */
function stubClient(handlers: Partial<Record<string, () => unknown>>): {
  send: (command: { constructor: { name: string } }) => Promise<unknown>;
} {
  return {
    send: async (command) => {
      const name = command.constructor.name;
      const handler = handlers[name];
      if (!handler) {
        throw new Error(`stubClient: no handler registered for ${name}`);
      }
      const result = handler();
      if (result instanceof Error) {
        throw result;
      }
      return result;
    },
  };
}

describe("probeConsolePolicyVersion", () => {
  it("returns version 5 when all five markers succeed", async () => {
    const client = stubClient({
      GetAccountCommand: () => ({}),
      ListEmailIdentitiesCommand: () => ({}),
      ListEmailTemplatesCommand: () => ({}),
      ListConfigurationSetsCommand: () => ({}),
      ListSuppressedDestinationsCommand: () => ({}),
    });

    const result = await probeConsolePolicyVersion(
      client as unknown as Parameters<typeof probeConsolePolicyVersion>[0]
    );

    expect(result).toEqual({ version: 5, unreachable: false });
  });

  it("returns version 4 when the v5 marker is denied (a role that predates the suppressions merge)", async () => {
    const client = stubClient({
      GetAccountCommand: () => ({}),
      ListEmailIdentitiesCommand: () => ({}),
      ListEmailTemplatesCommand: () => ({}),
      ListConfigurationSetsCommand: () => ({}),
      ListSuppressedDestinationsCommand: () => accessDeniedError(),
    });

    const result = await probeConsolePolicyVersion(
      client as unknown as Parameters<typeof probeConsolePolicyVersion>[0]
    );

    expect(result).toEqual({ version: 4, unreachable: false });
  });

  it("returns version 3 when the v4 marker is denied (the Propiedata case)", async () => {
    const client = stubClient({
      GetAccountCommand: () => ({}),
      ListEmailIdentitiesCommand: () => ({}),
      ListEmailTemplatesCommand: () => ({}),
      ListConfigurationSetsCommand: () => accessDeniedError(),
    });

    const result = await probeConsolePolicyVersion(
      client as unknown as Parameters<typeof probeConsolePolicyVersion>[0]
    );

    expect(result).toEqual({ version: 3, unreachable: false });
  });

  it("stops at the first failure and never sends later rungs", async () => {
    let templatesSent = false;
    let configSetsSent = false;
    const client = stubClient({
      GetAccountCommand: () => ({}),
      ListEmailIdentitiesCommand: () => accessDeniedError(),
      ListEmailTemplatesCommand: () => {
        templatesSent = true;
        return {};
      },
      ListConfigurationSetsCommand: () => {
        configSetsSent = true;
        return {};
      },
    });

    const result = await probeConsolePolicyVersion(
      client as unknown as Parameters<typeof probeConsolePolicyVersion>[0]
    );

    expect(result).toEqual({ version: 1, unreachable: false });
    expect(templatesSent).toBe(false);
    expect(configSetsSent).toBe(false);
  });

  it("returns version 0 when even the v1 marker is denied, sending nothing further", async () => {
    let identitiesSent = false;
    const client = stubClient({
      GetAccountCommand: () => accessDeniedError(),
      ListEmailIdentitiesCommand: () => {
        identitiesSent = true;
        return {};
      },
    });

    const result = await probeConsolePolicyVersion(
      client as unknown as Parameters<typeof probeConsolePolicyVersion>[0]
    );

    expect(result).toEqual({ version: 0, unreachable: false });
    expect(identitiesSent).toBe(false);
  });

  it("reports unreachable rather than a missing permission on a throttle", async () => {
    const client = stubClient({
      GetAccountCommand: () => throttlingError(),
    });

    const result = await probeConsolePolicyVersion(
      client as unknown as Parameters<typeof probeConsolePolicyVersion>[0]
    );

    expect(result).toEqual({ version: 0, unreachable: true });
  });

  it("classifies an AccessDenied error arriving as name:'Error' as an access error, not unreachable", async () => {
    const err = new Error("AccessDenied: not authorized");
    // AWS SDK v3 sometimes returns the real code only in the message, with
    // `name` left as the generic "Error" — the classifier must still catch it.
    expect(err.name).toBe("Error");

    const client = stubClient({
      GetAccountCommand: () => ({}),
      ListEmailIdentitiesCommand: () => err,
    });

    const result = await probeConsolePolicyVersion(
      client as unknown as Parameters<typeof probeConsolePolicyVersion>[0]
    );

    // The version dropped (stopped at rung 1) rather than being reported as
    // an unreachable/transport failure.
    expect(result).toEqual({ version: 1, unreachable: false });
  });

  it("returns unreachable rather than throwing on a plain TypeError", async () => {
    const client = {
      send: () => {
        throw new TypeError("cannot read property of undefined");
      },
    };

    const result = await probeConsolePolicyVersion(
      client as unknown as Parameters<typeof probeConsolePolicyVersion>[0]
    );

    expect(result).toEqual({ version: 0, unreachable: true });
  });

  it("CURRENT_CONSOLE_POLICY_VERSION matches the number of rungs in the ladder", async () => {
    const client = stubClient({
      GetAccountCommand: () => ({}),
      ListEmailIdentitiesCommand: () => ({}),
      ListEmailTemplatesCommand: () => ({}),
      ListConfigurationSetsCommand: () => ({}),
      ListSuppressedDestinationsCommand: () => ({}),
    });

    const result = await probeConsolePolicyVersion(
      client as unknown as Parameters<typeof probeConsolePolicyVersion>[0]
    );

    // A guard against adding a rung without bumping the constant: if the
    // ladder grows, the all-succeed case above should climb with it.
    expect(result.version).toBe(CURRENT_CONSOLE_POLICY_VERSION);
    expect(CURRENT_CONSOLE_POLICY_VERSION).toBe(5);
  });

  it("sends the ladder in chronological order — GetAccountCommand (rung 1) before ListEmailIdentitiesCommand (rung 2), and ListSuppressedDestinationsCommand (rung 5) last", async () => {
    // Rungs 1 and 2 are NOT interchangeable: ses:ListEmailIdentities landed
    // five weeks after ses:GetAccount, so a CFN role created in that window
    // carries the first and not the second. Swapping them would still pass
    // the "all five succeed" case above, so the order must be asserted
    // directly against what gets sent.
    const sentOrder: string[] = [];
    const client = {
      send: async (command: { constructor: { name: string } }) => {
        sentOrder.push(command.constructor.name);
        return {};
      },
    };

    await probeConsolePolicyVersion(
      client as unknown as Parameters<typeof probeConsolePolicyVersion>[0]
    );

    expect(sentOrder[0]).toBe("GetAccountCommand");
    expect(sentOrder[1]).toBe("ListEmailIdentitiesCommand");
    expect(sentOrder.at(-1)).toBe("ListSuppressedDestinationsCommand");
  });
});
