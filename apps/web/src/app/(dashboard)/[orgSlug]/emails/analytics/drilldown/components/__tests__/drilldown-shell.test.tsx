/**
 * Drill-down shell: which tabs show, tab fallback, URL state, and the sends
 * tab's states. The data hook is mocked, so this runs without a server.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DrilldownSendsResponse } from "../../../../deliverability/hooks/use-drilldown-sends";
import reasonsTab from "../../../../deliverability/tabs/reasons-tab";
import sendsTab from "../../../../deliverability/tabs/sends-tab";
import timelineTab from "../../../../deliverability/tabs/timeline-tab";
import addressesTab from "../../tabs/addresses-tab";
import { DrilldownShell } from "../drilldown-shell";

const mockUseSends = vi.fn();
vi.mock("../../../../deliverability/hooks/use-drilldown-sends", () => ({
  useDrilldownSends: (...args: unknown[]) => mockUseSends(...args),
}));

globalThis.ResizeObserver ??= class {
  observe() {
    // jsdom has no layout
  }
  unobserve() {
    // no-op
  }
  disconnect() {
    // no-op
  }
} as unknown as typeof ResizeObserver;

function response(
  overrides: Partial<DrilldownSendsResponse> = {}
): DrilldownSendsResponse {
  return {
    metric: "bounce",
    by: "broadcast",
    window: {
      mode: "rolling",
      days: 30,
      day: null,
      from: "2026-09-28T12:00:00.000Z",
      to: "2026-10-28T12:00:00.000Z",
      tz: "UTC",
    },
    floor: 100,
    workflowLinks: true,
    totals: {
      sent: 610,
      bounced: 41,
      permanent: 41,
      transient: 0,
      undetermined: 0,
      complained: 0,
      suppressed: 0,
      rate: 6.72,
    },
    ranked: [
      {
        key: "batch_1",
        label: "October launch",
        sourceTypes: ["batch"],
        sent: 300,
        bounced: 30,
        permanent: 30,
        transient: 0,
        undetermined: 0,
        complained: 0,
        suppressed: 0,
        events: 30,
        rate: 10,
        share: 73.17,
        excess: 9.84,
        eligible: true,
      },
    ],
    belowFloor: [],
    omitted: {
      sent: 0,
      bounced: 0,
      permanent: 0,
      transient: 0,
      undetermined: 0,
      complained: 0,
      suppressed: 0,
      groups: 0,
    },
    ...overrides,
  };
}

function setSends(data: DrilldownSendsResponse | undefined, extra = {}) {
  mockUseSends.mockReturnValue({
    data,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    ...extra,
  });
}

function renderShell(search = "", onUrlUpdate = vi.fn()) {
  render(
    <NuqsTestingAdapter onUrlUpdate={onUrlUpdate} searchParams={search}>
      <DrilldownShell orgSlug="acme" />
    </NuqsTestingAdapter>
  );
  return onUrlUpdate;
}

beforeEach(() => {
  mockUseSends.mockReset();
  setSends(response());
});

afterEach(() => {
  cleanup();
});

describe("DrilldownShell", () => {
  it("renders exactly the tabs whose enabled flag is true", () => {
    renderShell();
    // Driven by each tab module's own flag, so it holds as tabs are enabled.
    for (const tab of [sendsTab, reasonsTab, addressesTab, timelineTab]) {
      const query = screen.queryByRole("tab", { name: tab.label });
      if (tab.enabled) {
        expect(query).toBeInTheDocument();
      } else {
        expect(query).not.toBeInTheDocument();
      }
    }
    expect(sendsTab.enabled).toBe(true);
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it("falls back to the first enabled tab for an absent or disabled tab param", () => {
    renderShell("?tab=no-such-tab");
    expect(screen.getByRole("tab", { name: "Sends" })).toHaveAttribute(
      "data-state",
      "active"
    );
    expect(
      screen.getByText(
        "Ranked by how far each group pushed the rate above the window rate."
      )
    ).toBeInTheDocument();
  });

  it("switching metric keeps days, day and tz in the URL", async () => {
    const user = userEvent.setup();
    const onUrlUpdate = renderShell(
      "?metric=bounce&days=7&day=2026-10-20&tz=America%2FNew_York"
    );
    await user.click(screen.getByRole("radio", { name: "Complaint rate" }));
    const last = onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(last).toBeDefined();
    const params = last.searchParams as URLSearchParams;
    expect(params.get("metric")).toBe("complaint");
    expect(params.get("days")).toBe("7");
    expect(params.get("day")).toBe("2026-10-20");
    expect(params.get("tz")).toBe("America/New_York");
  });

  it("shows the by-switch and the ranked heading on the sends tab", () => {
    renderShell();
    const group = screen.getByRole("group", { name: "Group sends by" });
    for (const label of ["Broadcast", "Workflow", "Template", "From address"]) {
      expect(
        within(group).getByRole("radio", { name: label })
      ).toBeInTheDocument();
    }
    expect(
      screen.getByText(
        "Ranked by how far each group pushed the rate above the window rate."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Bounce rate is 6.72% for the last 30 days: 41 of 610 sends."
      )
    ).toBeInTheDocument();
  });

  it("shows the no-events empty state when the metric has zero events", () => {
    setSends(
      response({
        totals: {
          sent: 610,
          bounced: 0,
          permanent: 0,
          transient: 0,
          undetermined: 0,
          complained: 0,
          suppressed: 0,
          rate: 0,
        },
        ranked: [],
        belowFloor: [],
      })
    );
    renderShell("?metric=bounce");
    expect(screen.getByText("No bounces in this window")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Nothing bounced in the last 30 days, so there is nothing to attribute."
      )
    ).toBeInTheDocument();
  });

  it("shows the below-floor-only empty state when nothing is eligible", () => {
    const small = response().ranked[0];
    setSends(
      response({
        ranked: [],
        belowFloor: [
          {
            ...small,
            key: "small_1",
            label: "Small test",
            sent: 12,
            bounced: 1,
            events: 1,
            eligible: false,
          },
        ],
      })
    );
    renderShell();
    expect(
      screen.getByText("No group has enough sends to rank yet")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Each group has fewer than 100 sends. They are listed below with their counts."
      )
    ).toBeInTheDocument();
  });

  it("shows the footer note about bucketing by send time and the SES reputation scope", () => {
    renderShell();
    expect(
      screen.getByText(
        /Counts are for sends made in the last 30 days, bucketed by when each send was made/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The account reputation SES publishes/)
    ).toBeInTheDocument();
  });
});
