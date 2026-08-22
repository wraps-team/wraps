import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clack/prompts");
vi.mock("../../telemetry/events.js", () => ({ trackCommand: vi.fn() }));
vi.mock("../../utils/shared/json-output.js", () => ({
  isJsonMode: vi.fn().mockReturnValue(false),
  jsonSuccess: vi.fn(),
}));
vi.mock("../../utils/shared/aws-detection.js", () => ({
  detectAWSState: vi.fn(),
  formatSSOProfile: vi.fn((p?: { name?: string }) => p?.name ?? "unknown"),
  getSSOLoginCommand: vi.fn(
    (p?: string) => `aws sso login --profile ${p ?? "default"}`
  ),
  hasConfigFile: vi.fn().mockReturnValue(true),
  hasCredentialsFile: vi.fn().mockReturnValue(true),
  getConfiguredProfiles: vi.fn().mockReturnValue([]),
}));
vi.mock("../../utils/shared/aws.js", () => ({
  getSESAccountStatus: vi.fn().mockResolvedValue({ isSandbox: false }),
}));

import { trackCommand } from "../../telemetry/events.js";
import { getSESAccountStatus } from "../../utils/shared/aws.js";
import {
  type AWSSetupState,
  detectAWSState,
  hasCredentialsFile,
  type SSOProfile,
} from "../../utils/shared/aws-detection.js";
import {
  formatRemediation,
  remediations,
} from "../../utils/shared/doctor-remediation.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";

