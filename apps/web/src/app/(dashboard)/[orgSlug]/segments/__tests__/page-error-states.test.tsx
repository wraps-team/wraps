/**
 * Segments page — error vs. empty (audit finding F6) and page identity (F19)
 *
 * `page.tsx` used to collapse a failed `listSegments` into `[]` and fall
 * through to `SegmentsTable`'s own "No segments found - Create your first
 * segment" empty state, indistinguishable from an org that has simply never
 * built one. These tests pin the replacement behavior: a failed fetch
 * renders a distinct, named error state (and a permission failure reads
 * differently from a generic one) before the table is ever reached.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORG_SLUG = "acme";
const ORG_ID = "org-1";
const USER_ID = "user-1";

const redirectMock = vi.fn((path: string) => {
  throw new Error(`redirect called with ${path}`);
});

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: USER_ID, email: "dev@acme.test", name: "Dev" },
      })),
    },
  },
}));

vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: vi.fn(async () => ({
    id: ORG_ID,
    slug: ORG_SLUG,
    name: "Acme",
    userRole: "owner" as const,
  })),
}));

vi.mock("@/lib/plan-limits", () => ({
  checkFeatureAccess: vi.fn(async () => ({ allowed: true })),
  getOrganizationPlan: vi.fn(async () => "growth"),
}));

vi.mock("@/lib/plans", () => ({
  getRequiredPlan: () => "starter",
}));

vi.mock("@/actions/shared/org-action", () => ({
  UNAUTHORIZED: "You don't have access to this organization",
}));

const listSegmentsMock = vi.fn();
const getPropertyKeysMock = vi.fn();
vi.mock("@/actions/segments", () => ({
  listSegments: (...args: unknown[]) => listSegmentsMock(...args),
  getPropertyKeys: (...args: unknown[]) => getPropertyKeysMock(...args),
}));

const listTopicsMock = vi.fn();
vi.mock("@/actions/topics", () => ({
  listTopics: (...args: unknown[]) => listTopicsMock(...args),
}));

// The table itself is owned elsewhere and under active edit; this suite
// only needs to know which branch page.tsx picked.
vi.mock("../components/segments-table", () => ({
  SegmentsTable: () => <div data-testid="segments-table" />,
}));

vi.mock("@/components/feature-gate", () => ({
  FeatureGate: () => <div data-testid="feature-gate" />,
}));

async function renderSegmentsPage() {
  const { default: SegmentsPage } = await import("../page");
  const element = await SegmentsPage({
    params: Promise.resolve({ orgSlug: ORG_SLUG }),
  });
  return render(element as React.ReactElement);
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  getPropertyKeysMock.mockResolvedValue({ success: true, keys: [] });
  listTopicsMock.mockResolvedValue({ success: true, topics: [] });
});

describe('Segments page — a failed fetch is not "No segments found"', () => {
  it("never renders the table's empty state when listSegments fails", async () => {
    listSegmentsMock.mockResolvedValue({
      success: false,
      error: "Failed to fetch segments",
    });

    await renderSegmentsPage();

    expect(screen.queryByTestId("segments-table")).not.toBeInTheDocument();
    expect(screen.queryByText(/no segments found/i)).not.toBeInTheDocument();
  });

  it("keeps the page's <h1> on the error path", async () => {
    listSegmentsMock.mockResolvedValue({
      success: false,
      error: "Failed to fetch segments",
    });

    await renderSegmentsPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Segments" })
    ).toBeInTheDocument();
  });

  it("names the failure and offers a retry for a generic error", async () => {
    listSegmentsMock.mockResolvedValue({
      success: false,
      error: "Failed to fetch segments",
    });

    await renderSegmentsPage();

    expect(
      screen.getByText(/we couldn't load your segments/i)
    ).toBeInTheDocument();
    const retry = screen.getByRole("link", { name: /try again/i });
    expect(retry).toHaveAttribute("href", `/${ORG_SLUG}/segments`);
  });

  it("renders a distinct message for an unauthorized failure, with no retry", async () => {
    listSegmentsMock.mockResolvedValue({
      success: false,
      error: "You don't have access to this organization",
    });

    await renderSegmentsPage();

    expect(
      screen.getByText(/you don't have access to segments/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /try again/i })
    ).not.toBeInTheDocument();
  });

  it("renders the real table on success, even with zero segments", async () => {
    listSegmentsMock.mockResolvedValue({ success: true, segments: [] });

    await renderSegmentsPage();

    expect(screen.getByTestId("segments-table")).toBeInTheDocument();
    expect(
      screen.queryByText(/we couldn't load your segments/i)
    ).not.toBeInTheDocument();
  });

  it("degrades topics/property-key failures to an empty list rather than blocking the page", async () => {
    listSegmentsMock.mockResolvedValue({ success: true, segments: [] });
    listTopicsMock.mockResolvedValue({ success: false, error: "boom" });
    getPropertyKeysMock.mockResolvedValue({ success: false, error: "boom" });

    await renderSegmentsPage();

    expect(screen.getByTestId("segments-table")).toBeInTheDocument();
  });
});
