import { expect, test } from "e2e";

test("the sign-in page renders and switches to sign-up", async ({
  app,
  screen,
}) => {
  await app.open("/auth");
  await expect(screen.getByRole("button", "Login")).toBeVisible();

  await screen.getByRole("button", "Sign up").click();
  await expect(screen.getByRole("button", "Create Account")).toBeVisible();
  await expect(screen.getByLabel("Name")).toBeVisible();
});
