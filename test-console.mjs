import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Navigating to http://localhost:3000...");
  await page.goto("http://localhost:3000");

  // Wait for page to load
  await page.waitForLoadState("networkidle");
  console.log("Page loaded");

  // Take initial screenshot
  await page.screenshot({ path: "/tmp/console-initial.png", fullPage: true });
  console.log("Screenshot saved to /tmp/console-initial.png");

  // Check if sidebar trigger button exists
  const sidebarTrigger = page.locator('[data-sidebar="trigger"]');
  const triggerCount = await sidebarTrigger.count();
  console.log("Sidebar trigger found:", triggerCount > 0);

  // Try to click sidebar toggle
  if (triggerCount > 0) {
    console.log("Clicking sidebar toggle to collapse...");
    await sidebarTrigger.click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: "/tmp/console-collapsed.png",
      fullPage: true,
    });
    console.log("Screenshot after collapse saved");

    // Click again to expand
    console.log("Clicking sidebar toggle to expand...");
    await sidebarTrigger.click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: "/tmp/console-expanded.png",
      fullPage: true,
    });
    console.log("Screenshot after expand saved");
  }

  // Check nav-user dropdown
  console.log("Looking for nav-user button...");
  const navUserButton = page.locator('[data-sidebar="menu-button"]').last();
  const navUserCount = await navUserButton.count();
  console.log("Nav-user button found:", navUserCount > 0);

  if (navUserCount > 0) {
    console.log("Clicking nav-user dropdown...");
    await navUserButton.click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: "/tmp/console-dropdown.png",
      fullPage: true,
    });
    console.log("Screenshot with dropdown saved");
  }

  // Check for console errors
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      errors.push(msg.text());
      console.log("Browser console error:", msg.text());
    }
  });

  console.log("\n=== Test Summary ===");
  console.log("Sidebar trigger works:", triggerCount > 0);
  console.log("Nav-user dropdown works:", navUserCount > 0);
  console.log("Console errors:", errors.length > 0 ? errors : "None");

  console.log("\nKeeping browser open for 10 seconds...");
  await page.waitForTimeout(10_000);

  await browser.close();
  console.log("Test complete!");
})();
