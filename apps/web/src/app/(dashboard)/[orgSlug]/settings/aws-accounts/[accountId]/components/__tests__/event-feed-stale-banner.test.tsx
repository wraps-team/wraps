// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EventFeedStaleBanner } from "../event-feed-stale-banner";

afterEach(cleanup);

describe("EventFeedStaleBanner", () => {
  it("renders the warning when eventFeedStaleSince and lastEventReceivedAt are both set", () => {
    render(
      <EventFeedStaleBanner
        account={{
          eventFeedStaleSince: new Date(Date.now() - 60_000),
          lastEventReceivedAt: new Date(Date.now() - 60_000),
        }}
      />
    );

    expect(
      screen.getByText("Event streaming appears disconnected")
    ).toBeInTheDocument();
    expect(screen.getByText(/wraps email doctor/)).toBeInTheDocument();
  });

  it("renders nothing when eventFeedStaleSince is null", () => {
    const { container } = render(
      <EventFeedStaleBanner
        account={{ eventFeedStaleSince: null, lastEventReceivedAt: null }}
      />
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders copy derived from lastEventReceivedAt, not eventFeedStaleSince (plan 194)", () => {
    // A relative-time assertion has to tolerate test-runtime jitter, so pick
    // values far enough apart (5 minutes vs 2 hours) that
    // formatRelativeTime's outputs cannot collide.
    render(
      <EventFeedStaleBanner
        account={{
          eventFeedStaleSince: new Date(Date.now() - 2 * 60 * 60 * 1000),
          lastEventReceivedAt: new Date(Date.now() - 5 * 60 * 1000),
        }}
      />
    );

    expect(
      screen.getByText(/last delivery event we received/)
    ).toBeInTheDocument();
    // Tolerate a 1-minute jitter between fixture setup and render.
    expect(screen.getByText(/[45]m ago/)).toBeInTheDocument();
  });

  it("returns null when lastEventReceivedAt is null even if eventFeedStaleSince is set", () => {
    // Plan 194's sweep gate should make this combination unreachable in
    // production (the sweep never sets eventFeedStaleSince on a never-
    // connected account) — this pins the banner's defensive bail-out for
    // when that invariant is ever violated.
    const { container } = render(
      <EventFeedStaleBanner
        account={{
          eventFeedStaleSince: new Date(Date.now() - 60_000),
          lastEventReceivedAt: null,
        }}
      />
    );

    expect(container.innerHTML).toBe("");
  });
});
