import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// scripts/ci/deploy-gate.sh decides whether Deploy API's `deploy` job runs. It
// reads the newest successful `api-<stage>` GitHub Deployment and diffs that
// commit against the tested one. These tests run the real script against a
// throwaway git repo (so the diff is real) with a stub `gh` serving fixtures
// (so nothing touches the network).
const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "ci",
  "deploy-gate.sh"
);

// Answers the two endpoints the script calls from files in $FAKE_GH_DIR and
// logs every call. A `fail` file makes every call exit non-zero.
const FAKE_GH = `#!/usr/bin/env bash
echo "$*" >> "$FAKE_GH_DIR/calls.log"
if [ -f "$FAKE_GH_DIR/fail" ]; then echo "gh: boom" >&2; exit 1; fi
# exec so the timeout's SIGTERM reaches sleep itself, not just this shell.
if [ -f "$FAKE_GH_DIR/slow" ]; then exec sleep 30; fi
path="$2"
case "$path" in
  */deployments\\?*) cat "$FAKE_GH_DIR/deployments.json" ;;
  */deployments/*/statuses*)
    id="\${path#*/deployments/}"; id="\${id%%/*}"
    if [ -f "$FAKE_GH_DIR/slow-statuses-$id" ]; then exec sleep 30; fi
    cat "$FAKE_GH_DIR/statuses-$id.json" || exit 1 ;;
  *) echo "unexpected gh call: $*" >&2; exit 1 ;;
esac
`;

interface Fixture {
  id: number;
  sha: string;
  /** Latest status first; omit for a deployment that never got one. */
  statuses?: string[];
}

let root: string;
let repo: string;
let ghDir: string;

function git(...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args],
    {
      cwd: repo,
      encoding: "utf-8",
      env: {
        PATH: process.env.PATH,
        HOME: root,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_SYSTEM: "/dev/null",
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@example.com",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@example.com",
      },
    }
  ).trim();
}

/** Commits one file change and returns the new commit's sha. */
function commit(file: string, message: string): string {
  const full = join(repo, file);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, `${message}\n${Math.random()}\n`);
  git("add", file);
  git("commit", "-m", message);
  return git("rev-parse", "HEAD");
}

function serve(deployments: Fixture[]) {
  writeFileSync(
    join(ghDir, "deployments.json"),
    JSON.stringify(deployments.map(({ id, sha }) => ({ id, sha })))
  );
  for (const d of deployments) {
    if (d.statuses) {
      writeFileSync(
        join(ghDir, `statuses-${d.id}.json`),
        JSON.stringify(d.statuses.map((state) => ({ state })))
      );
    }
  }
}

