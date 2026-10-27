import { test } from "@e2e-dev/web";
import { expect } from "e2e";
import { openInWorkspace } from "./workspace.ts";

test(
  "the owner adds a contact by hand",
  { session: "owner" },
  async ({ agent, app, browser, screen }) => {
    await openInWorkspace(app, browser, "/contacts");

    await agent.act("add a contact with email {email} and first name {name}", {
      params: { email: "ada@e2e.wraps.test", name: "Ada" },
    });
    await expect(screen.getByText("ada@e2e.wraps.test")).toBeVisible();
  }
);
