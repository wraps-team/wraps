/**
 * AgentPromptOption tests — the copy button must put the exact prompt on the
 * clipboard (a truncated or stale prompt silently breaks the agent path) and
 * the prompt itself must stay hidden until the user expands it.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { isValidElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockWriteText = vi.fn();

vi.mock("@/components/ui/button", () => ({
  Button: ({
    asChild,
    children,
    onClick,
    ...props
  }: {
    asChild?: boolean;
    children: React.ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) =>
    asChild && isValidElement(children) ? (
      children
    ) : (
      <button onClick={onClick} type="button" {...props}>
        {children}
      </button>
    ),
}));

vi.mock("lucide-react", () => ({
  BotIcon: () => <svg data-testid="bot-icon" />,
  CheckIcon: () => <svg data-testid="check-icon" />,
  ChevronDownIcon: () => <svg data-testid="chevron-icon" />,
  CopyIcon: () => <svg data-testid="copy-icon" />,
  ExternalLinkIcon: () => <svg data-testid="external-link-icon" />,
}));

import { AgentPromptOption } from "../agent-prompt-option";

const PROMPT = "Deploy Wraps email infrastructure.\n1. Step one\n2. Step two";

describe("AgentPromptOption", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteText.mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mockWriteText },
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("copies the full prompt verbatim", async () => {
    render(<AgentPromptOption prompt={PROMPT} />);

    fireEvent.click(screen.getByText("Copy prompt"));

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith(PROMPT);
    });
  });

  it("fires onCopyPrompt only for the prompt, not the skills install", async () => {
    const onCopyPrompt = vi.fn();
    render(<AgentPromptOption onCopyPrompt={onCopyPrompt} prompt={PROMPT} />);

    fireEvent.click(screen.getByText("npx add-skill wraps-team/skills"));
    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith(
        "npx add-skill wraps-team/skills"
      );
    });
    expect(onCopyPrompt).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Copy prompt"));
    await waitFor(() => {
      expect(onCopyPrompt).toHaveBeenCalledTimes(1);
    });
  });

  it("hides the prompt body until expanded, then shows it", () => {
    render(<AgentPromptOption prompt={PROMPT} />);

    expect(screen.queryByText(/Step one/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("View"));

    expect(screen.getByText(/Step one/)).toBeInTheDocument();
    expect(screen.getByText("Hide")).toBeInTheDocument();
  });

  it("does not crash when the clipboard is unavailable", async () => {
    mockWriteText.mockRejectedValue(new Error("not allowed"));
    const onCopyPrompt = vi.fn();
    render(<AgentPromptOption onCopyPrompt={onCopyPrompt} prompt={PROMPT} />);

    fireEvent.click(screen.getByText("Copy prompt"));

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalled();
    });
    expect(onCopyPrompt).not.toHaveBeenCalled();
    expect(screen.getByText("Copy prompt")).toBeInTheDocument();
  });

  it("renders three open-in links whose hrefs decode back to the prompt", () => {
    render(<AgentPromptOption prompt={PROMPT} />);

    const expected = [
      ["Open in Claude app", "claude://code/new?q="],
      ["Open in Claude Code", "claude-cli://open?q="],
      ["Open in Cursor", "cursor://anysphere.cursor-deeplink/prompt?text="],
    ] as const;
    for (const [name, prefix] of expected) {
      const href = screen.getByRole("link", { name }).getAttribute("href");
      expect(href?.startsWith(prefix)).toBe(true);
      expect(decodeURIComponent((href ?? "").slice(prefix.length))).toBe(
        PROMPT
      );
    }
  });

  it("reports which link was clicked and does not touch the clipboard", () => {
    const onDeepLinkClick = vi.fn();
    const onCopyPrompt = vi.fn();
    render(
      <AgentPromptOption
        onCopyPrompt={onCopyPrompt}
        onDeepLinkClick={onDeepLinkClick}
        prompt={PROMPT}
      />
    );

    for (const name of [
      "Open in Claude app",
      "Open in Claude Code",
      "Open in Cursor",
    ]) {
      screen
        .getByRole("link", { name })
        .addEventListener("click", (e) => e.preventDefault());
      fireEvent.click(screen.getByRole("link", { name }));
    }

    expect(onDeepLinkClick.mock.calls.map(([t]) => t)).toEqual([
      "claude_app",
      "claude_code",
      "cursor",
    ]);
    expect(onCopyPrompt).not.toHaveBeenCalled();
    expect(mockWriteText).not.toHaveBeenCalled();
  });

  it("shows the help line for when nothing opened", () => {
    render(<AgentPromptOption prompt={PROMPT} />);
    expect(
      screen.getByText(
        /Nothing opened\? Claude Code links work after you.ve used Claude Code once on this computer\. Copy the prompt instead\./
      )
    ).toBeInTheDocument();
  });
});