function runGate(
  headSha: string,
  opts: {
    event?: string;
    stage?: string;
    env?: Record<string, string>;
  } = {}
) {
  const output = join(root, "github-output");
  writeFileSync(output, "");
  const result = spawnSync("bash", [SCRIPT], {
    cwd: repo,
    encoding: "utf-8",
    env: {
      PATH: `${join(root, "bin")}:${process.env.PATH}`,
      HOME: root,
      FAKE_GH_DIR: ghDir,
      GITHUB_OUTPUT: output,
      GITHUB_REPOSITORY: "wraps-team/wraps",
      HEAD_SHA: headSha,
      EVENT_NAME: opts.event ?? "workflow_run",
      STAGE: opts.stage ?? "production",
      ...opts.env,
    },
  });
  const outputs = Object.fromEntries(
    readFileSync(output, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split("=") as [string, string])
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    deploy: outputs.deploy,
    sha: outputs.sha,
    calls: readFileSync(join(ghDir, "calls.log"), "utf-8"),
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "deploy-gate-"));
  repo = join(root, "repo");
  ghDir = join(root, "gh");
  mkdirSync(repo);
  mkdirSync(ghDir);
  mkdirSync(join(root, "bin"));
  writeFileSync(join(ghDir, "calls.log"), "");
  writeFileSync(join(root, "bin", "gh"), FAKE_GH);
  chmodSync(join(root, "bin", "gh"), 0o755);
  git("init", "-q", "-b", "main");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("deploy-gate.sh", () => {
  it("always deploys a manual dispatch, without asking GitHub anything", () => {
    const head = commit("apps/website/page.tsx", "docs only");
    serve([{ id: 1, sha: head, statuses: ["success"] }]);

    const result = runGate(head, { event: "workflow_dispatch" });

    expect(result.status).toBe(0);
    expect(result.deploy).toBe("true");
    expect(result.sha).toBe(head);
    expect(result.calls).toBe("");
  });

  describe("fails open", () => {
    it("deploys when there is no deployment record yet (the bootstrap run)", () => {
      const head = commit("apps/website/page.tsx", "docs only");
      serve([]);

      const result = runGate(head);

      expect(result.status).toBe(0);
      expect(result.deploy).toBe("true");
      expect(result.sha).toBe(head);
      expect(result.stderr).toContain(
        "::notice::no api-production deployment record"
      );
    });

    it("deploys when the GitHub API errors, and keeps gh's error in the log", () => {
      const head = commit("apps/website/page.tsx", "docs only");
      writeFileSync(join(ghDir, "fail"), "");

      const result = runGate(head);

      expect(result.status).toBe(0);
      expect(result.deploy).toBe("true");
      expect(result.stderr).toContain("gh: boom");
      expect(result.stderr).toContain(
        "::warning::could not list api-production"
      );
    });

    it("deploys when gh hangs, instead of running the job into its timeout", () => {
      const head = commit("apps/website/page.tsx", "docs only");
      writeFileSync(join(ghDir, "slow"), "");

      const started = Date.now();
      const result = runGate(head, { env: { DEPLOY_GATE_GH_TIMEOUT: "1" } });

      expect(result.status).toBe(0);
      expect(result.deploy).toBe("true");
      expect(result.stderr).toContain("::warning::could not list");
      expect(Date.now() - started).toBeLessThan(15_000);
    });

    it("deploys when the API returns something that is not JSON", () => {
      const head = commit("apps/website/page.tsx", "docs only");
      writeFileSync(join(ghDir, "deployments.json"), "<html>502</html>");

      const result = runGate(head);

      expect(result.status).toBe(0);
      expect(result.deploy).toBe("true");
      expect(result.stderr).toContain("::warning::api-production deployments");
    });

    it("deploys a revert when the newest record's status can't be read", () => {
      const d1 = commit("README.md", "older deploy");
      const d2 = commit("apps/api/src/route.ts", "api change, deployed");
      git("revert", "--no-edit", d2);
      const head = git("rev-parse", "HEAD");
      // No statuses-2.json, so reading D2's status fails like a 5xx. Falling
      // back to D1 would diff D1..head as empty and skip a real revert.
      serve([
        { id: 2, sha: d2 },
        { id: 1, sha: d1, statuses: ["success"] },
      ]);

      const result = runGate(head);

      expect(result.deploy).toBe("true");
      expect(result.stderr).toContain("deploying without a baseline");
    });

    it("deploys a revert when only the status call hangs", () => {
      const d1 = commit("README.md", "older deploy");
      const d2 = commit("apps/api/src/route.ts", "api change, deployed");
      git("revert", "--no-edit", d2);
      const head = git("rev-parse", "HEAD");
      serve([
        { id: 2, sha: d2, statuses: ["success"] },
        { id: 1, sha: d1, statuses: ["success"] },
      ]);
      // Only the newest record's status hangs; the older one reads fine.
      writeFileSync(join(ghDir, "slow-statuses-2"), "");

      const result = runGate(head, { env: { DEPLOY_GATE_GH_TIMEOUT: "1" } });

      expect(result.deploy).toBe("true");
      expect(result.stderr).toContain("(exit 124)");
    });

    it("deploys when the deployments come back without ids", () => {
      const head = commit("apps/website/page.tsx", "docs only");
      writeFileSync(
        join(ghDir, "deployments.json"),
        JSON.stringify([{ sha: head }])
      );

      const result = runGate(head);

      expect(result.deploy).toBe("true");
      expect(result.stderr).toContain(
        "::warning::api-production deployments came back without ids"
      );
    });

    it("deploys when every status lookup fails", () => {
      const head = commit("apps/website/page.tsx", "docs only");
      // Listing works; no statuses-1.json exists, so the stub exits 1.
      serve([{ id: 1, sha: head }]);

      const result = runGate(head);

      expect(result.status).toBe(0);
      expect(result.deploy).toBe("true");
      expect(result.stderr).toContain("::warning::could not read the status");
    });

    it("deploys when the recorded sha is not in this history", () => {
      commit("apps/api/src/a.ts", "base");
      const head = commit("apps/website/page.tsx", "docs only");
      serve([{ id: 1, sha: "f".repeat(40), statuses: ["success"] }]);

      const result = runGate(head);

      expect(result.status).toBe(0);
      expect(result.deploy).toBe("true");
      expect(result.stdout).toContain("recorded deploy is not in history");
      expect(result.stderr).toContain("::warning::recorded deploy");
    });
  });

  describe("compares against the recorded deploy", () => {
    it("deploys when an apps/api file changed since it", () => {
      const deployed = commit("apps/website/page.tsx", "deployed");
      commit("apps/website/other.tsx", "website");
      const head = commit("apps/api/src/route.ts", "api change");
      serve([{ id: 1, sha: deployed, statuses: ["success"] }]);

      const result = runGate(head);

      expect(result.status).toBe(0);
      expect(result.deploy).toBe("true");
      expect(result.stdout).toContain(`comparing ${deployed}..${head}`);
    });

    it.each(["apps/website/page.tsx", ".claude/settings.json"])(
      "skips when only %s changed since it",
      (file) => {
        const deployed = commit("apps/api/src/route.ts", "deployed");
        commit(file, "unrelated 1");
        const head = commit(file, "unrelated 2");
        serve([{ id: 1, sha: deployed, statuses: ["success"] }]);

        const result = runGate(head);

        expect(result.status).toBe(0);
        expect(result.deploy).toBe("false");
        expect(result.sha).toBe(head);
      }
    );

    it("skips when the tested commit is the deployed one", () => {
      const head = commit("apps/api/src/route.ts", "deployed");
      serve([{ id: 1, sha: head, statuses: ["success"] }]);

      expect(runGate(head).deploy).toBe("false");
    });

    it("looks up the environment of the stage being deployed", () => {
      const head = commit("apps/website/page.tsx", "docs only");
      serve([]);

      expect(runGate(head, { stage: "staging" }).calls).toContain(
        "environment=api-staging"
      );
      expect(runGate(head).calls).toContain("environment=api-production");
    });

    it("deploys for the paths in the list and skips for unrelated ones", () => {
      const deployed = commit("README.md", "deployed");
      serve([{ id: 1, sha: deployed, statuses: ["success"] }]);

      for (const file of [
        "packages/db/src/schema.ts",
        "packages/core/src/index.ts",
        "packages/unsubscribe-token/src/index.ts",
        "infra/api.ts",
        "sst.config.ts",
        ".github/workflows/deploy-api.yml",
        // The API's dependency versions come from the pnpm catalog.
        "pnpm-lock.yaml",
        "pnpm-workspace.yaml",
      ]) {
        const head = commit(file, `touch ${file}`);
        expect(runGate(head).deploy, file).toBe("true");
        git("reset", "-q", "--hard", deployed);
      }

      for (const file of [
        "packages/cli/src/index.ts",
        "packages/ui/src/button.tsx",
        "apps/web/src/page.tsx",
        "docs/agents/ci-and-deploy.md",
        ".github/workflows/test.yml",
      ]) {
        const head = commit(file, `touch ${file}`);
        expect(runGate(head).deploy, file).toBe("false");
        git("reset", "-q", "--hard", deployed);
      }
    });

    it("ignores a deployment whose latest status is not success", () => {
      const good = commit("apps/website/page.tsx", "last real deploy");
      const failed = commit("apps/website/a.tsx", "failed deploy");
      const running = commit("apps/website/b.tsx", "in flight");
      const head = commit("apps/api/src/route.ts", "api change");
      // Newest first, as the API returns them. A deployment's own history is
      // newest-first too: the failed one once passed through in_progress.
      serve([
        { id: 4, sha: running, statuses: ["in_progress", "queued"] },
        { id: 3, sha: failed, statuses: ["failure", "in_progress"] },
        { id: 2, sha: running, statuses: [] },
        { id: 1, sha: good, statuses: ["success", "in_progress"] },
      ]);

      const result = runGate(head);

      expect(result.deploy).toBe("true");
      expect(result.stdout).toContain(`comparing ${good}..${head}`);
    });

    it("takes the newest success, not an older one", () => {
      const older = commit("apps/website/old.tsx", "older deploy");
      commit(
        "apps/api/src/route.ts",
        "api change that the newer deploy shipped"
      );
      const newer = commit("apps/website/page.tsx", "newer deploy");
      const head = commit("apps/website/next.tsx", "docs only");
      serve([
        { id: 2, sha: newer, statuses: ["success"] },
        { id: 1, sha: older, statuses: ["inactive"] },
      ]);

      const result = runGate(head);

      // Against `older` the api change would trigger a redundant deploy.
      expect(result.stdout).toContain(`comparing ${newer}..${head}`);
      expect(result.deploy).toBe("false");
    });
  });

  describe("never deploys backwards", () => {
    it("skips a tested commit that is older than the recorded deploy", () => {
      const parent = commit("apps/website/page.tsx", "older, docs only");
      const deployed = commit("apps/api/src/route.ts", "newer, api change");
      serve([{ id: 1, sha: deployed, statuses: ["success"] }]);

      // A tree diff parent..deployed-direction would list apps/api/ and deploy.
      const result = runGate(parent);

      expect(result.status).toBe(0);
      expect(result.deploy).toBe("false");
      expect(result.stdout).toContain("is older than deployed");
      expect(result.stdout).toContain("::notice::");
      expect(result.stdout).toContain("dispatch Deploy API by hand");
    });

    it("deploys a revert of the recorded deploy", () => {
      commit("README.md", "base");
      const deployed = commit("apps/api/src/route.ts", "api change, deployed");
      git("revert", "--no-edit", deployed);
      const head = git("rev-parse", "HEAD");
      serve([{ id: 1, sha: deployed, statuses: ["success"] }]);

      // The revert descends from the record, so the guard does not fire, and
      // the diff lists the reverted path even though the tree equals the base.
      const result = runGate(head);

      expect(result.deploy).toBe("true");
      expect(result.stdout).toContain(`comparing ${deployed}..${head}`);
    });

    it("still deploys an older commit when dispatched by hand", () => {
      const parent = commit("apps/website/page.tsx", "older");
      const deployed = commit("apps/api/src/route.ts", "newer");
      serve([{ id: 1, sha: deployed, statuses: ["success"] }]);

      const result = runGate(parent, { event: "workflow_dispatch" });

      expect(result.deploy).toBe("true");
    });

    it("does not treat a sibling branch as older", () => {
      const base = commit("README.md", "base");
      const deployed = commit("apps/website/page.tsx", "deployed");
      git("checkout", "-q", "-b", "other", base);
      const head = commit("apps/api/src/route.ts", "api change off a sibling");
      serve([{ id: 1, sha: deployed, statuses: ["success"] }]);

      expect(runGate(head).deploy).toBe("true");
    });
  });

  it("deploys when a file was moved out of an API path", () => {
    const deployed = commit("apps/api/src/route.ts", "deployed");
    mkdirSync(join(repo, "docs"), { recursive: true });
    git("mv", "apps/api/src/route.ts", "docs/route.md");
    git("commit", "-m", "move the route out of the API");
    const head = git("rev-parse", "HEAD");
    serve([{ id: 1, sha: deployed, statuses: ["success"] }]);

    // Rename detection would report only docs/route.md and skip.
    expect(runGate(head).deploy).toBe("true");
  });

  // 2026-11-03: #248 (docs-only) and #247 (API) merged back to back. The old
  // gate compared against the last successful *run's* head_sha. #248's gate
  // skipped, but that skipped run was recorded as a success carrying main's
  // HEAD at trigger time, so #247 compared bf89a46..bf89a46 and skipped too.
  it("deploys an API commit that follows a skipped docs-only commit", () => {
    commit("apps/api/src/route.ts", "earlier history");
    const deployed = commit(
      "apps/web/src/page.tsx",
      "81b0875 last real deploy"
    );
    const docsOnly = commit("docs/agents/ci-and-deploy.md", "fa6b72b docs");
    const apiCommit = commit("apps/api/src/route.ts", "bf89a46 api");
    serve([{ id: 1, sha: deployed, statuses: ["success"] }]);

    // The docs-only commit skips, and a skip writes no deployment record.
    const first = runGate(docsOnly);
    expect(first.deploy).toBe("false");
    expect(first.stdout).toContain(`comparing ${deployed}..${docsOnly}`);

    // The API commit still sees the real last deploy, not the skipped run.
    const second = runGate(apiCommit);
    expect(second.deploy).toBe("true");
    expect(second.stdout).toContain(`comparing ${deployed}..${apiCommit}`);
  });
});
