/**
 * Shared Skeleton primitive — reduced-motion guard
 *
 * `animate-pulse` runs unconditionally unless it is told not to, and there was
 * no `prefers-reduced-motion` handling anywhere in the dashboard. A loading
 * screen full of pulsing blocks is exactly the kind of thing the OS-level
 * preference exists to stop, and skeletons are the densest animation surface
 * in the app.
 *
 * The guard belongs on the primitive rather than on any one skeleton, so this
 * test lives here: it covers every skeleton in every app at once.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanup();
});

describe("Skeleton", () => {
  it("pulses by default", () => {
    const { container } = render(<Skeleton />);

    expect(container.querySelector('[data-slot="skeleton"]')).toHaveClass(
      "animate-pulse"
    );
  });

  it("stops animating when the user prefers reduced motion", () => {
    const { container } = render(<Skeleton />);

    expect(container.querySelector('[data-slot="skeleton"]')).toHaveClass(
      "motion-reduce:animate-none"
    );
  });

  it("keeps the guard when a caller passes its own classes", () => {
    // `cn` merges through tailwind-merge, so a caller adding sizing must not
    // knock the guard out.
    const { container } = render(<Skeleton className="h-4 w-32" />);

    const skeleton = container.querySelector('[data-slot="skeleton"]');
    expect(skeleton).toHaveClass("motion-reduce:animate-none");
    expect(skeleton).toHaveClass("h-4");
  });
});
