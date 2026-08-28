/**
 * CommandSearch ask-mode tests
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// jsdom has no ResizeObserver; cmdk uses one internally to track item sizes
// for scroll-follow behavior. Stub it so cmdk can mount under jsdom.
class ResizeObserverStub {
  observe() {
    // no-op
  }
  unobserve() {
    // no-op
  }
  disconnect() {
    // no-op
  }
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

// jsdom also has no scrollIntoView; cmdk calls it when the selected item
// changes.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {
    // no-op
  };
}

vi.mock("@/hooks/use-command-search", async () => {
  const { useState } = await import("react");
  return {
    useCommandSearch: () => {
      const [inputValue, setInputValue] = useState("");
      return {
        inputValue,
        setInputValue,
        results: {
          contact: [],
          template: [],
          broadcast: [],
          workflow: [],
          segment: [],
          topic: [],
          brandKit: [],
        },
        isSearching: false,
        isServerMode: false,
      };
    },
  };
});
vi.mock("@/hooks/use-recent-items", () => ({
  useRecentItems: () => ({ recentItems: [], addRecentItem: vi.fn() }),
}));
vi.mock("@/contexts/organization-context", () => ({
  useActiveOrganization: () => ({
    activeOrganization: { id: "org_1", slug: "acme" },
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/actions/contacts", () => ({ getContact: vi.fn() }));
vi.mock("@/components/assistant/ask-panel", () => ({
  AskPanel: ({ initialQuestion }: { initialQuestion: string }) => (
    <div data-testid="ask-panel">{initialQuestion}</div>
  ),
}));

import posthog from "posthog-js";
import { CommandSearch } from "@/components/command-search";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CommandSearch ask mode", () => {
  it("shows no Ask Wraps item for a single character", async () => {
    const user = userEvent.setup();
    render(<CommandSearch onOpenChange={vi.fn()} open />);
    const input = screen.getByPlaceholderText("Search everything...");
    await user.type(input, "a");
    expect(screen.queryByText(/Ask Wraps:/)).not.toBeInTheDocument();
  });

  it('shows "Ask Wraps" for a 2+ character query', async () => {
    const user = userEvent.setup();
    render(<CommandSearch onOpenChange={vi.fn()} open />);
    const input = screen.getByPlaceholderText("Search everything...");
    await user.type(input, "why did sends drop");
    expect(
      screen.getByText('Ask Wraps: "why did sends drop"')
    ).toBeInTheDocument();
  });

  it("clicking the Ask item renders the mocked ask panel and hides the search input", async () => {
    const user = userEvent.setup();
    render(<CommandSearch onOpenChange={vi.fn()} open />);
    const input = screen.getByPlaceholderText("Search everything...");
    await user.type(input, "why did sends drop");
    const askItem = screen.getByText('Ask Wraps: "why did sends drop"');
    await user.click(askItem);

    const askPanel = screen.getByTestId("ask-panel");
    expect(askPanel).toHaveTextContent("why did sends drop");
    expect(
      screen.queryByPlaceholderText("Search everything...")
    ).not.toBeInTheDocument();
  });

  it("tracks cmd_k_asked when the Ask item is selected", async () => {
    const user = userEvent.setup();
    render(<CommandSearch onOpenChange={vi.fn()} open />);
    const input = screen.getByPlaceholderText("Search everything...");
    await user.type(input, "why did sends drop");
    const askItem = screen.getByText('Ask Wraps: "why did sends drop"');
    await user.click(askItem);

    expect(posthog.capture).toHaveBeenCalledWith("cmd_k_asked");
  });
});
