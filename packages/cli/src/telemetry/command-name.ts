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
 * Routed commands whose second positional is user data, not a subcommand.
 *
 * `case "push"` (cli.ts) is the alias for `email templates push`: it passes
 * `sub[1]` to `templatesPush` as the template slug. Slugs are lowercase-hyphen
 * by convention — exactly COMMAND_WORD's shape — so the shape guard above lets
 * a customer's internal template name through verbatim, on the success path as
 * well as the error path. These commands report under their bare name.
 */
const COMMANDS_WITH_DATA_SECOND_POSITIONAL: readonly string[] = ["push"];

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

  if (
    !subCommand ||
    COMMANDS_WITH_DATA_SECOND_POSITIONAL.includes(primaryCommand)
  ) {
    return primaryCommand;
  }

  return COMMAND_WORD.test(subCommand)
    ? `${primaryCommand}:${subCommand}`
    : `${primaryCommand}:${UNKNOWN}`;
}
