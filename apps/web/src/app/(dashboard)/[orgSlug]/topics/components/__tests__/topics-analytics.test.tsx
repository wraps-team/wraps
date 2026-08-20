/**
 * Topics instrumentation (audit finding F16, wave 3).
 *
 * `posthog.capture` appeared zero times across the topics tree before this
 * pass. These assert topic create/update/delete, the subscribers-sheet
 * funnel (open -> status filter -> page), and that the `double_opt_in` value
 * on `topic_updated` reflects what wave 2 made visible: whether operators
 * actually turn the feature on. No subscriber email may appear in any
 * capture payload.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TopicWithMeta } from "@/lib/topics";

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

const createTopic = vi.fn();
const deleteTopic = vi.fn();
const updateTopic = vi.fn();
const getTopicSubscribers = vi.fn();

vi.mock("@/actions/topics", () => ({
  createTopic: (...args: unknown[]) => createTopic(...args),
  deleteTopic: (...args: unknown[]) => deleteTopic(...args),
  getTopicSubscribers: (...args: unknown[]) => getTopicSubscribers(...args),
  updateTopic: (...args: unknown[]) => updateTopic(...args),
}));

import { TopicsTable } from "../topics-table";

// jsdom has no ResizeObserver, which Radix's Select/Tabs measure with, and
// no Pointer Events implementation - matches contacts-table-analytics.test.tsx.
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
  stubPointerEvents();
  capture.mockClear();
  push.mockClear();
  replace.mockClear();
  refresh.mockClear();
  createTopic.mockReset();
  deleteTopic.mockReset();
  updateTopic.mockReset();
  getTopicSubscribers.mockReset();
  getTopicSubscribers.mockResolvedValue({
    success: true,
    subscribers: [],
    total: 0,
    page: 1,
    pageSize: 20,
  });
});

afterEach(cleanup);

describe("topic_created", () => {
  it("captures double_opt_in and public only on success", async () => {
    createTopic.mockResolvedValue({ success: true, topic: makeTopic() });

    render(<TopicsTable {...baseProps} topics={[]} />);

    await userEvent.click(
      screen.getByRole("button", { name: /^create topic$/i })
    );
    await userEvent.type(screen.getByLabelText(/^name$/i), "Newsletter");
    await userEvent.click(screen.getByLabelText(/require double opt-in/i));
    await userEvent.click(
      screen.getByRole("button", { name: /^create topic$/i })
    );

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("topic_created", {
        double_opt_in: true,
        public: true,
      });
    });
  });

  it("does not capture when creation fails", async () => {
    createTopic.mockResolvedValue({ success: false, error: "nope" });

    render(<TopicsTable {...baseProps} topics={[]} />);

    await userEvent.click(
      screen.getByRole("button", { name: /^create topic$/i })
    );
    await userEvent.type(screen.getByLabelText(/^name$/i), "Newsletter");
    await userEvent.click(
      screen.getByRole("button", { name: /^create topic$/i })
    );

    await waitFor(() => expect(createTopic).toHaveBeenCalled());
    expect(capture).not.toHaveBeenCalledWith(
      "topic_created",
      expect.anything()
    );
  });
});

describe("topic_updated", () => {
  it("reports double_opt_in: true when the edit turns it on, with the changed field list", async () => {
    updateTopic.mockResolvedValue({ success: true, topic: makeTopic() });

    render(<TopicsTable {...baseProps} topics={[makeTopic()]} />);

    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    await userEvent.click(await screen.findByText(/^edit topic$/i));
    await userEvent.click(screen.getByLabelText(/require double opt-in/i));
    await userEvent.click(
      screen.getByRole("button", { name: /^save changes$/i })
    );

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("topic_updated", {
        double_opt_in: true,
        fields: ["doubleOptIn"],
      });
    });
  });

  it("reports double_opt_in: null when the edit does not touch it", async () => {
    updateTopic.mockResolvedValue({ success: true, topic: makeTopic() });

    render(<TopicsTable {...baseProps} topics={[makeTopic()]} />);

    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    await userEvent.click(await screen.findByText(/^edit topic$/i));
    await userEvent.clear(screen.getByLabelText(/^description/i));
    await userEvent.type(
      screen.getByLabelText(/^description/i),
      "Monthly product news"
    );
    await userEvent.click(
      screen.getByRole("button", { name: /^save changes$/i })
    );

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("topic_updated", {
        double_opt_in: null,
        fields: ["description"],
      });
    });
  });
});

describe("topic_deleted", () => {
  it("captures only after a successful delete", async () => {
    deleteTopic.mockResolvedValue({ success: true });

    render(<TopicsTable {...baseProps} topics={[makeTopic()]} />);

    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    await userEvent.click(await screen.findByText(/^delete topic$/i));
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("topic_deleted");
    });
  });
});

describe("topic_subscribers_opened", () => {
  it("captures source: row when the row is clicked", async () => {
    render(<TopicsTable {...baseProps} topics={[makeTopic()]} />);

    await userEvent.click(
      screen.getByRole("button", {
        name: "View subscribers for Product Updates",
      })
    );

    expect(capture).toHaveBeenCalledWith("topic_subscribers_opened", {
      source: "row",
    });
  });

  it('captures source: menu when opened from the row\'s "..." menu', async () => {
    render(<TopicsTable {...baseProps} topics={[makeTopic()]} />);

    await userEvent.click(screen.getByRole("button", { name: /open menu/i }));
    await userEvent.click(await screen.findByText(/view subscribers/i));

    expect(capture).toHaveBeenCalledWith("topic_subscribers_opened", {
      source: "menu",
    });
  });
});

describe("topic_subscribers_filter_changed", () => {
  it("captures from/to when the status tab changes", async () => {
    render(<TopicsTable {...baseProps} topics={[makeTopic()]} />);

    await userEvent.click(
      screen.getByRole("button", {
        name: "View subscribers for Product Updates",
      })
    );
    await userEvent.click(screen.getByRole("tab", { name: /pending/i }));

    expect(capture).toHaveBeenCalledWith("topic_subscribers_filter_changed", {
      from: "subscribed",
      to: "pending",
    });
  });
});

describe("topic_subscribers_page_changed", () => {
  it("captures direction and destination page", async () => {
    getTopicSubscribers.mockResolvedValue({
      success: true,
      subscribers: Array.from({ length: 20 }, (_, i) => ({
        contactId: `c${i}`,
        email: `c${i}@example.com`,
        status: "subscribed",
        subscribedAt: new Date("2026-08-01T00:00:00.000Z"),
        unsubscribedAt: null,
      })),
      total: 45,
      page: 1,
      pageSize: 20,
    });

    render(<TopicsTable {...baseProps} topics={[makeTopic()]} />);

    await userEvent.click(
      screen.getByRole("button", {
        name: "View subscribers for Product Updates",
      })
    );
    await waitFor(() => expect(getTopicSubscribers).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: /^next$/i }));

    expect(capture).toHaveBeenCalledWith("topic_subscribers_page_changed", {
      direction: "next",
      page: 2,
    });
  });
});
