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
 * Routed pairs whose *third* positional is user data, not a subcommand.
 *
 * `wraps email check <domain>` (cli.ts:641) reads `sub[2]` as the domain to
 * audit. A bare hostname can be word-shaped (`acme`), so COMMAND_WORD alone
 * would let it through — this list is what stops it.
 *
 * Every other `sub[2]` in cli.ts selects a subcommand, so this stays a
 * one-entry list until a command starts reading data from that position.
 */
const PAIRS_WITH_DATA_THIRD_POSITIONAL: readonly string[] = ["email:check"];

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
  subCommand?: string,
  thirdPositional?: string
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

  if (!COMMAND_WORD.test(subCommand)) {
    return `${primaryCommand}:${UNKNOWN}`;
  }

  const pair = `${primaryCommand}:${subCommand}`;

  // A failure thrown before the handler runs is named here, so without the
  // third token every `email domains *` rejection collapsed into
  // `email:domains` and the dashboard could not tell which subcommand died.
  // An unusable token is dropped rather than reported as ":unknown" — the pair
  // on its own is the more accurate name.
  if (
    !(thirdPositional && COMMAND_WORD.test(thirdPositional)) ||
    PAIRS_WITH_DATA_THIRD_POSITIONAL.includes(pair)
  ) {
    return pair;
  }

  return `${pair}:${thirdPositional}`;
}
