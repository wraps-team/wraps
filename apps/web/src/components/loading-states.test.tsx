/**
 * Loading State Tests
 *
 * Shallow render checks for the dashboard `loading.tsx` fallbacks. Nothing
 * else imports these files (they're wired up by Next.js file conventions),
 * so this is the only thing that will fail loudly if one of them is deleted
 * or turned into something that throws on render.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import TemplateEditorLoading from "../app/(dashboard)/[orgSlug]/emails/templates/[id]/loading";
import OrgHomeLoading from "../app/(dashboard)/[orgSlug]/loading";
import SettingsLoading from "../app/(dashboard)/[orgSlug]/settings/loading";
import DashboardSegmentLoading from "../app/(dashboard)/loading";

afterEach(() => {
  cleanup();
});

describe("dashboard loading states", () => {
  it("renders the generic dashboard segment fallback", () => {
    render(<DashboardSegmentLoading />);

    expect(screen.getByTestId("dashboard-loading")).toBeInTheDocument();
  });

  it("renders the org home fallback", () => {
    render(<OrgHomeLoading />);

    expect(screen.getByTestId("org-home-loading")).toBeInTheDocument();
  });

  it("renders the settings fallback", () => {
    render(<SettingsLoading />);

    expect(screen.getByTestId("settings-loading")).toBeInTheDocument();
  });

  it("renders the template editor fallback", () => {
    render(<TemplateEditorLoading />);

    expect(screen.getByTestId("template-editor-loading")).toBeInTheDocument();
  });
});
