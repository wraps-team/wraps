import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FOOTER_COLUMNS,
  FOUNDERS_PAGE_LIVE,
  NAV_MENUS,
  type NavLink,
} from "@/config/site-nav";

const appDir = resolve(__dirname, "..", "app");
const publicDir = resolve(__dirname, "..", "..", "public");

function allLinks(): NavLink[] {
  const nav = NAV_MENUS.flatMap((menu) => [
    ...(menu.href ? [{ name: menu.name, href: menu.href }] : []),
    ...(menu.feature
      ? [{ name: menu.feature.name, href: menu.feature.href }]
      : []),
    ...(menu.groups ?? []).flatMap((group) => group.links),
  ]);
  return [...nav, ...FOOTER_COLUMNS.flatMap((column) => column.links)];
}

function resolves(href: string): boolean {
  if (/^https?:\/\//.test(href)) {
    return true;
  }
  const path = href.split("#")[0].split("?")[0] || "/";
  if (path === "/") {
    return existsSync(resolve(appDir, "page.tsx"));
  }
  return (
    existsSync(resolve(appDir, `.${path}`, "page.tsx")) ||
    existsSync(resolve(publicDir, `.${path}`))
  );
}

describe("site navigation", () => {
  it("points every visible link at an existing route", () => {
    const broken = allLinks()
      .filter((link) => !link.hidden && !resolves(link.href))
      .map((link) => `${link.name} -> ${link.href}`);
    expect(broken).toEqual([]);
  });

  it("shows the founders link exactly when its route exists", () => {
    const routeExists = existsSync(resolve(appDir, "for/founders/page.tsx"));
    expect(FOUNDERS_PAGE_LIVE).toBe(routeExists);
    const founders = allLinks().filter((link) => link.href === "/for/founders");
    expect(founders.length).toBeGreaterThan(0);
    for (const link of founders) {
      expect(Boolean(link.hidden)).toBe(!routeExists);
    }
  });
});
