/**
 * Telemetry identity for the command that ran.
 * @module telemetry/command-name
 */

import { TOP_LEVEL_COMMANDS } from "../utils/shared/did-you-mean.js";

/**
 * Placeholder for anything that is not a recognised command word.
 */
const UNKNOWN = "unknown";

/**
 * A routed subcommand is always a lowercase word: every `case` label in cli.ts
 * matches this. A domain, an email address, an ARN or an account id does not —
 * they carry `.`, `@`, `:` or leading digits.
 *
 * There is no machine-readable list of subcommands to check against (the only
 * list the CLI has is TOP_LEVEL_COMMANDS), so this bounds the token by shape
 * instead of by membership.
 */
const COMMAND_WORD = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * Build the name a command is reported under, from the raw positionals.
 *
 * The tokens come straight off argv, so on the unknown-command path they are
 * whatever the user typed — `wraps check acme-corp.com` yields
 * `["check", "acme-corp.com"]`. Both tokens end up in telemetry: as the event
 * name (`command:<name>`) and as the `command` property of `error:occurred`.
 * `trackCommand` scrubs only the metadata object, so without this the CLI
 * shipped customer domains and email addresses in event names — against a
 * first-run notice that promises it never collects them.
 */
export function telemetryCommandName(
  primaryCommand?: string,
  subCommand?: string
): string {
  if (
    !(
      primaryCommand &&
      (TOP_LEVEL_COMMANDS as readonly string[]).includes(primaryCommand)
    )
  ) {
    // The typo itself is dropped, not echoed: an unrouted first positional is
    // the one place a bare domain lands. The human-readable error still prints
    // exactly what was typed.
    return UNKNOWN;
  }

  if (!subCommand) {
    return primaryCommand;
  }

  return COMMAND_WORD.test(subCommand)
    ? `${primaryCommand}:${subCommand}`
    : `${primaryCommand}:${UNKNOWN}`;
}
