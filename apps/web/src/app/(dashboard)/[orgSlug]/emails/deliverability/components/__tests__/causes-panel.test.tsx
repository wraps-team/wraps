/**
 * Causes panel: the group-by row (with Changes as a peer), the day chip and
 * the window handed to the sends tab and the changes table. Both are stubbed
 * to print their props, and the hub range is fixed through useHubDays.
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

vi.mock("../changes-table", () => ({
  ChangesTable: (props: {
    metric: string;
    window: { days: number; day: string | null };
  }) => (
    <p>{`Changes stub: ${props.metric}, ${props.window.days} days, day ${props.window.day ?? "none"}`}</p>
  ),
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
  it("shows the broadcast table by default, for the hub range", () => {
    renderPanel();
    expect(
      screen.getByText("Sends stub: bounce, 30 days, day none")
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Broadcast" })).toBeChecked();
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

  it("groups the table by the chosen key in the URL", async () => {
    const onUrlUpdate = renderPanel();
    await userEvent.click(screen.getByRole("radio", { name: "Template" }));
    const last = onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(last?.searchParams.get("sends.by")).toBe("template");
    expect(last?.searchParams.get("drive")).toBeNull();
  });

  it("reads the group-by from the URL", () => {
    renderPanel({ "sends.by": "from" });
    expect(screen.getByRole("radio", { name: "From" })).toBeChecked();
  });

  it("shows the changes list when Changes is chosen, and sets drive=changes", async () => {
    const onUrlUpdate = renderPanel();
    await userEvent.click(screen.getByRole("radio", { name: "Changes" }));
    expect(
      screen.getByText("Changes stub: bounce, 30 days, day none")
    ).toBeInTheDocument();
    expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("drive")).toBe(
      "changes"
    );
  });

  it("opens on the changes list from drive=changes", () => {
    renderPanel({ drive: "changes" });
    expect(
      screen.getByText("Changes stub: bounce, 30 days, day none")
    ).toBeInTheDocument();
  });

  it("keeps an old drive=reasons link on the default table", () => {
    renderPanel({ drive: "reasons" });
    expect(
      screen.getByText("Sends stub: bounce, 30 days, day none")
    ).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Reasons" })).toBeNull();
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

  it("renders no table on the server, before the browser zone is read", () => {
    const html = renderToStaticMarkup(
      <NuqsTestingAdapter searchParams={{}}>
        <CausesPanel orgSlug="acme" />
      </NuqsTestingAdapter>
    );
    expect(html).toContain("What&#x27;s driving your bounce rate");
    expect(html).not.toContain("Sends stub");
  });
});
