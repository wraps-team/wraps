/**
 * Structured remediations for doctor findings.
 *
 * A finding used to carry a hand-written sentence guessing at its own remedy,
 * and nothing connected the guess to a command that could actually repair it.
 * `wraps email doctor` recommended `--cleanup` on every failure even though
 * `--cleanup` only ever deleted orphans; `event-pipeline-check.ts` interpolated
 * one `UPGRADE_HINT` const into sixteen messages spanning nine resource classes.
 *
 * A remediation is therefore a value produced WITH a finding and parameterised
 * by state — never a static property of a check. "SES configuration set not
 * found" has three different correct remedies depending on whether the domain
 * is the Pulumi-managed primary, an additional domain whose config set is
 * recorded in metadata, or an additional domain that was never migrated.
 */

export type RemediationLevel =
  /** A non-destructive Wraps command reliably repairs this class of failure. */
  | "auto"
  /**
   * A human must act or decide. Covers destructive operations, actions outside
   * the CLI, and — critically — any finding whose cause is "AWS and local
   * metadata disagree", because every repair path rebuilds the desired state
   * FROM that suspect metadata.
   */
  | "manual"
  /** Nothing to run. The finding is a statement of fact. */
  | "informational";

export type Remediation = {
  /**
   * Stable machine key. Never rendered to the user. Safe for telemetry: it
   * carries no domain, account id, or resource name.
   */
  id: string;
  level: RemediationLevel;
  /**
   * Full command line the user can paste, arguments included. A bare command
   * name is what sent the incident's user into an interactive menu.
   * Absent when `level === "informational"`, and optional for `"manual"`.
   */
  command?: string;
  /** One sentence in the imperative, describing what running it does. */
  summary: string;
};

/**
 * The shared doctor row. Both doctors adapt their file-local shapes to this at
 * the edges (the way `pipelineChecksToDoctorResults` already does) rather than
 * one silently widening into the other.
 */
export type DoctorFinding = {
  status: "pass" | "warn" | "fail" | "info";
  category: string;
  name: string;
  details?: string;
  remediation?: Remediation;
};

/**
 * Every repair command re-resolves its own region, and the fallback at the end
 * of that resolution is a hardcoded us-east-1 (`getAWSRegion()`). Both
 * doctors go out of their way NOT to use that fallback — they scan the region
 * an email connection is actually deployed in — so a remedy that omits
 * `--region` throws away the one thing the report knew and sends the user to a
 * region with nothing in it. The region is threaded in as a suffix rather than
 * baked into each string so the telemetry-safe `id` stays constant.
 */
function withRegion(command: string, region?: string): string {
  return region ? `${command} --region ${region}` : command;
}

