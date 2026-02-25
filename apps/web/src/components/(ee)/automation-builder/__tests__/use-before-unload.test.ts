// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkflowStore } from "../use-automation-store";

describe("useBeforeUnload", () => {
  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    useWorkflowStore.setState({ isDirty: false });
    addSpy = vi.spyOn(window, "addEventListener");
    removeSpy = vi.spyOn(window, "removeEventListener");
  });

  afterEach(() => {
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("should register beforeunload listener when isDirty is true", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useBeforeUnload } = await import("../use-before-unload");

    useWorkflowStore.setState({ isDirty: true });

    const { unmount } = renderHook(() => useBeforeUnload());

    const beforeUnloadCalls = addSpy.mock.calls.filter(
      ([event]: [string, ...unknown[]]) => event === "beforeunload"
    );
    expect(beforeUnloadCalls.length).toBeGreaterThan(0);

    unmount();
  });

  it("should not register beforeunload listener when isDirty is false", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useBeforeUnload } = await import("../use-before-unload");

    useWorkflowStore.setState({ isDirty: false });

    const { unmount } = renderHook(() => useBeforeUnload());

    const beforeUnloadCalls = addSpy.mock.calls.filter(
      ([event]: [string, ...unknown[]]) => event === "beforeunload"
    );
    expect(beforeUnloadCalls).toHaveLength(0);

    unmount();
  });

  it("should remove beforeunload listener on unmount", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { useBeforeUnload } = await import("../use-before-unload");

    useWorkflowStore.setState({ isDirty: true });

    const { unmount } = renderHook(() => useBeforeUnload());

    unmount();

    const removeBeforeUnloadCalls = removeSpy.mock.calls.filter(
      ([event]: [string, ...unknown[]]) => event === "beforeunload"
    );
    expect(removeBeforeUnloadCalls.length).toBeGreaterThan(0);
  });
});
