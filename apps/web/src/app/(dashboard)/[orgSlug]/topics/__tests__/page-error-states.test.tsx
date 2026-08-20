/**
 * Topics page — error vs. empty (audit finding F6) and page identity (F19)
 *
 * `page.tsx` used to collapse a failed `listTopics` into `[]` and fall
 * through to `TopicsTabs`'s own "No topics found - Create your first topic"
 * empty state, indistinguishable from an org that has simply never built
 * one. These tests pin the replacement behavior: a failed fetch renders a
 * distinct, named error state (and a permission failure reads differently
 * from a generic one).
 *
 * They also pin the other half of F6: the `topicSettings` / `awsAccount`
 * lookups run alongside `listTopics` are deliberately left unguarded - this
 * is the exact query that broke production on 2026-07-30 (`column
 * "preference_center_theme" does not exist`) - so a throw there must
 * propagate out of the page rather than being swallowed. The new
 * `error.tsx` in this segment is what turns that propagation into a page-
 * level boundary instead of a crashed dashboard shell; this suite only
 * proves the propagation half, since `error.tsx` is a framework boundary
 * component and out of a page-level test's reach.
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
    brandColor: null,
    logo: null,
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

const listTopicsMock = vi.fn();
vi.mock("@/actions/topics", () => ({
  listTopics: (...args: unknown[]) => listTopicsMock(...args),
}));

vi.mock("@/actions/aws-accounts", () => ({
  getVerifiedDomains: vi.fn(async () => ({ success: true, identities: [] })),
}));

const topicSettingsFindFirstMock = vi.fn();
const awsAccountFindFirstMock = vi.fn();
vi.mock("@wraps/db", () => ({
  db: {
    query: {
      topicSettings: {
        findFirst: (...args: unknown[]) => topicSettingsFindFirstMock(...args),
      },
      awsAccount: {
        findFirst: (...args: unknown[]) => awsAccountFindFirstMock(...args),
      },
    },
  },
}));

// The tabs component is owned elsewhere and under active edit; this suite
// only needs to know which branch page.tsx picked.
vi.mock("../components/topics-tabs", () => ({
  TopicsTabs: () => <div data-testid="topics-tabs" />,
}));

vi.mock("@/components/feature-gate", () => ({
  FeatureGate: () => <div data-testid="feature-gate" />,
}));

async function renderTopicsPage() {
  const { default: TopicsPage } = await import("../page");
  const element = await TopicsPage({
    params: Promise.resolve({ orgSlug: ORG_SLUG }),
  });
  return render(element as React.ReactElement);
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  topicSettingsFindFirstMock.mockResolvedValue(null);
  awsAccountFindFirstMock.mockResolvedValue(null);
});

describe('Topics page — a failed fetch is not "No topics found"', () => {
  it("never renders the tabs' empty state when listTopics fails", async () => {
    listTopicsMock.mockResolvedValue({
      success: false,
      error: "Failed to fetch topics",
    });

    await renderTopicsPage();

    expect(screen.queryByTestId("topics-tabs")).not.toBeInTheDocument();
    expect(screen.queryByText(/no topics found/i)).not.toBeInTheDocument();
  });

  it("keeps the page's <h1> on the error path", async () => {
    listTopicsMock.mockResolvedValue({
      success: false,
      error: "Failed to fetch topics",
    });

    await renderTopicsPage();

    expect(
      screen.getByRole("heading", { level: 1, name: "Topics" })
    ).toBeInTheDocument();
  });

  it("names the failure and offers a retry for a generic error", async () => {
    listTopicsMock.mockResolvedValue({
      success: false,
      error: "Failed to fetch topics",
    });

    await renderTopicsPage();

    expect(
      screen.getByText(/we couldn't load your topics/i)
    ).toBeInTheDocument();
    const retry = screen.getByRole("link", { name: /try again/i });
    expect(retry).toHaveAttribute("href", `/${ORG_SLUG}/topics`);
  });

  it("renders a distinct message for an unauthorized failure, with no retry", async () => {
    listTopicsMock.mockResolvedValue({
      success: false,
      error: "You don't have access to this organization",
    });

    await renderTopicsPage();

    expect(
      screen.getByText(/you don't have access to topics/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /try again/i })
    ).not.toBeInTheDocument();
  });

  it("renders the real tabs on success, even with zero topics", async () => {
    listTopicsMock.mockResolvedValue({ success: true, topics: [] });

    await renderTopicsPage();

    expect(screen.getByTestId("topics-tabs")).toBeInTheDocument();
  });
});

describe("Topics page — the unguarded topicSettings query is caught by the segment boundary, not swallowed", () => {
  it("propagates a thrown topicSettings lookup instead of rendering a stale page", async () => {
    listTopicsMock.mockResolvedValue({ success: true, topics: [] });
    topicSettingsFindFirstMock.mockRejectedValue(
      new Error('column "preference_center_theme" does not exist')
    );

    await expect(renderTopicsPage()).rejects.toThrow(/preference_center_theme/);
  });
});
