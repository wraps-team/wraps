import * as prompts from "@clack/prompts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clack/prompts");
vi.mock("../aws/doctor.js", () => ({ collectAwsFindings: vi.fn() }));
vi.mock("../email/doctor.js", () => ({ collectEmailFindings: vi.fn() }));
vi.mock("../../utils/shared/aws.js", () => ({
  getAWSRegion: vi.fn().mockResolvedValue("us-west-2"),
}));
vi.mock("../../utils/shared/aws-detection.js", () => ({
  detectAWSState: vi.fn(),
}));
vi.mock("../../utils/shared/metadata.js", () => ({
  findConnectionsWithService: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../telemetry/events.js", () => ({ trackCommand: vi.fn() }));
vi.mock("../../utils/shared/json-output.js", () => ({
  isJsonMode: vi.fn().mockReturnValue(false),
  jsonSuccess: vi.fn(),
}));

import { trackCommand } from "../../telemetry/events.js";
import { getAWSRegion } from "../../utils/shared/aws.js";
import {
  type AWSSetupState,
  detectAWSState,
} from "../../utils/shared/aws-detection.js";
import {
  type DoctorFinding,
  type Remediation,
  remediations,
} from "../../utils/shared/doctor-remediation.js";
import { isJsonMode, jsonSuccess } from "../../utils/shared/json-output.js";
import { findConnectionsWithService } from "../../utils/shared/metadata.js";
import type { AWSResourceScan } from "../../utils/shared/scanner.js";
import { collectAwsFindings } from "../aws/doctor.js";
import type { EmailFindings } from "../email/doctor.js";
import { collectEmailFindings } from "../email/doctor.js";

const mockCollectAwsFindings = collectAwsFindings as ReturnType<typeof vi.fn>;
const mockCollectEmailFindings = collectEmailFindings as ReturnType<
  typeof vi.fn
>;
const mockGetAWSRegion = getAWSRegion as ReturnType<typeof vi.fn>;
const mockDetectAWSState = detectAWSState as ReturnType<typeof vi.fn>;
const mockFindConnections = findConnectionsWithService as ReturnType<
  typeof vi.fn
>;
const mockIsJsonMode = isJsonMode as ReturnType<typeof vi.fn>;
const mockJsonSuccess = jsonSuccess as ReturnType<typeof vi.fn>;
const mockTrackCommand = trackCommand as ReturnType<typeof vi.fn>;

/** Every field runDiagnostics reads, so a test overrides only what it is about. */
function baseState(overrides: Partial<AWSSetupState> = {}): AWSSetupState {
  return {
    cliInstalled: true,
    cliVersion: "2.15.0",
    // credentialsConfigured + accountId are what wrapsDoctor gates the email
    // leg on. They must match what awsResult() used to supply (:46-58) or
    // every existing test that expects the email leg to run goes red.
    credentialsConfigured: true,
    credentialSource: "profile",
    profileName: "default",
    accountId: "123456789012",
    detectedProvider: null,
    // Must be "us-west-2". wrapsDoctor puts `state.region` AHEAD of
    // `getAWSRegion()` in the resolution chain, and this suite pins
    // `getAWSRegion` to "us-west-2" below — any other value here silently
    // changes the region every existing no-deployment test resolves to.
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

// No `state` key: wrapsDoctor detects the state itself and passes it into the
// AWS leg, so what this mock returns for `state` is never read. baseState() is
// where the state a test cares about is set.
function awsResult(overrides: Partial<{ findings: DoctorFinding[] }> = {}) {
  return {
    findings: overrides.findings ?? [
      { status: "pass", category: "AWS Setup", name: "AWS CLI installed" },
    ],
  };
}

function emailResult(findings?: DoctorFinding[]): EmailFindings {
  return {
    findings: findings ?? [
      {
        status: "fail",
        category: "Event Pipeline",
        name: "SQS queue wraps-email-events",
        details: "Queue not found",
        remediation: remediations.syncStack(),
      },
    ],
    totalResources: 3,
    hasStack: true,
    wrapsResources: {} as AWSResourceScan,
  };
}

type DoctorPayload = {
  region: string;
  accountId: string | null;
  findings: DoctorFinding[];
  summary: { pass: number; warn: number; fail: number };
  remediations: Remediation[];
};

/** The summary the envelope's own `findings` imply, so the counts stay pinned. */
function countByStatus(payload: DoctorPayload): DoctorPayload["summary"] {
  const count = (status: string) =>
    payload.findings.filter((f) => f.status === status).length;
  return { pass: count("pass"), warn: count("warn"), fail: count("fail") };
}

// picocolors emits no escape codes when stdout is not a TTY, which is how
// vitest runs — but a developer with FORCE_COLOR set would otherwise see the
// row assertions fail for a reason that has nothing to do with the icons.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching the ANSI escapes picocolors emits
const ANSI = /\u001B\[[0-9;]*m/g;
const stripAnsi = (s: string): string => s.replace(ANSI, "");

describe("wrapsDoctor", () => {
  let mockSpinner: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    message: ReturnType<typeof vi.fn>;
  };
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  // A single console.log can emit two lines (the block prints its command and
  // summary in one call), so split on newlines after joining rather than
  // treating one call as one line.
  const outputLines = (): string[] =>
    consoleLogSpy.mock.calls
      .map((c) => c.join(" "))
      .join("\n")
      .split("\n");
  let originalRegion: string | undefined;
  let originalDefaultRegion: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockSpinner = { start: vi.fn(), stop: vi.fn(), message: vi.fn() };
    vi.mocked(prompts.spinner).mockReturnValue(mockSpinner as never);
    vi.mocked(prompts.intro).mockImplementation(() => {});
    vi.mocked(prompts.outro).mockImplementation(() => {});
    vi.mocked(prompts.log).info = vi.fn();
    vi.mocked(prompts.log).warn = vi.fn();
    vi.mocked(prompts.log).error = vi.fn();
    vi.mocked(prompts.log).success = vi.fn();

    mockIsJsonMode.mockReturnValue(false);
    mockGetAWSRegion.mockResolvedValue("us-west-2");
    mockDetectAWSState.mockResolvedValue(baseState());
    mockFindConnections.mockResolvedValue([]);
    mockCollectAwsFindings.mockResolvedValue(awsResult());
    mockCollectEmailFindings.mockResolvedValue(emailResult());

    // `wrapsDoctor` computes `regionExplicit` straight off these two vars and
    // the network guard setup file deliberately leaves them alone, so vitest
    // would otherwise inherit the developer's shell.
    originalRegion = process.env.AWS_REGION;
    originalDefaultRegion = process.env.AWS_DEFAULT_REGION;
    delete process.env.AWS_REGION;
    delete process.env.AWS_DEFAULT_REGION;

    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = undefined;
    if (originalRegion === undefined) {
      delete process.env.AWS_REGION;
    } else {
      process.env.AWS_REGION = originalRegion;
    }
    if (originalDefaultRegion === undefined) {
      delete process.env.AWS_DEFAULT_REGION;
    } else {
      process.env.AWS_DEFAULT_REGION = originalDefaultRegion;
    }
    vi.restoreAllMocks();
  });

  it("renders AWS setup and email findings in one report", async () => {
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({});

    const output = consoleLogSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("AWS Setup");
    expect(output).toContain("Event Pipeline");
  });

  it("surfaces a failing finding's remedy in the suggested-fixes block", async () => {
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({});

    // Positional, not a whole-output .toContain: displayFindings already
    // prints `fix: wraps email sync` under the failing row, so a substring
    // check over the joined output passes even when the block itself renders
    // no command at all.
    const lines = outputLines();
    const header = lines.findIndex((l) => l.includes("Suggested fixes:"));
    expect(header).toBeGreaterThanOrEqual(0);
    expect(lines.slice(header + 1).join("\n")).toContain("wraps email sync");
  });

  it("lists a command-less remedy's summary in the suggested-fixes block", async () => {
    // The only place a manual remedy can reach the user: displayFindings
    // prints a row's `fix:` line from the command alone, so a remediation
    // carrying no command is invisible unless the block renders its summary.
    mockCollectEmailFindings.mockResolvedValue(
      emailResult([
        {
          status: "warn",
          category: "Event Pipeline",
          name: "DLQ wraps-email-events-dlq",
          details: "12 dead-lettered events",
          remediation: remediations.dlqBacklog(),
        },
      ])
    );
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({});

    const lines = outputLines();
    const header = lines.findIndex((l) => l.includes("Suggested fixes:"));
    expect(header).toBeGreaterThanOrEqual(0);
    expect(lines.slice(header + 1).join("\n")).toContain(
      remediations.dlqBacklog().summary
    );
  });

  it("exits non-zero when any finding failed", async () => {
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({});

    expect(process.exitCode).toBe(1);
  });

  it("leaves the exit code unset when every finding passed", async () => {
    mockCollectEmailFindings.mockResolvedValue(
      emailResult([
        { status: "pass", category: "Event Pipeline", name: "SES config set" },
      ])
    );
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({});

    expect(process.exitCode).toBeUndefined();
  });

  it("skips the email leg when AWS credentials are not configured, still reporting the AWS findings", async () => {
    // wrapsDoctor detects the state itself now and passes it down, so the leg
    // gate is set here rather than through the mocked collectAwsFindings.
    mockDetectAWSState.mockResolvedValue(
      baseState({ credentialsConfigured: false, accountId: null })
    );
    mockCollectAwsFindings.mockResolvedValue({
      findings: [
        {
          status: "fail",
          category: "AWS Setup",
          name: "Cannot connect to AWS",
        },
      ],
    });
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({});

    expect(mockCollectEmailFindings).not.toHaveBeenCalled();
    const output = consoleLogSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Cannot connect to AWS");
  });

  it("emits one doctor JSON envelope carrying findings, summary and remediations", async () => {
    mockIsJsonMode.mockReturnValue(true);
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({ json: true });

    const [event, payload] = mockJsonSuccess.mock.calls[0] as [
      string,
      DoctorPayload,
    ];
    expect(event).toBe("doctor");
    // `findings` is the envelope's only per-row field and the one a script
    // inventories infrastructure from. `expect.any(Array)` checks
    // `Array.isArray` and nothing else, so a leg that dropped or filtered rows
    // still passed while `summary` — computed upstream of the payload — kept
    // reporting the rows that never shipped.
    expect(payload.findings.map((f) => `${f.status}:${f.name}`)).toEqual([
      "pass:AWS CLI installed",
      "fail:SQS queue wraps-email-events",
    ]);
    expect(payload.summary).toEqual({ pass: 1, warn: 0, fail: 1 });
    // The counts must be the ones the shipped rows imply, not a tally of some
    // other list: a summary that disagrees with `findings` is a silent lie to
    // every CI gate reading it.
    expect(payload.summary).toEqual(countByStatus(payload));
    expect(payload.remediations).toEqual([remediations.syncStack()]);
  });

  it("checks the region of the only email deployment when none was given", async () => {
    mockFindConnections.mockResolvedValue([{ region: "eu-west-1" }]);
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({});

    expect(mockCollectEmailFindings).toHaveBeenCalledWith(
      expect.objectContaining({ region: "eu-west-1" })
    );
  });

  it("names the unchecked regions instead of prompting when several deployments exist", async () => {
    mockFindConnections.mockResolvedValue([
      { region: "us-west-2" },
      { region: "eu-west-1" },
    ]);
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({});

    expect(mockCollectEmailFindings).toHaveBeenCalledWith(
      expect.objectContaining({ region: "us-west-2" })
    );
    const output = consoleLogSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("checked us-west-2 only");
    expect(output).toContain("eu-west-1");
  });

  it("checks a region something is actually deployed in, not the us-east-1 fallback, when several deployments exist", async () => {
    // getAWSRegion() returns this hardcoded default whenever AWS_REGION and
    // AWS_DEFAULT_REGION are both unset, and nothing is deployed there. A scan
    // of us-east-1 finds no wraps-* resources and no connection for the
    // region, so the event-pipeline check never runs and a broken eu-west-1
    // pipeline is reported clean.
    mockGetAWSRegion.mockResolvedValue("us-east-1");
    mockFindConnections.mockResolvedValue([
      { region: "eu-west-1" },
      { region: "ap-south-1" },
    ]);
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({});

    expect(mockCollectEmailFindings).toHaveBeenCalledWith(
      expect.objectContaining({ region: "eu-west-1" })
    );
    const output = consoleLogSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("checked eu-west-1 only");
    expect(output).toContain("ap-south-1");
    expect(output).not.toContain("us-east-1");
  });

  it("keeps the region given on the command line even when a deployment lives elsewhere", async () => {
    // --region is how a user checks a second region on purpose. Overriding it
    // with the connection's region reports on a region they did not ask about
    // and prints nothing to say so.
    mockFindConnections.mockResolvedValue([{ region: "eu-west-1" }]);
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({ region: "us-east-1" });

    expect(mockCollectEmailFindings).toHaveBeenCalledWith(
      expect.objectContaining({ region: "us-east-1" })
    );
  });

  it("keeps the region from AWS_REGION and stays quiet about the other deployments", async () => {
    // An explicit env region is a choice too: getAWSRegion() returns it, so
    // there is no fallback to correct and nothing to warn about.
    process.env.AWS_REGION = "us-east-1";
    mockGetAWSRegion.mockResolvedValue("us-east-1");
    // getCurrentRegion() (aws-detection.ts:238-245) reads AWS_REGION first in
    // production, so state.region mirrors the env var here — otherwise the
    // fixture would describe an account that cannot exist.
    mockDetectAWSState.mockResolvedValue(baseState({ region: "us-east-1" }));
    mockFindConnections.mockResolvedValue([
      { region: "eu-west-1" },
      { region: "ap-south-1" },
    ]);
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({});

    expect(mockCollectEmailFindings).toHaveBeenCalledWith(
      expect.objectContaining({ region: "us-east-1" })
    );
    const output = consoleLogSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).not.toContain("Multiple email deployments");
  });

  it("reports a failed email leg as a warning with a permissions remedy, not a stack trace", async () => {
    mockCollectEmailFindings.mockRejectedValue(new Error("AccessDenied"));
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({});

    const output = consoleLogSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output).toContain("Email checks did not run");
    expect(output).toContain(remediations.reviewPermissions().command);
  });

  it("keeps every row of a category together, whatever order the collectors returned them in", async () => {
    mockCollectEmailFindings.mockResolvedValue(
      emailResult([
        { status: "pass", category: "Event Pipeline", name: "first hop" },
        { status: "warn", category: "Resources", name: "orphan table" },
        { status: "pass", category: "Event Pipeline", name: "second hop" },
      ])
    );
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({});

    const output = consoleLogSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(output.indexOf("second hop")).toBeLessThan(
      output.indexOf("orphan table")
    );
  });

  it("marks each row with the icon its status earned, not a uniform pass tick", async () => {
    // The status icon is the only per-row signal of what is broken: the
    // summary line says "1 issue(s) found" but never which row. A row that
    // renders a green [\u2713] over a failing hop is the exact misdirection
    // this command exists to remove, and every other assertion in this file
    // matches on the name or detail alone, which survives any icon at all.
    mockCollectAwsFindings.mockResolvedValue(
      awsResult({
        findings: [
          { status: "pass", category: "AWS Setup", name: "AWS CLI installed" },
        ],
      })
    );
    mockCollectEmailFindings.mockResolvedValue(
      emailResult([
        {
          status: "fail",
          category: "Event Pipeline",
          name: "SQS queue wraps-email-events",
          details: "Queue not found",
        },
        {
          status: "warn",
          category: "Event Pipeline",
          name: "DLQ wraps-email-events-dlq",
        },
        {
          status: "info",
          category: "Email",
          name: "Multiple email deployments",
        },
      ])
    );
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({});

    const rowFor = (name: string): string => {
      const line = outputLines().find((l) => stripAnsi(l).includes(name));
      expect(line, `no row rendered for ${name}`).toBeDefined();
      return stripAnsi(line as string);
    };

    // The full prefix, anchored: `.toContain("\u2717")` would pass on a report
    // that stamped every row with every icon.
    expect(rowFor("AWS CLI installed")).toBe(
      "  [\u2713] AWS Setup: AWS CLI installed"
    );
    expect(rowFor("SQS queue wraps-email-events")).toBe(
      "  [\u2717] Event Pipeline: SQS queue wraps-email-events"
    );
    expect(rowFor("DLQ wraps-email-events-dlq")).toBe(
      "  [!] Event Pipeline: DLQ wraps-email-events-dlq"
    );
    expect(rowFor("Multiple email deployments")).toBe(
      "  [i] Email: Multiple email deployments"
    );
  });

  it("checks the same region on the AWS leg as on the email leg", async () => {
    // The AWS leg used to run before a region existed, so it answered the SES
    // sandbox question for the ambient region while the email leg scanned the
    // deployment's — one report, one header, two regions, and SES sending
    // status is per-region.
    mockFindConnections.mockResolvedValue([{ region: "eu-west-1" }]);
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({});

    expect(mockCollectAwsFindings).toHaveBeenCalledWith(
      expect.objectContaining({ region: "eu-west-1" })
    );
    expect(mockCollectEmailFindings).toHaveBeenCalledWith(
      expect.objectContaining({ region: "eu-west-1" })
    );
  });

  it("sends the region given on the command line to the AWS leg too", async () => {
    mockFindConnections.mockResolvedValue([{ region: "eu-west-1" }]);
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({ region: "us-east-1" });

    expect(mockCollectAwsFindings).toHaveBeenCalledWith(
      expect.objectContaining({ region: "us-east-1" })
    );
  });

  it("hands the AWS leg the state it already detected", async () => {
    mockFindConnections.mockResolvedValue([{ region: "eu-west-1" }]);
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({});

    // The argument, not the call count: `../aws/doctor.js` is fully mocked, so
    // a collectAwsFindings({ region }) that dropped `state` would still leave
    // detectAWSState called exactly once here — while production paid a second
    // `aws configure` / STS round trip and let the two reads disagree.
    expect(mockCollectAwsFindings).toHaveBeenCalledWith({
      region: "eu-west-1",
      state: expect.objectContaining({
        accountId: "123456789012",
        credentialsConfigured: true,
      }),
    });
    expect(mockDetectAWSState).toHaveBeenCalledTimes(1);
  });

  it("checks the configured region, not getAWSRegion()'s hardcoded fallback, when nothing else supplies one", async () => {
    // ap-southeast-2 is a region only `state.region` can supply here:
    // getAWSRegion is mocked to "us-west-2", which is also baseState()'s
    // region, so reusing baseState()'s value would make both branches of
    // `state.region || (await getAWSRegion())` produce the same answer and the
    // test could not fail. In production `state.region` is the one that
    // reflects `aws configure get region`.
    mockDetectAWSState.mockResolvedValue(
      baseState({ region: "ap-southeast-2" })
    );
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({});

    expect(mockCollectAwsFindings).toHaveBeenCalledWith(
      expect.objectContaining({ region: "ap-southeast-2" })
    );
    expect(mockCollectEmailFindings).toHaveBeenCalledWith(
      expect.objectContaining({ region: "ap-southeast-2" })
    );
  });

  it("reports remediation ids to telemetry, carrying no domain names", async () => {
    // `reAddDomain` is the one remedy whose command embeds a customer domain
    // (`wraps email domains add --domain extra.com`). Without it in the run,
    // "carries no domain names" would be true of any payload at all.
    mockCollectEmailFindings.mockResolvedValue(
      emailResult([
        {
          status: "fail",
          category: "Resources",
          name: "Configuration set for extra.com",
          remediation: remediations.reAddDomain("extra.com"),
        },
        {
          status: "fail",
          category: "Event Pipeline",
          name: "SQS queue wraps-email-events",
          remediation: remediations.syncStack(),
        },
      ])
    );
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({});

    const props = mockTrackCommand.mock.calls[0][1];
    // The exact value, not a substring: sorted ids and nothing else. Mapping
    // to the command instead would still "contain" the ids while shipping
    // every command, customer domains included.
    expect(props.remediation_ids).toBe("email.domains.add,email.sync");
    expect(props.remediation_ids).not.toContain("extra.com");
    expect(props.fail_count).toBe(2);
  });

  it("reports remediation ids to telemetry on a json run too, carrying no domain names", async () => {
    // Scripted/CI runs are the ones worth counting remedies for, and they take
    // the --json early return that sits below the trackCommand call.
    mockIsJsonMode.mockReturnValue(true);
    mockCollectEmailFindings.mockResolvedValue(
      emailResult([
        {
          status: "fail",
          category: "Resources",
          name: "Configuration set for extra.com",
          remediation: remediations.reAddDomain("extra.com"),
        },
        {
          status: "fail",
          category: "Event Pipeline",
          name: "SQS queue wraps-email-events",
          remediation: remediations.syncStack(),
        },
      ])
    );
    const { wrapsDoctor } = await import("../doctor.js");

    await wrapsDoctor({ json: true });

    expect(mockTrackCommand).toHaveBeenCalledTimes(1);
    const props = mockTrackCommand.mock.calls[0][1];
    expect(props.remediation_ids).toBe("email.domains.add,email.sync");
    expect(props.remediation_ids).not.toContain("extra.com");
  });
});
