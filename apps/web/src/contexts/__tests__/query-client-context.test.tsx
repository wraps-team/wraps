/**
 * QueryProvider's Sentry wiring: a failed useMutation used to be seen only
 * as a toast (no MutationCache), and this locks in that both mutation and
 * query failures reach Sentry with the right source tag.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException }));

import { QueryProvider } from "../query-client-context";

afterEach(() => {
  cleanup();
  captureException.mockClear();
});

function FailingMutationButton() {
  const mutation = useMutation({
    mutationKey: ["boom-mutation"],
    mutationFn: () => Promise.reject(new Error("boom")),
  });

  return (
    <button onClick={() => mutation.mutate()} type="button">
      go
    </button>
  );
}

function FailingQuery() {
  useQuery({
    queryKey: ["boom-query"],
    queryFn: () => Promise.reject(new Error("boom-query")),
  });

  return <div>querying</div>;
}

describe("QueryProvider Sentry wiring", () => {
  it("reports a failed mutation with tags.source react-query-mutation", async () => {
    render(
      <QueryProvider>
        <FailingMutationButton />
      </QueryProvider>
    );

    fireEvent.click(screen.getByRole("button", { name: "go" }));

    await waitFor(() => {
      expect(captureException).toHaveBeenCalledTimes(1);
    });

    const [error, options] = captureException.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("boom");
    expect(options).toEqual(
      expect.objectContaining({
        tags: { source: "react-query-mutation" },
      })
    );
  });

  it("reports a failed query with tags.source react-query (existing behavior)", async () => {
    render(
      <QueryProvider>
        <FailingQuery />
      </QueryProvider>
    );

    await waitFor(
      () => {
        expect(captureException).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000 }
    );

    const [error, options] = captureException.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("boom-query");
    expect(options).toEqual(
      expect.objectContaining({
        tags: { source: "react-query" },
      })
    );
  });
});
