/**
 * Topics tabs - the underline tabs under the page heading.
 *
 * The `?tab=` values are the ones existing links use, and a value that is not
 * one of them shows the list rather than an empty page.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../topics-table", () => ({
  TopicsTable: () => <div data-testid="topics-table" />,
}));
vi.mock("../double-opt-in-settings", () => ({
  DoubleOptInSettings: () => <div data-testid="double-opt-in" />,
}));
vi.mock("../preference-center-settings", () => ({
  PreferenceCenterSettings: () => <div data-testid="preference-center" />,
}));

import { TopicsTabs } from "../topics-tabs";

const props = {
  heading: <h1>Topics</h1>,
  orgSlug: "acme",
  organizationId: "org-1",
  topics: [],
  userRole: "owner",
  settings: null,
  verifiedDomains: [],
  brandColor: null,
  orgName: "Acme",
  orgLogo: null,
};

function renderTabs(
  searchParams: Record<string, string>,
  onUrlUpdate?: (event: UrlUpdateEvent) => void
) {
  return render(
    <NuqsTestingAdapter onUrlUpdate={onUrlUpdate} searchParams={searchParams}>
      <TopicsTabs {...props} />
    </NuqsTestingAdapter>
  );
}

afterEach(cleanup);

describe("TopicsTabs", () => {
  it("shows the list by default, labelled by its tab", () => {
    renderTabs({});

    const tab = screen.getByRole("tab", { name: "Topics" });
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      tab.id
    );
    expect(screen.getByTestId("topics-table")).toBeInTheDocument();
  });

  it("opens the tab named in the URL", () => {
    renderTabs({ tab: "preference-center" });

    expect(
      screen.getByRole("tab", { name: "Preference Center" })
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("preference-center")).toBeInTheDocument();
    expect(screen.queryByTestId("topics-table")).not.toBeInTheDocument();
  });

  it("falls back to the list for an unknown tab", () => {
    renderTabs({ tab: "nope" });

    expect(screen.getByTestId("topics-table")).toBeInTheDocument();
  });

  it("writes the chosen tab to the URL", async () => {
    const onUrlUpdate = vi.fn();
    renderTabs({}, onUrlUpdate);

    await userEvent.click(screen.getByRole("tab", { name: "Double Opt-In" }));

    expect(screen.getByTestId("double-opt-in")).toBeInTheDocument();
    expect(onUrlUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ queryString: "?tab=double-opt-in" })
    );
  });
});
