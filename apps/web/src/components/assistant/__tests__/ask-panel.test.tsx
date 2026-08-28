/**
 * AskPanel tests
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMessage = vi.fn();
const chatState = {
  messages: [] as unknown[],
  status: "ready" as string,
  error: undefined as Error | undefined,
};

vi.mock("@ai-sdk/react", () => ({
  useChat: () => ({ ...chatState, sendMessage }),
}));

import { AskPanel } from "@/components/assistant/ask-panel";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  sendMessage.mockReset();
  chatState.messages = [];
  chatState.status = "ready";
  chatState.error = undefined;
});

describe("AskPanel", () => {
  it("sends the initial question exactly once under StrictMode", () => {
    render(
      <StrictMode>
        <AskPanel
          initialQuestion="why did sends drop"
          onExit={vi.fn()}
          orgSlug="acme"
        />
      </StrictMode>
    );
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith({
      text: "why did sends drop",
    });
  });

  it("renders the quota line for a limit-reached error", () => {
    chatState.error = new Error("AI message limit reached");
    render(<AskPanel initialQuestion="" onExit={vi.fn()} orgSlug="acme" />);
    expect(
      screen.getByText("You've used all your AI messages this month.")
    ).toBeInTheDocument();
    const backButtons = screen.getAllByRole("button", {
      name: /back to search/i,
    });
    expect(backButtons.length).toBeGreaterThan(0);
    for (const button of backButtons) {
      expect(button).toBeEnabled();
    }
  });

  it("renders the unavailable line for any other error, not the quota line", () => {
    chatState.error = new Error("Failed to process assistant request");
    render(<AskPanel initialQuestion="" onExit={vi.fn()} orgSlug="acme" />);
    expect(
      screen.getByText("The assistant isn't available right now.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("You've used all your AI messages this month.")
    ).not.toBeInTheDocument();
  });
});
