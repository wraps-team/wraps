import {
  agentDeepLinks,
  buildAgentSetupPrompt,
} from "@wraps/ui/lib/agent-setup";
import { describe, expect, it } from "vitest";

describe("agent setup prompt, website variant", () => {
  const prompt = buildAgentSetupPrompt({ context: "website" });

  it("stays under Claude Code's 1,000-character deep-link warning threshold", () => {
    expect(prompt.length).toBeLessThan(1000);
  });

  it("has no org line and ignores org name and self-hosted", () => {
    expect(prompt).not.toMatch(/which organization/i);
    expect(
      buildAgentSetupPrompt({
        context: "website",
        orgName: "Acme Co",
        selfHosted: true,
      })
    ).toBe(prompt);
    expect(prompt).not.toContain("Acme");
  });

  it("ends with the next steps and the agent docs link", () => {
    expect(prompt).toContain(
      "Then tell me what's left: add my sending domain and request production access, both from the Wraps dashboard."
    );
    expect(prompt.endsWith("https://wraps.dev/llms-full.txt")).toBe(true);
  });

  it("is a different text from the onboarding prompt", () => {
    expect(prompt).not.toBe(buildAgentSetupPrompt({ context: "onboarding" }));
  });
});

describe("agentDeepLinks", () => {
  const prompt = buildAgentSetupPrompt({ context: "website" });
  const links = agentDeepLinks(prompt);

  it.each([
    ["claudeCode", "claude-cli://open?q="],
    ["claudeApp", "claude://code/new?q="],
    ["cursor", "cursor://anysphere.cursor-deeplink/prompt?text="],
  ] as const)("%s link decodes back to the prompt", (key, prefix) => {
    expect(links[key].startsWith(prefix)).toBe(true);
    expect(decodeURIComponent(links[key].slice(prefix.length))).toBe(prompt);
  });

  it("percent-encodes characters that would break a URL", () => {
    const l = agentDeepLinks('a b&c=d#e\n"q"');
    for (const href of Object.values(l)) {
      const q = href.split(/[?]/)[1].replace(/^(q|text)=/, "");
      expect(q).not.toMatch(/[ &=#\n"]/);
    }
  });
});
