/**
 * Standardized JSON output for CLI commands.
 *
 * Envelope format matches gh, kubectl, terraform conventions:
 * - Errors go to stdout as JSON (exit code still signals failure)
 * - All output wrapped in { success, command, data?, error? }
 */

/** JSON output envelope */
export type JsonOutput = {
  success: boolean;
  command: string;
  data?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    suggestion?: string;
    docsUrl?: string;
  };
};

let _jsonMode = false;

/** Check if JSON output mode is active */
export function isJsonMode(): boolean {
  return _jsonMode;
}

/** Set JSON output mode (called once from cli.ts after flag parsing) */
export function setJsonMode(enabled: boolean): void {
  _jsonMode = enabled;
}

/** Print a success JSON envelope and return (caller should exit or return) */
export function jsonSuccess(
  command: string,
  data: Record<string, unknown>
): void {
  const output: JsonOutput = { success: true, command, data };
  console.log(JSON.stringify(output));
}

/** Print an error JSON envelope (caller should exit after) */
export function jsonError(
  command: string,
  error: {
    code: string;
    message: string;
    suggestion?: string;
    docsUrl?: string;
  },
  /** Values a failed command must still hand back (e.g. a newly generated secret). */
  data?: Record<string, unknown>
): void {
  const output: JsonOutput = {
    success: false,
    command,
    error,
    ...(data ? { data } : {}),
  };
  console.log(JSON.stringify(output));
}
