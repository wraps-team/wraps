import { test } from "@e2e-dev/web";
import { expect, secrets } from "e2e";
import { type SeededInvitation, seedInvitation } from "./invitation-seed";

const withInvitation = (inviteeHasAccount: boolean) =>
  test.extend<{ invite: SeededInvitation }>({
    invite: async ({ browser: _browser }, use) => {
      const seeded = await seedInvitation({ inviteeHasAccount });
      try {
        await use(seeded.invitation);
      } finally {
        await seeded.cleanup();
      }
    },
  });

const newInviteeTest = withInvitation(false);
const returningInviteeTest = withInvitation(true);

newInviteeTest(
  "an invitee without an account signs up with the invited email and joins the org",
  async ({ app, screen, browser, invite }) => {
    await app.open(`/invitations/${invite.id}/accept`);
    await expect(screen.getByText(invite.orgName)).toBeVisible();

    await screen.getByRole("button", "Create Account to Accept").click();
    await expect(browser).toHaveURL(/\/auth\?.*mode=signup/);

    const email = screen.getByLabel("Email");
    await expect(email).toHaveValue(invite.email);
    await expect(email).toHaveAttribute("readonly", "");

    await screen.getByLabel("Name").fill("E2E Invitee");
    await screen.getByLabel("Password").fill(secrets.get("signup-password"));
    await screen.getByRole("button", "Create Account").click();

    // Sign-up returns to the invitation instead of starting onboarding
    await expect(browser).toHaveURL(
      new RegExp(`/invitations/${invite.id}/accept$`)
    );
    await screen.getByRole("button", "Accept Invitation").click();
    // The first visit compiles the org route in dev, which outlasts the default
    await expect(browser).toHaveURL(new RegExp(`/${invite.orgSlug}`), {
      timeout: 90_000,
    });
  }
);

returningInviteeTest(
  "an invitee with an account is sent to sign-in with the email filled in",
  async ({ app, screen, browser, invite }) => {
    await app.open(`/invitations/${invite.id}/accept`);

    await screen.getByRole("button", "Sign In to Accept").click();
    await expect(browser).toHaveURL(/\/auth\?.*mode=signin/);
    await expect(screen.getByRole("button", "Login")).toBeVisible();
    await expect(screen.getByLabel("Email")).toHaveValue(invite.email);
  }
);
