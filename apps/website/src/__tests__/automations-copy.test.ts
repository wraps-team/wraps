import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "..", "..", "..", "..");
const read = (p: string) => readFileSync(resolve(repoRoot, p), "utf8");

const FILES = [
  "apps/website/src/app/platform/components/automations-section.tsx",
  "apps/website/src/app/landing/components/automations-code-panel.tsx",
  "apps/website/src/app/sdk/components/automations-section.tsx",
];

describe("automations marketing copy", () => {
  it.each(FILES)("%s does not hardcode a Free workflow count", (file) => {
    expect(read(file)).not.toMatch(/\b\d+ workflows? included/);
  });

  it.each(FILES)("%s does not sell webhooks as a workflow action", (file) => {
    // The builder hides the webhook node until delivery has retries and
    // verification (apps/web .../workflow-builder/node-palette.tsx).
    expect(read(file)).not.toMatch(/webhook/i);
  });

  it("the Free workflow count comes from TIER_LIMITS", () => {
    for (const file of FILES.slice(0, 2)) {
      expect(read(file)).toContain("TIER_LIMITS.free.workflows");
    }
  });
});
