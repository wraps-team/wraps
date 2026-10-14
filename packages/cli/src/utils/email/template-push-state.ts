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
 * remoteHash and id only advance when the dashboard accepted the template; localHash only when SES did.
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
    localHash: sesOk ? sourceHash : (previous?.localHash ?? ""),
    remoteHash: apiOk ? sourceHash : previous?.remoteHash,
    sesTemplateName,
    lastPushed: now,
  };
}

/** What the dashboard said about one template in a push. */
export type TemplateApiResult = {
  slug: string;
  id?: string;
  success: boolean;
  /** The dashboard refused: the template was edited there since the last push. */
  conflict?: boolean;
  /** No dashboard is configured, so nothing was sent. Not a failure. */
  skipped?: boolean;
};

/**
 * Templates that may go to SES: everything the dashboard did not refuse as a
 * conflict. A conflicted template keeps whatever SES had, so a dashboard edit
 * is never replaced in SES while the dashboard still shows it.
 */
export function templatesForSes<T extends { slug: string }>(
  compiled: T[],
  apiResults: TemplateApiResult[]
): T[] {
  const conflicted = new Set(
    apiResults.filter((r) => r.conflict).map((r) => r.slug)
  );
  return compiled.filter((t) => !conflicted.has(t.slug));
}

export type TemplatePushSummary = {
  /** Reached SES (and the dashboard, if one is configured and accepted it). */
  pushed: string[];
  /** Refused by the dashboard; not sent to SES. */
  conflicts: string[];
  /** SES failed, or the dashboard sync failed for a reason other than a conflict. */
  failed: string[];
};

export function summarizeTemplatePush(input: {
  compiledSlugs: string[];
  sesResults: Array<{ slug: string; success: boolean }>;
  apiResults: TemplateApiResult[];
}): TemplatePushSummary {
  const summary: TemplatePushSummary = {
    pushed: [],
    conflicts: [],
    failed: [],
  };
  for (const slug of input.compiledSlugs) {
    const api = input.apiResults.find((r) => r.slug === slug);
    if (api?.conflict) {
      summary.conflicts.push(slug);
      continue;
    }
    const sesOk = input.sesResults.find((r) => r.slug === slug)?.success;
    const apiOk = api === undefined || api.success || api.skipped === true;
    if (sesOk && apiOk) {
      summary.pushed.push(slug);
    } else {
      summary.failed.push(slug);
    }
  }
  return summary;
}