export const remediations = {
  /**
   * The Pulumi-managed stack owns this resource. `wraps email sync` is a
   * fallthrough alias of `wraps email config` and performs a real
   * `stack.refresh()` + `stack.up()`.
   */
  syncStack: (region?: string): Remediation => ({
    id: "email.sync",
    level: "auto",
    command: withRegion("wraps email sync", region),
    summary:
      "Reconcile the Pulumi-managed email stack against AWS — this recreates resources the stack owns.",
  }),
  /**
   * Additional domains' configuration sets are created imperatively, never by
   * Pulumi. Re-running the add flow is the idempotent repair: it adopts the
   * existing SES identity, recreates the configuration set swallowing
   * AlreadyExistsException, recreates the event destination, and re-associates
   * the identity.
   */
  reAddDomain: (domain: string, region?: string): Remediation => ({
    id: "email.domains.add",
    level: "auto",
    command: withRegion(`wraps email domains add --domain ${domain}`, region),
    summary:
      "Re-run the domain setup — it adopts the existing SES identity and recreates the missing configuration set.",
  }),

  /**
   * An additional domain with no `configSetName` in metadata was never
   * migrated to a per-domain configuration set. `wraps email upgrade` filters
   * to exactly that set, and `--action` skips the interactive menu entirely.
   */
  migratePerDomainConfigSets: (region?: string): Remediation => ({
    id: "email.upgrade.per-domain-config-sets",
    level: "auto",
    command: withRegion(
      "wraps email upgrade --action per-domain-config-sets",
      region
    ),
    summary:
      "Create per-domain configuration sets for additional domains that do not have one yet.",
  }),

  /**
   * NEVER carries a command. When AWS and local metadata disagree, every
   * redeploy path rebuilds the stack from the metadata that is already wrong:
   * `buildEmailStackConfig` reconstructs the webhook solely from
   * `emailService?.webhookSecret` and `config.ts` calls it with no overrides,
   * so a redeploy in this state DELETES the target that exists in AWS and
   * reports success.
   */
  metadataDivergence: (): Remediation => ({
    id: "email.metadata-divergence",
    level: "manual",
    summary:
      "AWS and the local connection metadata disagree. Do not redeploy — a redeploy rebuilds the stack from this metadata and deletes the resource that exists in AWS. Inspect ~/.wraps/connections and reconnect deliberately.",
  }),

  /** Dead-lettered events are not replayed by any Wraps command. */
  dlqBacklog: (): Remediation => ({
    id: "email.dlq-backlog",
    level: "manual",
    summary:
      "Inspect the dead-lettered events before they age out — nothing replays them automatically.",
  }),

  /** Extra targets on the rule deliver every event again; removal is manual. */
  duplicateRuleTargets: (): Remediation => ({
    id: "email.duplicate-rule-targets",
    level: "manual",
    summary:
      "Remove the extra EventBridge target(s) — each duplicate delivers every event a second time.",
  }),

  /** A check that could not complete is usually a missing IAM permission. */
  reviewPermissions: (): Remediation => ({
    id: "aws.permissions",
    level: "manual",
    command: "wraps permissions",
    summary:
      "The check could not complete — compare your IAM policy against the permissions Wraps needs.",
  }),

  /**
   * Destructive: deletes wraps-* resources. Declared `manual` for that reason,
   * and only ever attached to orphan findings — never to an Event Pipeline
   * finding, which is what `--cleanup` was wrongly advertised for.
   */
  cleanupOrphans: (region?: string): Remediation => ({
    id: "email.doctor.cleanup-orphans",
    level: "manual",
    command: withRegion("wraps email doctor --cleanup", region),
    summary:
      "Delete the wraps-* resources left behind with no Pulumi state. This permanently removes them.",
  }),

  // --- aws doctor ---

  installAwsCli: (): Remediation => ({
    id: "aws.cli.install",
    level: "manual",
    summary:
      "Install the AWS CLI: brew install awscli on macOS, or https://aws.amazon.com/cli/",
  }),

  configureAwsCredentials: (): Remediation => ({
    id: "aws.setup",
    level: "manual",
    command: "wraps aws setup",
    summary: "Walk through the interactive AWS credential setup.",
  }),

  /**
   * `loginCommand` comes from `getSSOLoginCommand()` — it is an `aws` command,
   * not a `wraps` one, which is why the registry invariant test only validates
   * commands that begin with "wraps ".
   */
  ssoLogin: (loginCommand: string): Remediation => ({
    id: "aws.sso.login",
    level: "manual",
    command: loginCommand,
    summary: "Refresh the SSO session; it opens a browser.",
  }),

  setAwsRegion: (): Remediation => ({
    id: "aws.region",
    level: "informational",
    summary:
      "Set AWS_REGION so commands stop falling back to a default region.",
  }),

  /**
   * Replaces the pre-existing wrong hint in the aws doctor, which suggested
   * `wraps email check` — a deliverability audit that cannot request
   * production access.
   */
  requestSesProductionAccess: (): Remediation => ({
    id: "aws.ses.sandbox",
    level: "manual",
    summary:
      "Request SES production access in the AWS console — sandbox accounts can only send to verified addresses.",
  }),

  setAwsProfile: (profileNames: string[]): Remediation => ({
    id: "aws.profile",
    level: "informational",
    summary: `Set AWS_PROFILE to one of: ${profileNames.join(", ")}`,
  }),

  awsEnvVarsIncomplete: (): Remediation => ({
    id: "aws.env-vars-incomplete",
    level: "informational",
    summary:
      "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must both be set, or neither.",
  }),
};

/**
 * Uncolored one-line rendering. Text renderers colorize the command themselves
 * (pc.cyan) rather than calling this; this is for JSON string arrays such as
 * the aws doctor's `suggestions[]`.
 */
export function formatRemediation(remediation: Remediation): string {
  return remediation.command
    ? `${remediation.command} — ${remediation.summary}`
    : remediation.summary;
}

/**
 * An id names the KIND of repair and is deliberately constant — it is the
 * telemetry key, so it must never carry a domain or a profile name. A
 * parameterised factory therefore emits one id over many command lines:
 * `reAddDomain("a.com")` and `reAddDomain("b.com")` are both
 * `email.domains.add`, and each is a separate thing the user has to run.
 * Deduping on the id alone kept the first and silently dropped the rest, so
 * the Suggested-fixes block contradicted the per-row `fix:` lines above it.
 * Pairing id with command collapses genuine repeats (a stack failure on eight
 * hops is still one `wraps email sync`) while keeping parameterisations apart.
 */
function dedupeKey(remediation: Remediation): string {
  return `${remediation.id}\u0000${remediation.command ?? ""}`;
}

/**
 * Distinct remediations from a set of findings, first-seen order, deduped by
 * id and command together.
 */
export function collectRemediations(
  findings: readonly DoctorFinding[]
): Remediation[] {
  const seen = new Map<string, Remediation>();
  for (const finding of findings) {
    if (!finding.remediation) {
      continue;
    }
    const key = dedupeKey(finding.remediation);
    if (!seen.has(key)) {
      seen.set(key, finding.remediation);
    }
  }
  return [...seen.values()];
}
