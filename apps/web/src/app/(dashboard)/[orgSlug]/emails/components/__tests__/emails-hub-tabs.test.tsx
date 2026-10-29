/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EmailsHubTabs } from "../emails-hub-tabs";

afterEach(cleanup);

describe("EmailsHubTabs", () => {
  it("links each tab, keeping the default window out of the URL", () => {
    render(<EmailsHubTabs days={30} orgSlug="acme" tab="activity" />);

    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute(
      "href",
      "/acme/emails"
    );
    expect(screen.getByRole("link", { name: "Engagement" })).toHaveAttribute(
      "href",
      "/acme/emails?tab=engagement"
    );
    expect(
      screen.getByRole("link", { name: "Deliverability" })
    ).toHaveAttribute("href", "/acme/emails?tab=deliverability");
  });

  it("carries a non-default window across every tab", () => {
    render(<EmailsHubTabs days={7} orgSlug="acme" tab="engagement" />);

    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute(
      "href",
      "/acme/emails?days=7"
    );
    expect(screen.getByRole("link", { name: "Engagement" })).toHaveAttribute(
      "href",
      "/acme/emails?tab=engagement&days=7"
    );
    expect(
      screen.getByRole("link", { name: "Deliverability" })
    ).toHaveAttribute("href", "/acme/emails?tab=deliverability&days=7");
  });

  it("marks only the open tab as the current page", () => {
    render(<EmailsHubTabs days={30} orgSlug="acme" tab="deliverability" />);

    expect(
      screen.getByRole("link", { name: "Deliverability" })
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Activity" })).not.toHaveAttribute(
      "aria-current"
    );
    expect(
      screen.getByRole("link", { name: "Engagement" })
    ).not.toHaveAttribute("aria-current");
  });
});
