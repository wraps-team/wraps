import { test } from "@e2e-dev/web";
import { expect, unique } from "e2e";
import { openInWorkspace } from "./workspace.ts";

test(
  "the owner creates an API key",
  { session: "owner" },
  async ({ agent, app, browser, screen }) => {
    const workspace = await openInWorkspace(app, browser, "/settings/api-keys");

    await agent.act(
      "in the {workspace} workspace, create an API key named {name}",
      {
        params: { name: "CI deploys", workspace: unique(workspace) },
      }
    );
    await agent.assert("the new API key's secret value is shown once to copy");
    await expect(screen.getByText("CI deploys").first()).toBeVisible();
  }
);
