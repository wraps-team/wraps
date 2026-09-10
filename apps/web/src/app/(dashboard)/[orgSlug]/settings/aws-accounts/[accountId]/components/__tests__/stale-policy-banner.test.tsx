// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  CURRENT_CONSOLE_POLICY_VERSION,
  StalePolicyBanner,
} from "../stale-policy-banner";

afterEach(cleanup);

describe("StalePolicyBanner", () => {
  it("renders nothing when consolePolicyVersion is null (never probed)", () => {
    // The most important case in this plan: every account is NULL until the
    // sweep has run once, and an unprobed role is indistinguishable from a
    // stale one from the database alone. Rendering a warning here would be a
    // false alarm to the entire customer base at once.
    const { container } = render(
      <StalePolicyBanner account={{ consolePolicyVersion: null }} />
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when consolePolicyVersion equals the current version", () => {
    const { container } = render(
      <StalePolicyBanner account={{ consolePolicyVersion: 4 }} />
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders a warning with a link to #iam-role when one version behind", () => {
    render(<StalePolicyBanner account={{ consolePolicyVersion: 3 }} />);

    expect(
      screen.getByText("Your AWS role is behind the current Wraps policy")
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "IAM Role Configuration" });
    expect(link).toHaveAttribute("href", "#iam-role");
  });

  it("renders when consolePolicyVersion is 0 (behind, not absent)", () => {
    // A role failing even the baseline probe is still "behind" — it is not
    // the same thing as never having been probed (null).
    render(<StalePolicyBanner account={{ consolePolicyVersion: 0 }} />);

    expect(
      screen.getByText("Your AWS role is behind the current Wraps policy")
    ).toBeInTheDocument();
  });

  it("renders a non-destructive (warning) alert, not the destructive variant", () => {
    render(<StalePolicyBanner account={{ consolePolicyVersion: 3 }} />);

    const alert = screen.getByRole("alert");
    // The destructive variant's cva class list includes "text-destructive";
    // the default variant does not. The role works — it is behind, not down.
    expect(alert.className).not.toContain("text-destructive");
  });

  it("keeps its local CURRENT_CONSOLE_POLICY_VERSION pinned to apps/api's source of truth", () => {
    // apps/web cannot import from apps/api, so the banner declares its own
    // copy of the constant. Parse the API file's source text rather than
    // importing it, so a rename of the API constant fails loudly here
    // instead of the two copies silently drifting.
    //
    // Resolved from the package root (process.cwd() === apps/web when
    // vitest runs — apps/web/vitest.config.ts calls
    // loadEnv("test", process.cwd(), "")), not from this file's own
    // directory: the test sits nine directories deep, and a hand-counted
    // `../` chain from here is exactly the kind of thing that silently
    // resolves to the wrong file.
    const apiSource = readFileSync(
      path.resolve(process.cwd(), "../api/src/lib/console-policy-version.ts"),
      "utf8"
    );
    const match = apiSource.match(
      /export const CURRENT_CONSOLE_POLICY_VERSION\s*=\s*(\d+)/
    );
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBe(CURRENT_CONSOLE_POLICY_VERSION);
  });
});
