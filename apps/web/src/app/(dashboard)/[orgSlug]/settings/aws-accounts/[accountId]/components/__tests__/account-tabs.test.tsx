// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const useSelectedLayoutSegment = vi.fn<() => string | null>();

vi.mock("next/navigation", () => ({
  useSelectedLayoutSegment: () => useSelectedLayoutSegment(),
}));

import { AccountTabs } from "../account-tabs";

const baseHref = "/acme/settings/aws-accounts/acct-1";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AccountTabs", () => {
  it("marks Overview current on the index page", () => {
    useSelectedLayoutSegment.mockReturnValue(null);
    render(<AccountTabs baseHref={baseHref} canManage={true} />);

    const overview = screen.getByRole("link", { name: "Overview" });
    expect(overview).toHaveAttribute("aria-current", "page");
    expect(overview).toHaveAttribute("href", baseHref);
    expect(screen.getByRole("link", { name: "Access" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("marks Access current on the access segment", () => {
    useSelectedLayoutSegment.mockReturnValue("access");
    render(<AccountTabs baseHref={baseHref} canManage={true} />);

    const access = screen.getByRole("link", { name: "Access" });
    expect(access).toHaveAttribute("aria-current", "page");
    expect(access).toHaveAttribute("href", `${baseHref}/access`);
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("marks Services current on the services segment", () => {
    useSelectedLayoutSegment.mockReturnValue("services");
    render(<AccountTabs baseHref={baseHref} canManage={true} />);

    const services = screen.getByRole("link", { name: "Services" });
    expect(services).toHaveAttribute("aria-current", "page");
    expect(services).toHaveAttribute("href", `${baseHref}/services`);
  });

  it("marks Connection current on the connection segment", () => {
    useSelectedLayoutSegment.mockReturnValue("connection");
    render(<AccountTabs baseHref={baseHref} canManage={true} />);

    const connection = screen.getByRole("link", { name: "Connection" });
    expect(connection).toHaveAttribute("aria-current", "page");
    expect(connection).toHaveAttribute("href", `${baseHref}/connection`);
  });

  it("marks Settings current on the settings segment", () => {
    useSelectedLayoutSegment.mockReturnValue("settings");
    render(<AccountTabs baseHref={baseHref} canManage={true} />);

    const settings = screen.getByRole("link", { name: "Settings" });
    expect(settings).toHaveAttribute("aria-current", "page");
    expect(settings).toHaveAttribute("href", `${baseHref}/settings`);
  });

  it("hides the Settings tab when the user cannot manage", () => {
    useSelectedLayoutSegment.mockReturnValue(null);
    render(<AccountTabs baseHref={baseHref} canManage={false} />);

    expect(
      screen.queryByRole("link", { name: "Settings" })
    ).not.toBeInTheDocument();
  });

  it("hides the Access tab when the user cannot manage", () => {
    useSelectedLayoutSegment.mockReturnValue(null);
    render(<AccountTabs baseHref={baseHref} canManage={false} />);

    expect(
      screen.queryByRole("link", { name: "Access" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "href",
      baseHref
    );
  });
});
