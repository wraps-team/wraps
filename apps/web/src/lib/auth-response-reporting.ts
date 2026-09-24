/** Codes a user causes (cancelled consent, stale tab) — worth a warning, not a page. */
const USER_CAUSED_CODES = new Set([
  "access_denied",
  "invalid_state",
  "state_mismatch",
  "please_restart_the_process",
]);

export type AuthResponseIssue =
  | { kind: "server_error"; status: number; path: string }
  | {
      kind: "error_redirect";
      code: string;
      level: "error" | "warning";
      path: string;
    };

export function classifyAuthResponse(
  requestUrl: string,
  response: Response
): AuthResponseIssue | undefined {
  const path = new URL(requestUrl).pathname;
  if (response.status >= 500) {
    return { kind: "server_error", status: response.status, path };
  }
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) return;
    const code = new URL(location, requestUrl).searchParams.get("error");
    if (!code) return;
    return {
      kind: "error_redirect",
      code,
      level: USER_CAUSED_CODES.has(code) ? "warning" : "error",
      path,
    };
  }
  return;
}
