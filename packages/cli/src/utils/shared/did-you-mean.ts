/**
 * `wraps doctor` printed a bare `Unknown command: doctor` and threw
 * (cli.ts:1691, :1695). That was step 1 of the incident this feature exists to
 * prevent — the most natural thing to type was the one thing that did not work.
 *
 * This is also the CLI's first machine-readable list of routed commands. There
 * is no other one: `printCompletionScript` (utils/shared/completion.ts) is a
 * stale hand-written comment block and `showHelp` is a wall of console.log.
 * `doctor-remediation-registry.test.ts` asserts the list and cli.ts's dispatch
 * hold the same commands, in both directions.
 *
 * Suggestions are no longer the only consumer: `telemetryCommandName`
 * (telemetry/command-name.ts) gates the reported event name on membership
 * here, so a routed command missing below reports `command:unknown`.
 */
export const TOP_LEVEL_COMMANDS = [
  "auth",
  "aws",
  "cdn",
  "completion",
  "console",
  "destroy",
  "doctor",
  "email",
  "help",
  "license",
  "news",
  "permissions",
  "platform",
  "push",
  "selfhost",
  "sms",
  "status",
  "support",
  "telemetry",
  "update",
  "workflow",
] as const;

/** Levenshtein distance, iterative two-row form. */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, substitution);
    }
    previous = current;
  }
  return previous[b.length];
}

const MAX_DISTANCE = 2;

/**
 * Nearest routed command, or null when nothing is close enough.
 */
export function suggestCommand(
  input: string,
  known: readonly string[] = TOP_LEVEL_COMMANDS
): string | null {
  const needle = input.toLowerCase();
  if (needle === "") {
    return null;
  }

  /**
   * A routed command is never a typo for itself. `wraps license` and
   * `wraps selfhost` both reach the unknown-command branch when typed bare —
   * cli.ts:1168 and :1195 gate on `&& subCommand` and the global switch has no
   * case for either — so echoing the input back would advise re-running the
   * command that just failed.
   */
  const candidates = known.filter((candidate) => candidate !== needle);

  let prefixMatch: string | null = null;
  for (const candidate of candidates) {
    if (
      candidate.startsWith(needle) &&
      (prefixMatch === null || candidate.length < prefixMatch.length)
    ) {
      prefixMatch = candidate;
    }
  }
  if (prefixMatch) {
    return prefixMatch;
  }

  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const candidateDistance = distance(needle, candidate);
    if (candidateDistance < bestDistance) {
      best = candidate;
      bestDistance = candidateDistance;
    }
  }
  return bestDistance <= MAX_DISTANCE ? best : null;
}
