import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clack/prompts");

import * as clack from "@clack/prompts";
import type { ApiTarget } from "../api-target.js";
import type { OrgInfo } from "../config.js";
import { WrapsError } from "../errors.js";
import { setJsonMode } from "../json-output.js";
import { resolvePushOrg } from "../push-org.js";

class ExitError extends Error {
  constructor(public code?: number) {
    super(`process.exit(${code})`);
  }
}

const ORGS: OrgInfo[] = [
  { id: "org-1", name: "Acme", slug: "acme" },
  { id: "org-2", name: "Beta Co", slug: "beta-co" },
  { id: "org-3", name: "Gamma", slug: "gamma" },
];

function target(over: Partial<ApiTarget> = {}): ApiTarget {
  return {
    apiBase: "https://api.example",
    appUrl: "https://app.example",
    token: "sess",
    tokenType: "session",
    organizations: ORGS,
    selfhosted: false,
    loginCommand: "wraps auth login",
    ...over,
  } as ApiTarget;
}

describe("resolvePushOrg", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setJsonMode(false);
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new ExitError(code);
    }) as never);
    vi.mocked(clack.isCancel).mockReturnValue(false);
    vi.mocked(clack.select).mockResolvedValue("org-1");
    vi.mocked(clack.log).warn = vi.fn();
    vi.mocked(clack.log).info = vi.fn();
  });

  afterEach(() => {
    setJsonMode(false);
    vi.restoreAllMocks();
  });

  it("resolves the config org by slug without prompting", async () => {
    const org = await resolvePushOrg({ target: target(), configOrg: "acme" });
    expect(org?.id).toBe("org-1");
    expect(clack.select).not.toHaveBeenCalled();
  });

  it("matches case-insensitively", async () => {
    const org = await resolvePushOrg({ target: target(), configOrg: "ACME" });
    expect(org?.id).toBe("org-1");
  });

  it("accepts an org id via the flag", async () => {
    const org = await resolvePushOrg({
      target: target(),
      flagOrg: "org-2",
      configOrg: "acme",
    });
    expect(org?.slug).toBe("beta-co");
  });

  it("warns when the flag overrides the config org", async () => {
    const org = await resolvePushOrg({
      target: target(),
      flagOrg: "gamma",
      configOrg: "acme",
    });
    expect(org?.id).toBe("org-3");
    const msg = vi.mocked(clack.log.warn).mock.calls[0]?.[0] as string;
    expect(msg).toContain("gamma");
    expect(msg).toContain("acme");
  });

  it("returns null and warns when --org is passed with an API key", async () => {
    const org = await resolvePushOrg({
      target: target({ tokenType: "api-key" }),
      flagOrg: "acme",
      configOrg: "acme",
    });
    expect(org).toBeNull();
    expect(vi.mocked(clack.log.warn).mock.calls[0]?.[0]).toContain("API key");
  });

  it("returns null silently for an API key without --org", async () => {
    const org = await resolvePushOrg({
      target: target({ tokenType: "api-key" }),
      configOrg: "acme",
    });
    expect(org).toBeNull();
    expect(clack.log.warn).not.toHaveBeenCalled();
  });

  it("returns null when signed out", async () => {
    const org = await resolvePushOrg({
      target: target({ token: null }),
      configOrg: "my-org",
    });
    expect(org).toBeNull();
    expect(clack.select).not.toHaveBeenCalled();
    expect(clack.log.warn).not.toHaveBeenCalled();
  });

  it("returns null and points at login when the org list is missing", async () => {
    const org = await resolvePushOrg({
      target: target({ organizations: undefined }),
      configOrg: "acme",
    });
    expect(org).toBeNull();
    expect(vi.mocked(clack.log.info).mock.calls[0]?.[0]).toContain(
      "wraps auth login"
    );
  });

  it("prompts when the config org matches nothing", async () => {
    vi.mocked(clack.select).mockResolvedValue("org-3");
    const org = await resolvePushOrg({ target: target(), configOrg: "my-org" });
    expect(org?.id).toBe("org-3");
    expect(clack.select).toHaveBeenCalledTimes(1);
    const opts = vi.mocked(clack.select).mock.calls[0]?.[0] as {
      options: unknown[];
    };
    expect(opts.options).toHaveLength(3);
  });

  it("still prompts when the user has a single org", async () => {
    vi.mocked(clack.select).mockResolvedValue("org-1");
    await resolvePushOrg({
      target: target({ organizations: [ORGS[0]] }),
      configOrg: "my-org",
    });
    expect(clack.select).toHaveBeenCalledTimes(1);
  });

  it("throws ORG_NOT_FOUND in JSON mode instead of prompting", async () => {
    setJsonMode(true);
    const err = await resolvePushOrg({
      target: target(),
      configOrg: "my-org",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(WrapsError);
    expect(err.code).toBe("ORG_NOT_FOUND");
    expect(err.suggestion).toContain("acme, beta-co, gamma");
    expect(clack.select).not.toHaveBeenCalled();
  });

  it("throws ORG_NOT_FOUND with --yes", async () => {
    const err = await resolvePushOrg({
      target: target(),
      configOrg: "my-org",
      yes: true,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(WrapsError);
    expect(err.code).toBe("ORG_NOT_FOUND");
  });

  it("exits 0 when the prompt is cancelled", async () => {
    vi.mocked(clack.isCancel).mockReturnValue(true);
    const err = await resolvePushOrg({
      target: target(),
      configOrg: "my-org",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ExitError);
    expect(err.code).toBe(0);
  });
});
