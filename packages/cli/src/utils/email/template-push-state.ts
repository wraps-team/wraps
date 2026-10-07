import type { LockfileTemplateEntry } from "../shared/lockfile.js";

/**
 * Whether a template can be skipped on push. When a dashboard is configured,
 * the dashboard must also have accepted this exact source, so a sync that
 * failed last time is retried.
 */
export function isTemplateUnchanged(input: {
  entry: LockfileTemplateEntry | undefined;
  sourceHash: string;
  existsRemotely: boolean;
  dashboardConfigured: boolean;
  force: boolean;
}): boolean {
  const { entry, sourceHash, existsRemotely, dashboardConfigured, force } =
    input;
  if (force || !entry || entry.localHash !== sourceHash || !existsRemotely) {
    return false;
  }
  return !dashboardConfigured || entry.remoteHash === sourceHash;
}

/**
 * The lockfile entry to write after a push, or undefined to leave the
 * existing entry untouched (nothing reached any target).
 * remoteHash and id only advance when the dashboard accepted the template.
 */
export function nextTemplateEntry(input: {
  previous: LockfileTemplateEntry | undefined;
  sourceHash: string;
  sesTemplateName: string;
  sesOk: boolean;
  apiResult: { success: boolean; id?: string } | undefined;
  now: string;
}): LockfileTemplateEntry | undefined {
  const { previous, sourceHash, sesTemplateName, sesOk, apiResult, now } =
    input;
  const apiOk = apiResult?.success === true;
  if (!(sesOk || apiOk)) {
    return;
  }
  return {
    id: apiOk ? apiResult?.id : previous?.id,
    localHash: sourceHash,
    remoteHash: apiOk ? sourceHash : previous?.remoteHash,
    sesTemplateName,
    lastPushed: now,
  };
}
