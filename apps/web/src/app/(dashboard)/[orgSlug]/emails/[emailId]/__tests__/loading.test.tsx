/**
 * Email detail — segment loading state
 *
 * `emails/loading.tsx` wraps this page and every segment below it, so before
 * this route had a boundary of its own, opening a message flashed the emails
 * *list* skeleton: a chart card and five table rows. These tests pin the
 * replacement to a detail shape, and pin the negative — the list skeleton must
 * never be what a message opening looks like.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EmailsTableSkeleton } from "../../components/emails-table-skeleton";
import EmailDetailLoading from "../loading";

afterEach(() => {
  cleanup();
});

describe("EmailDetailLoading", () => {
  it("renders the detail page's two cards: the envelope hero and the timeline", () => {
    const { container } = render(<EmailDetailLoading />);

    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(2);
    // The timeline card leads with a header (title + description); the hero
    // card does not. One header total is what page.tsx renders.
    expect(
      container.querySelectorAll('[data-slot="card-header"]')
    ).toHaveLength(1);
  });

  it("renders no table, so it cannot read as the emails list reloading", () => {
    const { container } = render(<EmailDetailLoading />);

    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelectorAll("tr")).toHaveLength(0);
  });

  it("differs from the list skeleton it used to inherit", () => {
    // Guards the assertion above from going vacuous: the list skeleton really
    // does render a table, so "no table" is a meaningful distinction.
    const list = render(<EmailsTableSkeleton />);
    expect(list.container.querySelector("table")).not.toBeNull();
    cleanup();

    const detail = render(<EmailDetailLoading />);
    expect(detail.container.querySelector("table")).toBeNull();
  });

  it("matches the real page's layout container so content swaps in without shifting", () => {
    const { container } = render(<EmailDetailLoading />);

    // page.tsx renders the back link in `px-4 lg:px-6` and the body in
    // `space-y-6 px-4 lg:px-6`.
    expect(container.querySelector(".space-y-6.px-4")).not.toBeNull();
    expect(
      container.querySelectorAll('[class~="px-4"][class~="lg:px-6"]').length
    ).toBe(2);
  });

  it("animates through the shared Skeleton primitive only", () => {
    const { container } = render(<EmailDetailLoading />);

    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
    // No hand-rolled placeholders: every animated node is a Skeleton.
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(
      skeletons.length
    );
  });
});
