/**
 * Topics table - keyboard access to a row that opens the subscribers sheet
 * (audit finding F9), and the three audience numbers a row now reports
 * (F5, F10).
 *
 * The row opened the subscribers sheet only on `onClick`, with no tabIndex,
 * role, or key handler - mouse only (WCAG 2.1.1, Level A). The row's "..."
 * menu was a keyboard-reachable escape hatch, but not an equivalent to the
 * row's own primary action.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TopicWithMeta } from "@/lib/topics";

const push = vi.fn();
const replace = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/actions/topics", () => ({
  createTopic: vi.fn(),
  deleteTopic: vi.fn(),
  getTopicSubscribers: vi.fn().mockResolvedValue({
    success: true,
    subscribers: [],
    total: 0,
    page: 1,
    pageSize: 20,
  }),
  updateTopic: vi.fn(),
}));

import { TopicsTable } from "../topics-table";

function makeTopic(overrides: Partial<TopicWithMeta> = {}): TopicWithMeta {
  return {
    id: "topic-1",
    name: "Product Updates",
    slug: "product-updates",
    description: null,
    public: true,
    doubleOptIn: false,
    subscriberCount: 12,
    sendableCount: 12,
    pendingCount: 0,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    createdBy: null,
    ...overrides,
  };
}

const baseProps = {
  orgSlug: "acme",
  organizationId: "org-1",
  userRole: "owner",
};

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  refresh.mockClear();
});

afterEach(cleanup);

describe("rows are keyboard-operable (F9)", () => {
  it("exposes each row as a focusable, labelled button", () => {
    render(<TopicsTable {...baseProps} topics={[makeTopic()]} />);

    const row = screen.getByRole("button", {
      name: "View subscribers for Product Updates",
    });
    expect(row).toHaveAttribute("tabIndex", "0");
  });

  it("opens the subscribers sheet on Enter", async () => {
    render(<TopicsTable {...baseProps} topics={[makeTopic()]} />);

    const row = screen.getByRole("button", {
      name: "View subscribers for Product Updates",
    });
    row.focus();
    await userEvent.keyboard("{Enter}");

    expect(
      screen.getByRole("heading", { name: "Product Updates" })
    ).toBeInTheDocument();
  });

  it("opens the subscribers sheet on Space", async () => {
    render(<TopicsTable {...baseProps} topics={[makeTopic()]} />);

    const row = screen.getByRole("button", {
      name: "View subscribers for Product Updates",
    });
    row.focus();
    await userEvent.keyboard(" ");

    expect(
      screen.getByRole("heading", { name: "Product Updates" })
    ).toBeInTheDocument();
  });

  it("does not double-open when Enter bubbles from the row's own menu button", async () => {
    render(<TopicsTable {...baseProps} topics={[makeTopic()]} />);

    const menuButton = screen.getByRole("button", { name: /open menu/i });
    menuButton.focus();
    await userEvent.keyboard("{Enter}");

    // The dropdown opens (its own Enter behavior); the row's sheet must not.
    expect(
      screen.queryByRole("heading", { name: "Product Updates" })
    ).toBeNull();
  });
});

/**
 * "Subscribers" is who opted in; it is not who a broadcast reaches, and it
 * never included the people double opt-in parks in `pending`. A row that shows
 * one number for all three is the defect - so each is pinned separately here.
 */
describe("a row reports subscribed, sendable and pending separately (F5, F10)", () => {
  it("shows the sendable figure beneath the subscriber count", () => {
    render(
      <TopicsTable
        {...baseProps}
        topics={[makeTopic({ subscriberCount: 12, sendableCount: 9 })]}
      />
    );

    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("9 can be emailed")).toBeInTheDocument();
  });

  it("names the pending cohort when there is one", () => {
    render(
      <TopicsTable
        {...baseProps}
        topics={[makeTopic({ doubleOptIn: true, pendingCount: 6 })]}
      />
    );

    expect(screen.getByText("6 unconfirmed")).toBeInTheDocument();
  });

  it("shows no pending figure when nobody is waiting", () => {
    render(<TopicsTable {...baseProps} topics={[makeTopic()]} />);

    expect(screen.queryByText(/unconfirmed/)).toBeNull();
  });

  it("counts the unconfirmed sign-ups in the delete warning", async () => {
    render(
      <TopicsTable
        {...baseProps}
        topics={[makeTopic({ subscriberCount: 12, pendingCount: 6 })]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    await userEvent.click(
      screen.getByRole("menuitem", { name: /delete topic/i })
    );

    expect(
      screen.getByText(
        /remove all 12 subscriptions and 6 unconfirmed sign-ups\./
      )
    ).toBeInTheDocument();
  });
});
