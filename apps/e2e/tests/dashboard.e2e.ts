import { test } from "@e2e-dev/web";
import { expect } from "e2e";

test(
  "the owner lands in their workspace",
  { session: "owner" },
  async ({ app, browser }) => {
    await app.open("/");
    await expect(browser).toHaveURL(/\/e2e-[a-z0-9]+\/emails$/);
  }
);
