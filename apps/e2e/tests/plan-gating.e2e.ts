import { describe, test } from "@e2e-dev/web";
import { expect } from "e2e";
import { openInWorkspace } from "./workspace.ts";

// What a Free workspace is told about broadcasts, topics, scheduling and
// segments. Free can send a broadcast to all contacts; topics and scheduling
// start at Pro, segmentation at Business.
//
// The e2e owner has no AWS account, so the composer stops at its first step
// and the Audience and Schedule locks are not reachable here. Those, and the
// Pro and Business paths, are asserted per plan against the real plan gate in
// apps/api/src/__tests__/plan-gate.test.ts and apps/web/src/lib/__tests__/
// plans-broadcast.test.ts.
describe("plan gating on broadcasts", { session: "owner" }, () => {
  test("Free can open the broadcast composer", async ({
    app,
    browser,
    screen,
  }) => {
    await openInWorkspace(app, browser, "/emails/broadcasts/new");

    await expect(browser).toHaveURL(/\/emails\/broadcasts\/new$/);
    await expect(screen.getByText("No AWS accounts connected.")).toBeVisible();
    await expect(screen.getByText("Something went wrong")).toHaveCount(0);
  });

  test("Free is sent to Business, not Pro, for segments", async ({
    app,
    browser,
    screen,
  }) => {
    await openInWorkspace(app, browser, "/segments");

    await expect(screen.getByText("Required:")).toBeVisible();
    await expect(screen.getByRole("link", "Upgrade to Business")).toBeVisible();
    await expect(screen.getByRole("link", "Upgrade to Pro")).toHaveCount(0);
  });

  test("the sidebar nudge offers topics and scheduling, not segments", async ({
    app,
    browser,
    screen,
  }) => {
    await openInWorkspace(app, browser, "/emails");

    await expect(screen.getByText("Unlock Topics & scheduling")).toBeVisible();
    await expect(screen.getByText("Unlock Audience Segments")).toHaveCount(0);
  });

  test("billing lists broadcasts under Free, scheduling under Pro, segmentation under Business", async ({
    app,
    browser,
    screen,
  }) => {
    await openInWorkspace(app, browser, "/settings/billing");

    await expect(
      screen.getByText("Broadcasts to all contacts").first()
    ).toBeVisible();
    await expect(
      screen.getByText("Topics & scheduled broadcasts").first()
    ).toBeVisible();
    await expect(screen.getByText("Segmentation").first()).toBeVisible();
  });
});