// GitHub Actions sets FORCE_COLOR, so picocolors emits ANSI escapes on CI even
// though a local vitest run (stdout is not a TTY) emits none. Assertions below
// pin what a line says and where it sits, never how it is coloured, so strip
// the escapes rather than depending on the environment to omit them.
const stripAnsi = (s: string) => s.replace(/\u001B\[[0-9;]*m/g, "");

const mockDetectAWSState = detectAWSState as ReturnType<typeof vi.fn>;
const mockHasCredentialsFile = hasCredentialsFile as ReturnType<typeof vi.fn>;
const mockGetSESAccountStatus = getSESAccountStatus as ReturnType<typeof vi.fn>;
const mockTrackCommand = trackCommand as ReturnType<typeof vi.fn>;
const mockIsJsonMode = isJsonMode as ReturnType<typeof vi.fn>;
const mockJsonSuccess = jsonSuccess as ReturnType<typeof vi.fn>;

/** Every field runDiagnostics reads, so a test overrides only what it is about. */
function baseState(overrides: Partial<AWSSetupState> = {}): AWSSetupState {
  return {
    cliInstalled: true,
    cliVersion: "2.15.0",
    credentialsConfigured: true,
    credentialSource: "profile",
    profileName: "default",
    accountId: "123456789012",
    detectedProvider: null,
    region: "us-west-2",
    sso: {
      configured: false,
      profiles: [],
      sessions: [],
      tokenStatus: null,
      activeProfile: null,
    },
    ...overrides,
  };
}

function ssoProfile(name: string): SSOProfile {
  return {
    name,
    ssoStartUrl: "https://example.awsapps.com/start",
    ssoRegion: "us-west-2",
    ssoAccountId: "123456789012",
    ssoRoleName: "AdministratorAccess",
  };
}

type JsonPayload = {
  checks: Array<{
    name: string;
    status: string;
    details?: string;
    remediation?: { id: string; level: string; command?: string };
  }>;
  summary: { pass: number; warn: number; fail: number };
  suggestions: string[];
};

function jsonPayload(): JsonPayload {
  return mockJsonSuccess.mock.calls[0][1] as JsonPayload;
}

/** The summary the envelope's own `checks` imply, so the counts stay pinned. */
function countByStatus(payload: JsonPayload): JsonPayload["summary"] {
  const count = (status: string) =>
    payload.checks.filter((c) => c.status === status).length;
  return { pass: count("pass"), warn: count("warn"), fail: count("fail") };
}

describe("aws doctor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockIsJsonMode.mockReturnValue(false);
    mockGetSESAccountStatus.mockResolvedValue({ isSandbox: false });
    mockHasCredentialsFile.mockReturnValue(true);
    mockDetectAWSState.mockResolvedValue(baseState());
  });

  it("attaches the install remediation to the missing-CLI finding and surfaces it as a suggestion", async () => {
    mockIsJsonMode.mockReturnValue(true);
    mockDetectAWSState.mockResolvedValue(
      baseState({ cliInstalled: false, cliVersion: null })
    );

    const { doctor } = await import("../aws/doctor.js");
    await doctor();

    const payload = jsonPayload();
    const cliCheck = payload.checks.find(
      (c) => c.name === "AWS CLI not installed"
    );
    expect(cliCheck?.remediation).toEqual(remediations.installAwsCli());
    expect(payload.suggestions).toContain(
      formatRemediation(remediations.installAwsCli())
    );
  });

  it("keeps the aws.doctor JSON envelope shape that existed before remediations", async () => {
    mockIsJsonMode.mockReturnValue(true);

    const { doctor } = await import("../aws/doctor.js");
    await doctor();

    const [event, payload] = mockJsonSuccess.mock.calls[0];
    expect(event).toBe("aws.doctor");
    expect(Array.isArray((payload as JsonPayload).checks)).toBe(true);
    // Non-vacuous: without this the loops below assert nothing.
    expect((payload as JsonPayload).checks.length).toBeGreaterThan(0);
    for (const check of (payload as JsonPayload).checks) {
      expect(typeof check.name).toBe("string");
      expect(check.name.length).toBeGreaterThan(0);
    }
    expect((payload as JsonPayload).summary).toEqual(
      countByStatus(payload as JsonPayload)
    );
    expect(Array.isArray((payload as JsonPayload).suggestions)).toBe(true);
    for (const suggestion of (payload as JsonPayload).suggestions) {
      expect(typeof suggestion).toBe("string");
    }
  });

  it("counts a broken account's failures in the summary a CI script gates on", async () => {
    // `summary` is the only part of the envelope a script branches on, so a
    // count that drifts from `checks` is invisible to every other test here.
    mockIsJsonMode.mockReturnValue(true);
    mockDetectAWSState.mockResolvedValue(
      baseState({
        cliInstalled: false,
        cliVersion: null,
        credentialsConfigured: false,
        credentialSource: "sso",
        accountId: null,
        sso: {
          configured: true,
          profiles: [ssoProfile("prod")],
          sessions: [],
          tokenStatus: { valid: false, expired: true, minutesRemaining: 0 },
          activeProfile: null,
        },
      })
    );

    const { doctor } = await import("../aws/doctor.js");
    await doctor();

    const payload = jsonPayload();
    expect(payload.summary).toEqual(countByStatus(payload));
    expect(payload.summary.fail).toBeGreaterThan(0);
  });

  it("points a sandboxed SES account at the console, not at a command that cannot request access", async () => {
    mockIsJsonMode.mockReturnValue(true);
    mockGetSESAccountStatus.mockResolvedValue({ isSandbox: true });

    const { doctor } = await import("../aws/doctor.js");
    await doctor();

    const payload = jsonPayload();
    const sandboxCheck = payload.checks.find(
      (c) => c.name === "SES is in sandbox mode"
    );
    expect(sandboxCheck?.remediation).toEqual(
      remediations.requestSesProductionAccess()
    );
    expect(sandboxCheck?.remediation?.command).toBeUndefined();
    expect(payload.suggestions.join("\n")).not.toContain("wraps email check");
  });

  it("warns when several SSO profiles are configured and none is active, naming every profile", async () => {
    mockIsJsonMode.mockReturnValue(true);
    mockDetectAWSState.mockResolvedValue(
      baseState({
        credentialSource: "sso",
        sso: {
          configured: true,
          profiles: [ssoProfile("prod"), ssoProfile("staging")],
          sessions: [],
          tokenStatus: null,
          activeProfile: null,
        },
      })
    );

    const { doctor } = await import("../aws/doctor.js");
    await doctor();

    const payload = jsonPayload();
    const profileCheck = payload.checks.find(
      (c) => c.name === "2 SSO profiles configured, none active"
    );
    expect(profileCheck?.status).toBe("warn");
    expect(profileCheck?.remediation?.id).toBe("aws.profile");

    const suggestions = payload.suggestions.join("\n");
    expect(suggestions).toContain("prod");
    expect(suggestions).toContain("staging");
  });

  it("keeps the profile-qualified SSO login alongside the profile-less one", async () => {
    // Two rows carry `aws.sso.login` here: the expiring-session warning, whose
    // command comes from the (absent) active profile, and the cannot-connect
    // failure, whose command falls back to the only configured profile. They
    // are different login commands, and the second is the one that actually
    // logs the user in — dropping it hands them a command that does not.
    mockIsJsonMode.mockReturnValue(true);
    mockDetectAWSState.mockResolvedValue(
      baseState({
        credentialsConfigured: false,
        credentialSource: "sso",
        accountId: null,
        sso: {
          configured: true,
          profiles: [ssoProfile("prod")],
          sessions: [],
          tokenStatus: { valid: true, expired: false, minutesRemaining: 10 },
          activeProfile: null,
        },
      })
    );

    const { doctor } = await import("../aws/doctor.js");
    await doctor();

    const suggestions = jsonPayload().suggestions;
    expect(
      suggestions.filter((s) => s.startsWith("aws sso login"))
    ).toHaveLength(2);
    expect(suggestions.join("\n")).toContain("aws sso login --profile prod");
  });

  it("prints each failing row's own repairing command directly under that row", async () => {
    // Every other test here reads the JSON envelope, so the text branch — the
    // only thing a human running `wraps aws doctor` ever sees — could lose its
    // per-row `fix:` line with the suite still green. Two rows with two
    // different remedies, so a fix line that ignored its row's data —
    // hardcoded, or read off the first finding — lands on the wrong row.
    mockIsJsonMode.mockReturnValue(false);
    mockHasCredentialsFile.mockReturnValue(false);
    mockDetectAWSState.mockResolvedValue(
      baseState({
        credentialsConfigured: false,
        credentialSource: "profile",
        accountId: null,
        sso: {
          configured: true,
          profiles: [ssoProfile("prod")],
          sessions: [],
          tokenStatus: { valid: false, expired: true, minutesRemaining: 0 },
          activeProfile: ssoProfile("prod"),
        },
      })
    );
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {
      // silence the report
    });

    try {
      const { doctor } = await import("../aws/doctor.js");
      await doctor();

      const lines = consoleLogSpy.mock.calls
        .map((c) => stripAnsi(c.join(" ")))
        .join("\n")
        .split("\n");

      // A remediated row renders as three lines: header, detail, fix.
      // Anchoring on the header index pins the fix to the row it belongs to,
      // not to "somewhere in the report" — the Suggestions block lists both
      // commands too.
      const credentialsRow = lines.findIndex((line) =>
        line.includes("No credentials file")
      );
      expect(credentialsRow).toBeGreaterThan(-1);
      expect(lines[credentialsRow + 2]).toBe("      fix: wraps aws setup");

      // A different row, a different remedy — and this one is profile-qualified.
      const ssoRow = lines.findIndex((line) =>
        line.includes("SSO session expired")
      );
      expect(ssoRow).toBeGreaterThan(-1);
      expect(lines[ssoRow + 2]).toBe("      fix: aws sso login --profile prod");

      // A row whose finding carries no command must not grow a fix line.
      const passingRow = lines.findIndex((line) =>
        line.includes("Config file exists")
      );
      expect(passingRow).toBeGreaterThan(-1);
      expect(lines[passingRow + 1]).not.toContain("fix:");
    } finally {
      consoleLogSpy.mockRestore();
    }
  });

  // `no-real-network.ts` pins AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY with
  // `||=` so the SDK's credential chain never reaches the network. Both are
  // therefore always set under vitest, and the two misconfiguration rows below
  // are unreachable unless a test deletes one itself — which is exactly why
  // their remediations went unpinned. Deleted per-test, restored in afterEach
  // so the guard is back in place for every other test in the file.
  const AWS_ENV_KEYS = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"] as const;
  const savedAwsEnv = new Map<string, string | undefined>();

  afterEach(() => {
    for (const [key, value] of savedAwsEnv) {
      if (value === undefined) {
        // biome-ignore lint/performance/noDelete: presence is what the SDK checks
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    savedAwsEnv.clear();
  });

  function unsetAwsEnv(key: (typeof AWS_ENV_KEYS)[number]): void {
    savedAwsEnv.set(key, process.env[key]);
    // biome-ignore lint/performance/noDelete: presence is what the SDK checks
    delete process.env[key];
  }

  it.each([
    {
      missing: "AWS_SECRET_ACCESS_KEY",
      name: "AWS_ACCESS_KEY_ID set but AWS_SECRET_ACCESS_KEY missing",
    },
    {
      missing: "AWS_ACCESS_KEY_ID",
      name: "AWS_SECRET_ACCESS_KEY set but AWS_ACCESS_KEY_ID missing",
    },
  ] as const)(
    "tells a shell with only half the credential pair what the other half is ($missing missing)",
    async ({ missing, name }) => {
      unsetAwsEnv(missing);
      mockIsJsonMode.mockReturnValue(true);

      const { doctor } = await import("../aws/doctor.js");
      await doctor();

      const payload = jsonPayload();
      const check = payload.checks.find((c) => c.name === name);
      expect(check?.status).toBe("fail");
      expect(check?.remediation).toEqual(remediations.awsEnvVarsIncomplete());
      expect(payload.suggestions).toContain(
        formatRemediation(remediations.awsEnvVarsIncomplete())
      );
    }
  );

  it("still lists the half-set credential pair under Suggestions even though its row has no fix line", async () => {
    // The only `informational` remedy hung off a `fail` row: there is no
    // command to print, so the row renders two lines and stops. That is the
    // whole reason the remedy has to reach the user through the Suggestions
    // block — drop it from the collected set and a failing, exit-1 diagnosis
    // explains itself nowhere in the report.
    unsetAwsEnv("AWS_SECRET_ACCESS_KEY");
    mockIsJsonMode.mockReturnValue(false);
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {
      // silence the report
    });

    try {
      const { doctor } = await import("../aws/doctor.js");
      await doctor();

      const lines = consoleLogSpy.mock.calls
        .map((c) => stripAnsi(c.join(" ")))
        .join("\n")
        .split("\n");

      const row = lines.findIndex((line) =>
        line.includes("AWS_ACCESS_KEY_ID set but AWS_SECRET_ACCESS_KEY missing")
      );
      expect(row).toBeGreaterThan(-1);
      expect(lines[row + 1]).toContain(
        "Both environment variables are required"
      );
      expect(lines[row + 2]).not.toContain("fix:");

      expect(lines.join("\n")).toContain(
        formatRemediation(remediations.awsEnvVarsIncomplete())
      );
    } finally {
      consoleLogSpy.mockRestore();
    }
  });

  it("tells an unset-region account how to stop the us-east-1 fallback", async () => {
    mockIsJsonMode.mockReturnValue(true);
    mockDetectAWSState.mockResolvedValue(baseState({ region: null }));

    const { doctor } = await import("../aws/doctor.js");
    await doctor();

    const payload = jsonPayload();
    const regionCheck = payload.checks.find((c) => c.name === "Region not set");
    expect(regionCheck?.status).toBe("warn");
    expect(regionCheck?.remediation).toEqual(remediations.setAwsRegion());
    expect(regionCheck?.remediation?.command).toBeUndefined();
    expect(payload.suggestions).toContain(
      formatRemediation(remediations.setAwsRegion())
    );
  });

  it("asks the SES probe about the region collectAwsFindings was given, not the ambient one", async () => {
    mockDetectAWSState.mockResolvedValue(baseState({ region: "us-west-2" }));

    const { collectAwsFindings } = await import("../aws/doctor.js");
    await collectAwsFindings({ region: "eu-west-1" });

    expect(mockGetSESAccountStatus).toHaveBeenCalledWith("eu-west-1");
  });

  it("discloses the checked region when it differs from the configured one", async () => {
    mockDetectAWSState.mockResolvedValue(baseState({ region: "us-west-2" }));

    const { collectAwsFindings } = await import("../aws/doctor.js");
    const { findings } = await collectAwsFindings({ region: "eu-west-1" });

    const disclosure = findings.find(
      (f) => f.name === "Checked region: eu-west-1"
    );
    expect(disclosure?.status).toBe("info");
    expect(disclosure?.details).toContain("us-west-2");
  });

  it("does not disclose a checked region when the override is the region the environment would have used anyway", async () => {
    mockDetectAWSState.mockResolvedValue(baseState({ region: null }));

    const { collectAwsFindings } = await import("../aws/doctor.js");
    const { findings } = await collectAwsFindings({ region: "us-east-1" });

    expect(
      findings.filter((f) => f.name.startsWith("Checked region:"))
    ).toEqual([]);
  });

  it("says it could not confirm SES status instead of inventing a sandbox verdict when the probe could not answer", async () => {
    mockGetSESAccountStatus.mockResolvedValue({
      isSandbox: true,
      sandboxUncertain: true,
    });

    const { collectAwsFindings } = await import("../aws/doctor.js");
    const { findings } = await collectAwsFindings();

    const uncertain = findings.find(
      (f) => f.name === "Could not confirm SES account status"
    );
    expect(uncertain?.status).toBe("info");
    expect(findings.some((f) => f.name === "SES is in sandbox mode")).toBe(
      false
    );
  });

  it("asks the SES probe about the ambient region and discloses nothing when no region is named", async () => {
    const { collectAwsFindings } = await import("../aws/doctor.js");
    const { findings } = await collectAwsFindings();

    expect(mockGetSESAccountStatus).toHaveBeenCalledWith("us-west-2");
    expect(
      findings.filter((f) => f.name.startsWith("Checked region:"))
    ).toEqual([]);
  });

  it("still warns about the unset environment region when the run names a region of its own", async () => {
    mockDetectAWSState.mockResolvedValue(baseState({ region: null }));

    const { collectAwsFindings } = await import("../aws/doctor.js");
    const { findings } = await collectAwsFindings({ region: "eu-west-1" });

    const regionCheck = findings.find((f) => f.name === "Region not set");
    expect(regionCheck?.status).toBe("warn");
    expect(regionCheck?.remediation).toEqual(remediations.setAwsRegion());
    const disclosure = findings.find(
      (f) => f.name === "Checked region: eu-west-1"
    );
    expect(disclosure?.details).toContain("not the us-east-1 default");
  });
  it("asks the SES probe about the region the command was given", async () => {
    mockDetectAWSState.mockResolvedValue(baseState({ region: "us-west-2" }));

    const { doctor } = await import("../aws/doctor.js");
    await doctor({ region: "eu-west-1" });

    expect(mockGetSESAccountStatus).toHaveBeenCalledWith("eu-west-1");
  });
  it("reports the region it checked in telemetry", async () => {
    mockDetectAWSState.mockResolvedValue(baseState({ region: "us-west-2" }));

    const { doctor } = await import("../aws/doctor.js");
    await doctor({ region: "eu-west-1" });

    // One run, one event. `toHaveBeenCalledWith` alone is satisfied by a
    // matching call among many, so a second `aws:doctor` emit — the shape this
    // command had before the event moved above the JSON early return — would
    // double-count every human-path run and inflate duration_ms on the copy
    // that lands last, skewing the very region adoption this event exists to
    // measure.
    expect(mockTrackCommand).toHaveBeenCalledTimes(1);
    expect(mockTrackCommand).toHaveBeenCalledWith(
      "aws:doctor",
      expect.objectContaining({ region: "eu-west-1" })
    );
  });

  it("reports the region it checked in telemetry on the JSON path too", async () => {
    mockIsJsonMode.mockReturnValue(true);
    mockDetectAWSState.mockResolvedValue(baseState({ region: "us-west-2" }));

    const { doctor } = await import("../aws/doctor.js");
    await doctor({ region: "eu-west-1" });

    expect(mockTrackCommand).toHaveBeenCalledTimes(1);
    expect(mockTrackCommand).toHaveBeenCalledWith(
      "aws:doctor",
      expect.objectContaining({ region: "eu-west-1" })
    );
  });

  it("records the ambient region when the run names none of its own", async () => {
    // ap-southeast-2 is neither the us-east-1 fallback nor anything --region
    // supplies, so only `state.region` can produce it — the most-travelled
    // production path, a user with a configured region running plain
    // `wraps aws doctor`. Asserting the probe's region alongside it pins the
    // telemetry copy of the resolution to the one runDiagnostics performs, so
    // the two cannot silently diverge.
    mockDetectAWSState.mockResolvedValue(
      baseState({ region: "ap-southeast-2" })
    );

    const { doctor } = await import("../aws/doctor.js");
    await doctor();

    expect(mockGetSESAccountStatus).toHaveBeenCalledWith("ap-southeast-2");
    expect(mockTrackCommand).toHaveBeenCalledWith(
      "aws:doctor",
      expect.objectContaining({ region: "ap-southeast-2" })
    );
  });

  it("records the region the SES probe actually used when nothing named one", async () => {
    mockDetectAWSState.mockResolvedValue(baseState({ region: null }));

    const { doctor } = await import("../aws/doctor.js");
    await doctor();

    expect(mockGetSESAccountStatus).toHaveBeenCalledWith("us-east-1");
    expect(mockTrackCommand).toHaveBeenCalledWith(
      "aws:doctor",
      expect.objectContaining({ region: "us-east-1" })
    );
  });
});
