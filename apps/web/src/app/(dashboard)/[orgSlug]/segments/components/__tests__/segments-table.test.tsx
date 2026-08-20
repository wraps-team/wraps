/**
 * Segments table - keyboard access to a row that opens a details sheet
 * (audit finding F9), and the "/" shortcut replacing the Cmd/Ctrl+F hijack
 * (audit finding F22).
 *
 * Every row opened the details sheet only on `onClick`, with no tabIndex,
 * role, or key handler - mouse only (WCAG 2.1.1, Level A). There is no URL a
 * segment can link to, so the fix is a real button in the row rather than a
 * `<Link>` in a cell.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SegmentWithMeta } from "@/lib/segments";

const push = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/actions/segments", () => ({
  createSegment: vi.fn(),
  deleteSegment: vi.fn(),
  previewSegment: vi.fn().mockResolvedValue({
    success: true,
    count: 0,
    sampleEmails: [],
  }),
  splitSegment: vi.fn(),
  updateSegment: vi.fn(),
}));

import { SegmentsTable } from "../segments-table";

function makeSegment(
  overrides: Partial<SegmentWithMeta> = {}
): SegmentWithMeta {
  return {
    id: "segment-1",
    name: "Active buyers",
    description: null,
    condition: { logic: "AND", groups: [] } as never,
    trackMembership: false,
    memberCount: 42,
    lastComputedAt: new Date("2026-08-01T00:00:00.000Z"),
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    createdBy: null,
    ...overrides,
  };
}

const baseProps = {
  orgSlug: "acme",
  organizationId: "org-1",
  propertyKeys: [],
  topics: [],
  userRole: "owner",
};

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  refresh.mockClear();
});

afterEach(cleanup);

describe("'/' focuses search instead of hijacking Cmd/Ctrl+F (F22)", () => {
  it("shows '/' as the shortcut hint, not the Mac Cmd+F glyph", () => {
    render(<SegmentsTable {...baseProps} segments={[makeSegment()]} />);

    expect(screen.queryByText("⌘F")).toBeNull();
    expect(screen.getByText("/")).toBeInTheDocument();
  });

  it("focuses the search box on '/'", async () => {
    render(<SegmentsTable {...baseProps} segments={[makeSegment()]} />);

    await userEvent.keyboard("/");

    expect(screen.getByPlaceholderText(/search segments/i)).toHaveFocus();
  });
});

describe("rows are keyboard-operable (F9)", () => {
  it("exposes each row as a focusable, labelled button", () => {
    render(<SegmentsTable {...baseProps} segments={[makeSegment()]} />);

    const row = screen.getByRole("button", {
      name: "View details for Active buyers",
    });
    expect(row).toHaveAttribute("tabIndex", "0");
  });

  it("opens the details sheet on Enter", async () => {
    render(<SegmentsTable {...baseProps} segments={[makeSegment()]} />);

    const row = screen.getByRole("button", {
      name: "View details for Active buyers",
    });
    row.focus();
    await userEvent.keyboard("{Enter}");

    // The sheet renders its own heading once open.
    expect(
      screen.getByRole("heading", { name: "Active buyers" })
    ).toBeInTheDocument();
  });

  it("opens the details sheet on Space", async () => {
    render(<SegmentsTable {...baseProps} segments={[makeSegment()]} />);

    const row = screen.getByRole("button", {
      name: "View details for Active buyers",
    });
    row.focus();
    await userEvent.keyboard(" ");

    expect(
      screen.getByRole("heading", { name: "Active buyers" })
    ).toBeInTheDocument();
  });
});
