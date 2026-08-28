/**
 * AssistantConversation Tests
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { UIMessage } from "ai";
import { afterEach, describe, expect, it } from "vitest";
import { AssistantConversation } from "./assistant-conversation";

afterEach(() => {
  cleanup();
});

const userMessage: UIMessage = {
  id: "msg-user-1",
  role: "user",
  parts: [{ type: "text", text: "Hello there" }],
};

const assistantMessage: UIMessage = {
  id: "msg-assistant-1",
  role: "assistant",
  parts: [{ type: "text", text: "Hi, how can I help?" }],
};

const toolMessage = (
  state: "input-streaming" | "output-available" | "output-error"
): UIMessage =>
  ({
    id: `msg-tool-${state}`,
    role: "assistant",
    parts: [
      {
        type: "tool-get_setup_status",
        toolCallId: "call-1",
        state,
        ...(state === "output-available"
          ? { input: {}, output: { sandbox: true, secretish: "DO-NOT-PAINT" } }
          : {}),
        ...(state === "output-error" ? { input: {}, errorText: "boom" } : {}),
        ...(state === "input-streaming" ? { input: undefined } : {}),
      },
    ],
  }) as UIMessage;

describe("AssistantConversation", () => {
  it("renders both user and assistant message text inside a log region", () => {
    render(
      <AssistantConversation
        isLoading={false}
        messages={[userMessage, assistantMessage]}
      />
    );

    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.getByText("Hi, how can I help?")).toBeInTheDocument();
    expect(screen.getByRole("log")).toBeInTheDocument();
  });

  it("renders the empty state when there are no messages", () => {
    render(
      <AssistantConversation
        emptyState={<p>Nothing here yet</p>}
        isLoading={false}
        messages={[]}
      />
    );

    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
  });

  it("renders a status marker while loading after a trailing user message", () => {
    render(
      <AssistantConversation
        isLoading
        loadingLabel="Generating..."
        messages={[userMessage]}
      />
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Generating...")).toBeInTheDocument();
  });

  it("renders a registered tool renderer instead of the fallback", () => {
    render(
      <AssistantConversation
        isLoading={false}
        messages={[toolMessage("output-available")]}
        toolRenderers={{
          get_setup_status: () => <p>Sandbox card</p>,
        }}
      />
    );

    expect(screen.getByText("Sandbox card")).toBeInTheDocument();
    expect(screen.queryByText(/Ran get_setup_status/)).not.toBeInTheDocument();
  });

  it("falls back to a running status line for an unregistered tool", () => {
    render(
      <AssistantConversation
        isLoading={false}
        messages={[toolMessage("input-streaming")]}
      />
    );

    expect(screen.getByText("Running get_setup_status...")).toBeInTheDocument();
  });

  it("never paints raw tool output when no renderer is registered", () => {
    render(
      <AssistantConversation
        isLoading={false}
        messages={[toolMessage("output-available")]}
      />
    );

    expect(screen.queryByText(/DO-NOT-PAINT/)).not.toBeInTheDocument();
    expect(screen.getByText("Ran get_setup_status")).toBeInTheDocument();
  });

  it("renders a failure status line for output-error", () => {
    render(
      <AssistantConversation
        isLoading={false}
        messages={[toolMessage("output-error")]}
      />
    );

    expect(screen.getByText("get_setup_status failed")).toBeInTheDocument();
  });
});
