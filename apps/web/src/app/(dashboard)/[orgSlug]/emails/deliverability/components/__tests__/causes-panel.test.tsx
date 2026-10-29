/**
 * Causes panel: the view toggle, the day chip and the window handed to the
 * three drilldown tabs. The tabs are stubbed to print their props, and the
 * hub range is fixed through useHubDays.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CausesPanel } from "../causes-panel";

const state = vi.hoisted(() => ({ days: 30 as 1 | 7 | 30 | 90 }));

vi.mock("@/hooks/use-hub-days", () => ({
  useHubDays: () => state.days,
}));

vi.mock("../../tabs/sends-tab", () => ({
  default: {
    id: "sends",
    label: "Sends",
    enabled: true,
    Component: (props: {
      metric: string;
      window: { days: number; day: string | null };
    }) => (
      <p>{`Sends stub: ${props.metric}, ${props.window.days} days, day ${props.window.day ?? "none"}`}</p>
    ),
  },
}));

vi.mock("../../tabs/reasons-tab", () => ({
  default: {
    id: "reasons",
    label: "Reasons",
    enabled: true,
    Component: (props: {
      metric: string;
      window: { days: number; day: string | null };
    }) => (
      <p>{`Reasons stub: ${props.metric}, ${props.window.days} days, day ${props.window.day ?? "none"}`}</p>
    ),
  },
}));

vi.mock("../../tabs/timeline-tab", () => ({
  default: {
    id: "timeline",
    label: "Timeline",
    enabled: true,
    Component: (props: {
      metric: string;
      window: { days: number; day: string | null };
    }) => (
      <p>{`Timeline stub: ${props.metric}, ${props.window.days} days, day ${props.window.day ?? "none"}`}</p>
    ),
  },
}));

function renderPanel(search: Record<string, string> = {}) {
  const onUrlUpdate = vi.fn();
  render(
    <NuqsTestingAdapter onUrlUpdate={onUrlUpdate} searchParams={search}>
      <CausesPanel orgSlug="acme" />
    </NuqsTestingAdapter>
  );
  return onUrlUpdate;
}

beforeEach(() => {
  state.days = 30;
});

afterEach(() => {
  cleanup();
});

describe("CausesPanel", () => {
  it("shows the Causes view by default, for the hub range", () => {
    renderPanel();
    expect(
      screen.getByText("Sends stub: bounce, 30 days, day none")
    ).toBeInTheDocument();
  });

  it("draws the card's window: a 24h range reads as 7 days", () => {
    state.days = 1;
    renderPanel();
    expect(
      screen.getByText("Sends stub: bounce, 7 days, day none")
    ).toBeInTheDocument();
  });

  it("follows the hub range", () => {
    state.days = 90;
    renderPanel();
    expect(
      screen.getByText("Sends stub: bounce, 90 days, day none")
    ).toBeInTheDocument();
  });

  it("shows the Reasons view when chosen", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("radio", { name: "Reasons" }));
    expect(
      screen.getByText("Reasons stub: bounce, 30 days, day none")
    ).toBeInTheDocument();
  });

  it("shows the Changes view when chosen", async () => {
    renderPanel();
    await userEvent.click(screen.getByRole("radio", { name: "Changes" }));
    expect(
      screen.getByText("Timeline stub: bounce, 30 days, day none")
    ).toBeInTheDocument();
  });

  it("hides Reasons for suppressions, and falls back to Causes", () => {
    renderPanel({ metric: "suppression", drive: "reasons" });
    expect(
      screen.queryByRole("radio", { name: "Reasons" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Sends stub: suppression, 30 days, day none")
    ).toBeInTheDocument();
    expect(screen.queryByText(/Reasons stub/)).not.toBeInTheDocument();
  });

  it("titles the panel with the metric", () => {
    renderPanel({ metric: "complaint" });
    expect(
      screen.getByRole("heading", {
        name: "What's driving your complaint rate",
      })
    ).toBeInTheDocument();
  });

  it("titles the suppression panel", () => {
    renderPanel({ metric: "suppression" });
    expect(
      screen.getByRole("heading", {
        name: "What's driving your suppression rate",
      })
    ).toBeInTheDocument();
  });

  it("narrows to a selected day, and Clear removes it", async () => {
    const onUrlUpdate = renderPanel({ day: "2026-10-22" });
    expect(screen.getByText("Showing Oct 22, 2026")).toBeInTheDocument();
    expect(
      screen.getByText("Sends stub: bounce, 30 days, day 2026-10-22")
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(
      onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("day")
    ).toBeNull();
  });

  it("renders no tab on the server, before the browser zone is read", () => {
    const html = renderToStaticMarkup(
      <NuqsTestingAdapter searchParams={{}}>
        <CausesPanel orgSlug="acme" />
      </NuqsTestingAdapter>
    );
    expect(html).toContain("What&#x27;s driving your bounce rate");
    expect(html).not.toContain("Sends stub");
  });
});
