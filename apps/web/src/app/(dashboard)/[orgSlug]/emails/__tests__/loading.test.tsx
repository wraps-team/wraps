/**
 * Emails segment — shared loading boundary
 *
 * This `loading.tsx` wraps fourteen routes, not one. It used to render the
 * message list's shape, so the template editor, the setup wizard and the brand
 * kit pages all promised a chart and a table while they loaded. These tests
 * pin the replacement to a neutral page shell and pin the negatives: no table,
 * no card, no toolbar-and-pagination pair.
 *
 * Every negative assertion below is paired with a render that the same
 * selector *does* match, so "no table" can never quietly become "the selector
 * stopped working".
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { afterEach, describe, expect, it } from "vitest";
import { EmailsTableSkeleton } from "../components/emails-table-skeleton";
import EmailsSegmentLoading from "../loading";

afterEach(() => {
  cleanup();
});

describe("EmailsSegmentLoading", () => {
  it("renders a page heading and a single content block", () => {
    const { container } = render(<EmailsSegmentLoading />);

    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    // Heading, description line, content block. Anything more is a shape the
    // routes below do not all share.
    expect(skeletons).toHaveLength(3);
  });

  it("renders no table, so the routes with no table are not promised one", () => {
    const generic = render(<EmailsSegmentLoading />);
    expect(generic.container.querySelector("table")).toBeNull();
    expect(generic.container.querySelectorAll("tr")).toHaveLength(0);
    cleanup();

    // Teeth: the list skeleton this file used to render really does render a
    // table, so the assertion above is a distinction and not a tautology.
    const list = render(<EmailsTableSkeleton />);
    expect(list.container.querySelector("table")).not.toBeNull();
    expect(list.container.querySelectorAll("tr").length).toBeGreaterThan(0);
  });

  it("renders no card, so it cannot read as a chart or metrics panel", () => {
    const generic = render(<EmailsSegmentLoading />);
    expect(generic.container.querySelector('[data-slot="card"]')).toBeNull();
    cleanup();

    // Teeth: the selector matches a real Card.
    const card = render(
      <Card>
        <CardContent>content</CardContent>
      </Card>
    );
    expect(card.container.querySelector('[data-slot="card"]')).not.toBeNull();
  });

  it("renders no filter bar or pagination row", () => {
    const generic = render(<EmailsSegmentLoading />);
    // The list's toolbar and pagination are the only `justify-between` rows in
    // either shell; the generic one has none.
    expect(
      generic.container.querySelectorAll('[class*="justify-between"]')
    ).toHaveLength(0);
    cleanup();

    // Teeth: the list skeleton has exactly those rows.
    const list = render(<EmailsTableSkeleton />);
    expect(
      list.container.querySelectorAll('[class*="justify-between"]').length
    ).toBeGreaterThan(0);
  });

  it("uses the dashboard page gutters so content swaps in without shifting", () => {
    const { container } = render(<EmailsSegmentLoading />);

    // Every page under /emails renders its content in `px-4 lg:px-6`.
    expect(
      container.querySelector('[class~="px-4"][class~="lg:px-6"]')
    ).not.toBeNull();
  });

  it("animates through the shared Skeleton primitive only", () => {
    const { container } = render(<EmailsSegmentLoading />);

    const skeletons = container.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
    // No hand-rolled placeholder divs: every animated node is a Skeleton, so
    // the primitive's reduced-motion guard covers all of them.
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(
      skeletons.length
    );
  });
});
