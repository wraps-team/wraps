/**
 * NavMain - current-page marking
 *
 * The sidebar must say which page you are on: aria-current on the link, a dot
 * on a closed section that holds it, and exact-match-only for Overview.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Mail, Settings } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

let mockPathname = "/acme/emails/templates/tpl_1";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

import { SidebarProvider } from "@/components/ui/sidebar";
import { isOverviewActive, NavMain } from "../nav-main";

const items = [
  {
    title: "Email",
    icon: Mail,
    items: [
      { title: "Emails", url: "/acme/emails" },
      { title: "Templates", url: "/acme/emails/templates" },
    ],
  },
  {
    title: "Settings",
    icon: Settings,
    items: [
      { title: "General", url: "/acme/settings" },
      { title: "Members", url: "/acme/settings/members" },
    ],
  },
];

function renderNav() {
  return render(
    <SidebarProvider>
      <NavMain items={items} />
    </SidebarProvider>
  );
}

const dots = (container: HTMLElement) =>
  container.querySelectorAll('[data-slot="sidebar-group-indicator"]');

describe("NavMain current page", () => {
  beforeEach(() => {
    localStorage.clear();
    mockPathname = "/acme/emails/templates/tpl_1";
  });
  afterEach(cleanup);

  it("marks only the most specific sub-item as current", () => {
    renderNav();
    const templates = screen.getByRole("link", { name: "Templates" });
    expect(templates).toHaveAttribute("aria-current", "page");
    expect(templates).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Emails" })).not.toHaveAttribute(
      "aria-current"
    );
    expect(document.querySelectorAll("[aria-current]")).toHaveLength(1);
  });

  it("shows a dot on a closed section that holds the current page", () => {
    const { container } = renderNav();
    fireEvent.click(screen.getByRole("button", { name: /Email/ }));
    expect(dots(container)).toHaveLength(1);
    const emailHeader = screen.getByRole("button", { name: /Email/ });
    expect(
      emailHeader.querySelector('[data-slot="sidebar-group-indicator"]')
    ).not.toBeNull();
    const settingsHeader = screen.getByRole("button", { name: /Settings/ });
    expect(
      settingsHeader.querySelector('[data-slot="sidebar-group-indicator"]')
    ).toBeNull();
  });

  it("shows no dot while the section is open", () => {
    const { container } = renderNav();
    expect(dots(container)).toHaveLength(0);
  });

  it("marks Members current under settings", () => {
    mockPathname = "/acme/settings/members";
    const { container } = renderNav();
    expect(screen.getByRole("link", { name: "Members" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "General" })).not.toHaveAttribute(
      "aria-current"
    );
    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));
    const settingsHeader = screen.getByRole("button", { name: /Settings/ });
    expect(
      settingsHeader.querySelector('[data-slot="sidebar-group-indicator"]')
    ).not.toBeNull();
    expect(dots(container)).toHaveLength(1);
  });
});

describe("isOverviewActive", () => {
  it("matches only the exact org root", () => {
    expect(isOverviewActive("/acme", "acme")).toBe(true);
    expect(isOverviewActive("/acme/emails", "acme")).toBe(false);
    expect(isOverviewActive("/", "")).toBe(false);
    expect(isOverviewActive("/acme", "")).toBe(false);
  });
});
