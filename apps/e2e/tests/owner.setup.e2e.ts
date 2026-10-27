import { test } from "@e2e-dev/web";
import { expect, secrets, unique } from "e2e";

// Every run signs up a throwaway owner and org on the shared dev database.
// Nothing deletes them; the e2e.wraps.test email domain is how to find them.
test.setup(
  "sign up an owner and finish onboarding",
  { sessions: ["owner"] },
  async ({ agent, app, browser, screen, session }) => {
    const runId = Date.now().toString(36);
    const workspace = `e2e-${runId}`;

    await app.open("/auth");
    await screen.getByRole("button", "Sign up").click();
    await screen.getByLabel("Name").fill("E2E Owner");
    await screen.getByLabel("Email").fill(`owner+${runId}@e2e.wraps.test`);
    await screen.getByLabel("Password").fill(secrets.get("signup-password"));
    await screen.getByRole("button", "Create Account").click();

    await expect(browser).toHaveURL(/\/onboarding(\?|$)/);
    await screen.getByLabel("Organization Name").fill("E2E Workspace");
    await screen.getByLabel("URL Slug").fill(workspace);
    await screen.getByRole("button", "Create Organization").click();
    await expect(screen.getByText("Choose Your Plan")).toBeVisible();

    await agent.act(
      "finish onboarding the {workspace} workspace on the Free plan without inviting anyone or connecting AWS, until the dashboard opens",
      { params: { workspace: unique(workspace) } }
    );
    await expect(browser).toHaveURL(new RegExp(`/${workspace}$`));

    await session.save("owner");
  }
);
