/**
 * NavUser — hydration parity test
 *
 * better-auth's client session can resolve before hydration, so the first
 * client render must not depend on it: the server always sends the skeleton.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

globalThis.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  addEventListener() {
    // no viewport changes in jsdom
  },
  removeEventListener() {
    // no-op
  },
})) as unknown as typeof matchMedia;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@wraps/ui/hooks/use-theme", () => ({
  useTheme: () => ({ theme: "light", setTheme: vi.fn() }),
}));
vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut: vi.fn() },
}));
vi.mock("@/contexts/session-context", () => ({
  useSession: () => ({
    isPending: false,
    data: { user: { name: "Ada Lovelace", email: "ada@example.com" } },
  }),
}));

import { SidebarProvider } from "@/components/ui/sidebar";
import { NavUser } from "../nav-user";

function Wrapped() {
  return (
    <SidebarProvider>
      <NavUser />
    </SidebarProvider>
  );
}

describe("NavUser", () => {
  afterEach(cleanup);

  it("renders the skeleton in server HTML even when the session is already resolved", () => {
    const html = renderToString(<Wrapped />);
    expect(html).not.toContain("Ada Lovelace");
    expect(html).toContain('data-slot="skeleton"');
  });

  it("shows the user after hydration", async () => {
    render(<Wrapped />);
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("hydrates without a mismatch", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // captured for assertions
    });
    const container = document.createElement("div");
    container.innerHTML = renderToString(<Wrapped />);
    document.body.appendChild(container);

    await act(async () => {
      hydrateRoot(container, <Wrapped />);
    });

    const hydrationErrors = errorSpy.mock.calls.filter((args) =>
      args.some((a) => String(a).includes("Hydration"))
    );
    errorSpy.mockRestore();
    expect(hydrationErrors).toEqual([]);
    expect(container).toHaveTextContent("Ada Lovelace");
    container.remove();
  });
});
