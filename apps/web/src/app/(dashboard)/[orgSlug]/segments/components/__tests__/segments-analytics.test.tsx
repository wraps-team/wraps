/**
 * Segments instrumentation (audit finding F16, wave 3).
 *
 * `posthog.capture` appeared zero times across the segments tree before this
 * pass. Production holds exactly one segment and seven users reached
 * `/segments` in 90 days - these assert the create funnel
 * (`create_segment_opened` -> `segment_filter_field_changed` ->
 * `segment_preview` -> `segment_created`) actually fires, with preview
 * failures captured distinctly from successes, and that no sample-email PII
 * leaks into any capture payload.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SegmentWithMeta } from "@/lib/segments";

const capture = vi.fn();
vi.mock("posthog-js", () => ({
  default: { capture: (...args: unknown[]) => capture(...args) },
}));

const push = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const createSegment = vi.fn();
const deleteSegment = vi.fn();
const splitSegment = vi.fn();
const updateSegment = vi.fn();
const previewSegment = vi.fn();

vi.mock("@/actions/segments", () => ({
  createSegment: (...args: unknown[]) => createSegment(...args),
  deleteSegment: (...args: unknown[]) => deleteSegment(...args),
  previewSegment: (...args: unknown[]) => previewSegment(...args),
  splitSegment: (...args: unknown[]) => splitSegment(...args),
  updateSegment: (...args: unknown[]) => updateSegment(...args),
}));

import { SegmentsTable } from "../segments-table";

// jsdom has no ResizeObserver, which Radix's Select measures its trigger
// with, and no Pointer Events implementation - matches segments-table.test.tsx.
globalThis.ResizeObserver ??= class {
  observe() {
    // no layout in jsdom
  }
  unobserve() {
    // no-op
  }
  disconnect() {
    // no-op
  }
} as unknown as typeof ResizeObserver;

function stubPointerEvents() {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
}

function makeSegment(
  overrides: Partial<SegmentWithMeta> = {}
): SegmentWithMeta {
  return {
    id: "segment-1",
    name: "Active buyers",
    description: null,
    condition: { logic: "AND", groups: [] },
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
  stubPointerEvents();
  capture.mockClear();
  push.mockClear();
  replace.mockClear();
  refresh.mockClear();
  createSegment.mockReset();
  deleteSegment.mockReset();
  splitSegment.mockReset();
  updateSegment.mockReset();
  previewSegment.mockReset();
  // The details sheet and edit dialog both auto-load a preview on open -
  // give every test a default resolution so only the tests that care about
  // the preview response need to override it.
  previewSegment.mockResolvedValue({
    success: true,
    count: 0,
    sampleEmails: [],
  });
});

afterEach(cleanup);

describe("create_segment_opened", () => {
  it("captures source: toolbar from the header button", async () => {
    render(<SegmentsTable {...baseProps} segments={[makeSegment()]} />);

    await userEvent.click(
      screen.getByRole("button", { name: /^create segment$/i })
    );

    expect(capture).toHaveBeenCalledWith("create_segment_opened", {
      source: "toolbar",
    });
  });

  it("captures source: empty_state from the empty-list CTA", async () => {
    render(<SegmentsTable {...baseProps} segments={[]} />);

    await userEvent.click(
      screen.getByRole("button", { name: /create your first segment/i })
    );

    expect(capture).toHaveBeenCalledWith("create_segment_opened", {
      source: "empty_state",
    });
  });
});

describe("segment_detail_opened", () => {
  it("captures when a row is opened", async () => {
    render(<SegmentsTable {...baseProps} segments={[makeSegment()]} />);

    await userEvent.click(
      screen.getByRole("button", { name: /view details for active buyers/i })
    );

    expect(capture).toHaveBeenCalledWith("segment_detail_opened");
  });
});

describe("segment_preview", () => {
  it("captures result: validation_error without calling previewSegment, with no PII", async () => {
    // A filter with no value is invalid (`validateFilter` in lib/segments.ts)
    // - seed the segment with one so opening it and clicking Preview hits the
    // validation branch without needing to reproduce the builder's UI state.
    render(
      <SegmentsTable
        {...baseProps}
        segments={[
          makeSegment({
            condition: {
              logic: "AND",
              groups: [
                {
                  id: "g1",
                  filters: [{ id: "f1", field: "status", operator: "equals" }],
                },
              ],
            },
          }),
        ]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    await userEvent.click(await screen.findByText(/^edit$/i));
    await userEvent.click(screen.getByRole("button", { name: /^preview$/i }));

    expect(previewSegment).not.toHaveBeenCalled();
    expect(capture).toHaveBeenCalledWith("segment_preview", {
      filter_count: 1,
      match_count: null,
      mode: "edit",
      result: "validation_error",
    });
    for (const call of capture.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("@");
    }
  });

  it("captures result: success with the match count, no sample emails in the payload", async () => {
    previewSegment.mockResolvedValue({
      success: true,
      count: 7,
      sampleEmails: ["ada@example.com"],
    });

    render(
      <SegmentsTable
        {...baseProps}
        segments={[
          makeSegment({
            condition: {
              logic: "AND",
              groups: [
                {
                  id: "g1",
                  filters: [
                    {
                      id: "f1",
                      field: "status",
                      operator: "equals",
                      value: "active",
                    },
                  ],
                },
              ],
            },
          }),
        ]}
      />
    );

    // Edit the existing segment so the builder starts with one real filter.
    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    await userEvent.click(await screen.findByText(/^edit$/i));
    await userEvent.click(screen.getByRole("button", { name: /^preview$/i }));

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("segment_preview", {
        filter_count: 1,
        match_count: 7,
        mode: "edit",
        result: "success",
      });
    });
    for (const call of capture.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("ada@example.com");
    }
  });

  it("captures result: error distinctly from success", async () => {
    previewSegment.mockResolvedValue({
      success: false,
      error: "Query timed out",
    });

    render(
      <SegmentsTable
        {...baseProps}
        segments={[
          makeSegment({
            condition: {
              logic: "AND",
              groups: [
                {
                  id: "g1",
                  filters: [
                    {
                      id: "f1",
                      field: "status",
                      operator: "equals",
                      value: "active",
                    },
                  ],
                },
              ],
            },
          }),
        ]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    await userEvent.click(await screen.findByText(/^edit$/i));
    await userEvent.click(screen.getByRole("button", { name: /^preview$/i }));

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("segment_preview", {
        filter_count: 1,
        match_count: null,
        mode: "edit",
        result: "error",
      });
    });
  });
});

describe("segment_created", () => {
  it("captures filter_count, base field ids, and track_membership only on success", async () => {
    createSegment.mockResolvedValue({
      success: true,
      segment: makeSegment(),
    });

    render(<SegmentsTable {...baseProps} segments={[]} />);

    await userEvent.click(
      screen.getByRole("button", { name: /create your first segment/i })
    );
    await userEvent.type(screen.getByLabelText(/^name$/i), "VIPs");
    await userEvent.click(
      screen.getByRole("button", { name: /^create segment$/i })
    );

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("segment_created", {
        fields: ["status"],
        filter_count: 1,
        track_membership: false,
      });
    });
  });

  it("does not capture when creation fails", async () => {
    createSegment.mockResolvedValue({ success: false, error: "nope" });

    render(<SegmentsTable {...baseProps} segments={[]} />);

    await userEvent.click(
      screen.getByRole("button", { name: /create your first segment/i })
    );
    await userEvent.type(screen.getByLabelText(/^name$/i), "VIPs");
    await userEvent.click(
      screen.getByRole("button", { name: /^create segment$/i })
    );

    await waitFor(() => expect(createSegment).toHaveBeenCalled());
    expect(capture).not.toHaveBeenCalledWith(
      "segment_created",
      expect.anything()
    );
  });
});

describe("segment_deleted", () => {
  it("captures only after a successful delete", async () => {
    deleteSegment.mockResolvedValue({ success: true });

    render(<SegmentsTable {...baseProps} segments={[makeSegment()]} />);

    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    await userEvent.click(await screen.findByText(/^delete$/i));
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("segment_deleted");
    });
  });
});

describe("segment_split", () => {
  it("captures the resulting partition count", async () => {
    splitSegment.mockResolvedValue({
      success: true,
      segments: [
        { id: "s1", name: "Active buyers 1", memberCount: 21 },
        { id: "s2", name: "Active buyers 2", memberCount: 21 },
      ],
    });

    render(<SegmentsTable {...baseProps} segments={[makeSegment()]} />);

    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    await userEvent.click(await screen.findByText(/split into partitions/i));
    await userEvent.click(
      screen.getByRole("button", { name: /^split segment$/i })
    );

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("segment_split", {
        partition_count: 2,
      });
    });
  });
});
