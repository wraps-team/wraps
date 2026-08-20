import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The hosted API deploy had no migration step at all, so every schema change
// reached production only if someone remembered to run `db:migrate` by hand.
// batch_send.paused_at is what happened when nobody did: the column and the
// broadcast-reaper query that reads it shipped in the same commit, the Lambda
// went live, and the reaper threw `column batch_send.paused_at does not exist`
// on every run until the migration was applied out of band.
//
// The step exists now, and lives in migrate.yml rather than inline in the
// deploy so that a broken api build or an expired AWS role cannot stop it from
// running — apps/web ships on the same commit through Vercel's git integration
// whether the API deploy succeeds or not, so the migration must not be hostage
// to anything but itself.
//
// scripts/selfhost/upgrade.ts already learned the ordering; this file holds the
// same guarantee for the hosted pipeline.
const workflowDir = new URL("../.github/workflows/", import.meta.url);
const read = (name: string) =>
  readFileSync(new URL(name, workflowDir), "utf-8");

const apiWorkflow = read("deploy-api.yml");
const migrateWorkflow = read("migrate.yml");

// Job bodies, so an assertion about one job cannot be satisfied by another
// job's text. Jobs are the 2-space keys under `jobs:`; a job ends at the next
// one. The sentinel gives the last job something to end at.
const JOB_SENTINEL = "\n  end-of-file:\n";
function jobBlock(source: string, name: string): string {
  const matched = (source + JOB_SENTINEL).match(
    new RegExp(`^ {2}${name}:\\n([\\s\\S]*?)(?=\\n {2}[a-z])`, "m")
  );
  if (!matched) {
    throw new Error(`no \`${name}:\` job in the workflow`);
  }
  return matched[0];
}

// Regex literals live at the top level: they are compiled once, and having the
// exact strings side by side makes it obvious that each one is anchored to a
// YAML key rather than to the prose in the comments above it.
const USES_MIGRATE_WORKFLOW =
  /^\s+uses: \.\/\.github\/workflows\/migrate\.yml$/m;
const NEEDS_MIGRATE = /^\s+needs: migrate$/m;
const MIGRATE_CONCURRENCY_GROUP = /^\s+group: db-migrate-/m;
const DEPLOY_CONCURRENCY_GROUP = /^\s+group: deploy-sst-/m;
const NEVER_CANCEL_IN_PROGRESS = /^\s+cancel-in-progress: false$/m;
const DATABASE_URL_FROM_SECRETS = /^\s+DATABASE_URL: \$\{\{ secrets\./m;
const DECLARES_ENVIRONMENT = /^\s+environment: /m;

describe("the production migration gate", () => {
  it("runs migrations before the API deploy, as a dependency it cannot skip", () => {
    // `sst deploy` publishes each Lambda's new code as that function updates,
    // well before the command returns, so migrating afterwards still leaves a
    // window where new code runs against the old schema. Ordering is the whole
    // guarantee — and a `needs:` is a stronger one than step order, because a
    // failed migration now stops the deploy from starting at all.
    //
    // This order also fails the better way round: a migration that dies leaves
    // the old code on the old schema, which works. The other order leaves new
    // code on the old schema, which does not.
    expect(jobBlock(apiWorkflow, "migrate")).toMatch(USES_MIGRATE_WORKFLOW);
    expect(jobBlock(apiWorkflow, "deploy")).toMatch(NEEDS_MIGRATE);
  });

  it("keeps one owner of production migrations", () => {
    // Two workflows migrating means two `drizzle-kit migrate` runs racing each
    // other against Neon, which is a worse failure than the one this file
    // exists to prevent. Any new deploy path must call migrate.yml rather than
    // add its own step.
    const owners = readdirSync(workflowDir)
      .filter((name) => name.endsWith(".yml"))
      .filter((name) => read(name).includes("db:migrate"));

    expect(owners).toEqual(["migrate.yml"]);
  });

  it("serialises migrations so two deploys cannot migrate at once", () => {
    // Concurrency groups are shared across workflows, so this group name is
    // what makes a second caller wait rather than run a second migration
    // alongside the first. cancel-in-progress must stay false: a migration
    // killed halfway is the worst outcome available.
    const migrateJob = jobBlock(migrateWorkflow, "migrate");
    expect(migrateJob).toMatch(MIGRATE_CONCURRENCY_GROUP);
    expect(migrateJob).toMatch(NEVER_CANCEL_IN_PROGRESS);
  });

  it("serialises SST deploys against their shared Pulumi state", () => {
    const deployJob = jobBlock(apiWorkflow, "deploy");
    expect(deployJob).toMatch(DEPLOY_CONCURRENCY_GROUP);
    expect(deployJob).toMatch(NEVER_CANCEL_IN_PROGRESS);
  });

  it("gives the migration a database to connect to", () => {
    // drizzle-kit reads DATABASE_URL from the environment: its dotenv call
    // targets apps/web/.env.local, which does not exist on a CI runner, and
    // dotenv does not override an already-set variable anyway. A migrate step
    // without this mapping connects to an empty URL and fails the deploy.
    const migrateJob = jobBlock(migrateWorkflow, "migrate");
    expect(migrateJob).toMatch(DATABASE_URL_FROM_SECRETS);

    // DATABASE_URL is an environment secret on `Production`, not a repository
    // secret, so the job only receives it if it declares the environment.
    expect(migrateJob).toMatch(DECLARES_ENVIRONMENT);
  });
});
