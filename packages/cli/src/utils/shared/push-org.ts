import * as clack from "@clack/prompts";
import pc from "picocolors";
import type { ApiTarget } from "./api-target.js";
import type { OrgInfo } from "./config.js";
import { WrapsError } from "./errors.js";
import { isJsonMode } from "./json-output.js";

function findOrg(orgs: OrgInfo[], needle: string): OrgInfo | undefined {
  const lower = needle.toLowerCase();
  return (
    orgs.find((o) => o.slug.toLowerCase() === lower) ||
    orgs.find((o) => o.id.toLowerCase() === lower)
  );
}

/**
 * Which organization a push writes to. Session tokens honour
 * `X-Organization-Id`; without it the API falls back to whichever org the
 * user last had active in the dashboard, so push must always send one.
 * API keys carry their own org, so there is nothing to choose.
 */
export async function resolvePushOrg(params: {
  target: ApiTarget;
  flagOrg?: string;
  configOrg: string;
  yes?: boolean;
}): Promise<OrgInfo | null> {
  const { target, flagOrg, configOrg, yes } = params;

  if (!target.token) {
    return null;
  }

  if (target.tokenType === "api-key") {
    if (flagOrg && !isJsonMode()) {
      clack.log.warn(
        "--org is ignored when authenticating with an API key — the key's organization is used."
      );
    }
    return null;
  }

  const orgs = target.organizations;
  if (!orgs || orgs.length === 0) {
    if (!isJsonMode()) {
      clack.log.info(
        'Organization list not available — run "wraps auth login" to refresh it. Pushing to your active organization.'
      );
    }
    return null;
  }

  const wanted = flagOrg || configOrg;
  const match = findOrg(orgs, wanted);

  if (match) {
    if (
      flagOrg &&
      flagOrg.toLowerCase() !== configOrg.toLowerCase() &&
      configOrg.toLowerCase() !== match.slug.toLowerCase() &&
      configOrg.toLowerCase() !== match.id.toLowerCase() &&
      !isJsonMode()
    ) {
      clack.log.warn(
        `Pushing to ${match.name} (${match.slug}) — wraps.config.ts declares "${configOrg}".`
      );
    }
    return match;
  }

  if (isJsonMode() || yes) {
    throw new WrapsError(
      `No organization "${wanted}" in your account`,
      "ORG_NOT_FOUND",
      `Available: ${orgs.map((o) => o.slug).join(", ")}. Pass --org <slug>, fix org in wraps/wraps.config.ts, or run "wraps auth login" if you joined it recently.`
    );
  }

  clack.log.warn(`No organization "${wanted}" in your account.`);

  // Always ask, even with a single org: a placeholder like 'my-org' must
  // never resolve silently.
  const selected = await clack.select({
    message: "Which organization should this push go to?",
    options: orgs.map((org) => ({
      value: org.id,
      label: org.name,
      hint: org.slug,
    })),
  });

  if (clack.isCancel(selected)) {
    clack.cancel("Operation cancelled.");
    process.exit(0);
  }

  const picked = orgs.find((o) => o.id === selected) ?? null;
  if (picked) {
    clack.log.info(
      `Set ${pc.cyan(`org: '${picked.slug}'`)} in wraps/wraps.config.ts to skip this prompt.`
    );
  }
  return picked;
}
