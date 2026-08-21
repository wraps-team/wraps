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
  isSESSandbox: vi.fn().mockResolvedValue(false),
}));

import { isSESSandbox } from "../../utils/shared/aws.js";
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

const mockDetectAWSState = detectAWSState as ReturnType<typeof vi.fn>;
const mockHasCredentialsFile = hasCredentialsFile as ReturnType<typeof vi.fn>;
const mockIsSESSandbox = isSESSandbox as ReturnType<typeof vi.fn>;
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
    mockIsSESSandbox.mockResolvedValue(false);
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
    mockIsSESSandbox.mockResolvedValue(true);

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
        .map((c) => c.join(" "))
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
        .map((c) => c.join(" "))
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
});
