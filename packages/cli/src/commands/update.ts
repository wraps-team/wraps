import { execFileSync } from "node:child_process";
import { chmodSync, createWriteStream, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { cancel, confirm, intro, isCancel, log } from "@clack/prompts";
import pc from "picocolors";
import { DeploymentProgress } from "../utils/shared/output.js";

const REPO = "wraps-team/wraps";
const INSTALL_DIR = join(homedir(), ".wraps");
const WHITESPACE_RE = /\s+/;

function isStandaloneInstall(): boolean {
  return process.execPath.includes(".wraps/runtime");
}

type Release = {
  tag_name: string;
  assets: { name: string; browser_download_url: string }[];
};

async function fetchLatestVersion(): Promise<{
  version: string;
  release: Release;
} | null> {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/releases?per_page=20`,
    {
      headers: { Accept: "application/vnd.github+json" },
    }
  );
  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status}`);
  }

  const releases = (await res.json()) as Release[];

  for (const release of releases) {
    if (release.tag_name.startsWith("cli@")) {
      const version = release.tag_name.replace("cli@", "");
      return { version, release };
    }
  }
  return null;
}

function detectPlatformArch(): { platform: string; arch: string } {
  const platform = process.platform === "darwin" ? "darwin" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return { platform, arch };
}

export async function update(currentVersion: string): Promise<void> {
  intro(pc.bold("Wraps CLI Update"));

  const progress = new DeploymentProgress();

  const result = await progress.execute("Checking for updates...", () =>
    fetchLatestVersion()
  );

  if (!result) {
    progress.fail("Could not determine latest version from GitHub releases.");
    return;
  }

  const { version: latestVersion, release } = result;

  if (currentVersion === latestVersion) {
    progress.succeed(`Already up to date ${pc.dim(`(v${currentVersion})`)}`);
    return;
  }

  console.log();
  log.info(
    `Current version: ${pc.dim(`v${currentVersion}`)}\n  Latest version:  ${pc.cyan(`v${latestVersion}`)}`
  );
  console.log();

  if (!isStandaloneInstall()) {
    log.info(
      `You installed Wraps via npm. Update with:\n\n  ${pc.cyan("npm update -g @wraps.dev/cli")}`
    );
    return;
  }

  const shouldUpdate = await confirm({
    message: `Update to v${latestVersion}?`,
  });

  if (isCancel(shouldUpdate) || !shouldUpdate) {
    cancel("Update cancelled.");
    return;
  }

  const { platform, arch } = detectPlatformArch();
  const tarballName = `wraps-${latestVersion}-${platform}-${arch}.tar.gz`;

  const tarballAsset = release.assets.find((a) => a.name === tarballName);
  const checksumAsset = release.assets.find(
    (a) => a.name === "CHECKSUMS.sha256"
  );

  if (!tarballAsset) {
    progress.fail(
      `No release asset found for ${platform}-${arch}. Download manually from GitHub.`
    );
    return;
  }

  const tmp = mkdtempSync(join(tmpdir(), "wraps-update-"));

  try {
    const tarballPath = join(tmp, tarballName);

    await progress.execute(`Downloading ${tarballName}...`, async () => {
      const res = await fetch(tarballAsset.browser_download_url, {
        redirect: "follow",
      });
      if (!(res.ok && res.body)) {
        throw new Error(`Download failed: ${res.status}`);
      }
      const nodeStream = Readable.fromWeb(
        res.body as import("stream/web").ReadableStream
      );
      await pipeline(nodeStream, createWriteStream(tarballPath));
    });

    if (checksumAsset) {
      await progress.execute("Verifying checksum...", async () => {
        const res = await fetch(checksumAsset.browser_download_url, {
          redirect: "follow",
        });
        if (!res.ok) {
          throw new Error(`Checksum download failed: ${res.status}`);
        }
        const checksumText = await res.text();
        const line = checksumText
          .split("\n")
          .find((l) => l.includes(tarballName));
        if (!line) {
          throw new Error("Tarball not found in CHECKSUMS.sha256");
        }

        const expected = line.split(WHITESPACE_RE)[0];
        const [shaCmd, ...shaArgs] =
          process.platform === "darwin"
            ? ["shasum", "-a", "256"]
            : ["sha256sum"];
        const actual = execFileSync(shaCmd, [...shaArgs, tarballPath])
          .toString()
          .split(WHITESPACE_RE)[0];

        if (expected !== actual) {
          throw new Error(
            `Checksum mismatch (expected ${expected}, got ${actual})`
          );
        }
      });
    }

    // biome-ignore lint/suspicious/useAwait: progress.execute requires async callback
    await progress.execute("Installing update...", async () => {
      const extractDir = join(tmp, "extract");
      mkdirSync(extractDir, { recursive: true });
      execFileSync("tar", ["xzf", tarballPath, "-C", extractDir]);

      const source = join(extractDir, "wraps");

      for (const dir of ["bin", "runtime", "lib"]) {
        rmSync(join(INSTALL_DIR, dir), { recursive: true, force: true });
        execFileSync("cp", ["-R", join(source, dir), join(INSTALL_DIR, dir)]);
      }

      chmodSync(join(INSTALL_DIR, "bin", "wraps"), 0o755);
      chmodSync(join(INSTALL_DIR, "runtime", "node"), 0o755);
    });

    console.log();
    progress.succeed(
      `Updated to ${pc.cyan(`v${latestVersion}`)} successfully!`
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
