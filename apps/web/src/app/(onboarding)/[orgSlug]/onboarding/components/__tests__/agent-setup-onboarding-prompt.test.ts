/**
 * The onboarding variant of the shared agent prompt must stay byte-identical to
 * what `buildAgentPrompt` produced before it moved into @wraps/ui. The fixtures
 * were recorded from that function before it was deleted.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  agentDeepLinks,
  buildAgentSetupPrompt,
} from "@wraps/ui/lib/agent-setup";
import { describe, expect, it } from "vitest";

const fixture = (name: string) =>
  readFileSync(resolve(__dirname, "fixtures", name), "utf8");

const cases = [
  ["hosted, with org", false, "Acme Co", "onboarding-prompt-hosted-org.txt"],
  ["hosted, no org", false, undefined, "onboarding-prompt-hosted-noorg.txt"],
  [
    "self-hosted, with org",
    true,
    "Acme Co",
    "onboarding-prompt-selfhosted-org.txt",
  ],
  [
    "self-hosted, no org",
    true,
    undefined,
    "onboarding-prompt-selfhosted-noorg.txt",
  ],
] as const;

describe("onboarding agent setup prompt", () => {
  it.each(cases)(
    "is byte-identical to the recorded output: %s",
    (_n, selfHosted, orgName, file) => {
      const prompt = buildAgentSetupPrompt({
        context: "onboarding",
        orgName,
        selfHosted,
      });
      expect(prompt).toBe(fixture(file));
    }
  );

  it("collapses whitespace and newlines in the org name", () => {
    const prompt = buildAgentSetupPrompt({
      context: "onboarding",
      orgName: "  Acme \n\n  Co\t ",
    });
    expect(prompt).toBe(fixture("onboarding-prompt-hosted-org.txt"));
    expect(prompt).toContain('choose "Acme Co".');
  });

  it("treats a whitespace-only org name as no org", () => {
    const prompt = buildAgentSetupPrompt({
      context: "onboarding",
      orgName: " \n ",
    });
    expect(prompt).toBe(fixture("onboarding-prompt-hosted-noorg.txt"));
  });

  it("never carries an organization ID, webhook secret or credential into the prompt or links", () => {
    const organizationId = "org_7f3a9c1e-1111-4222-8333-944455556666";
    const webhookSecret = "f".repeat(64);
    // Only orgName is accepted; extra fields a caller might spread in are ignored.
    const opts = {
      context: "onboarding" as const,
      orgName: "Acme Co",
      selfHosted: false,
      organizationId,
      webhookSecret,
    };
    const prompt = buildAgentSetupPrompt(opts);
    const links = Object.values(agentDeepLinks(prompt)).join("\n");
    for (const secret of [organizationId, webhookSecret]) {
      expect(prompt).not.toContain(secret);
      expect(links).not.toContain(secret);
    }
    expect(prompt).not.toMatch(/AKIA[0-9A-Z]{16}|webhook|secret/i);
  });
});
