import { describe, expect, it } from "vitest";
import { buildInvitationAuthUrl, getInvitedEmail } from "../invitation-auth";

describe("buildInvitationAuthUrl", () => {
  it("sends invitees without an account to sign-up with their email", () => {
    const url = new URL(
      buildInvitationAuthUrl({
        invitationId: "inv-1",
        email: "new+tag@example.com",
        hasAccount: false,
      }),
      "https://app.wraps.dev"
    );

    expect(url.pathname).toBe("/auth");
    expect(url.searchParams.get("mode")).toBe("signup");
    expect(url.searchParams.get("email")).toBe("new+tag@example.com");
    expect(url.searchParams.get("redirect")).toBe("/invitations/inv-1/accept");
  });

  it("sends invitees with an account to sign-in", () => {
    const url = new URL(
      buildInvitationAuthUrl({
        invitationId: "inv-1",
        email: "me@example.com",
        hasAccount: true,
      }),
      "https://app.wraps.dev"
    );

    expect(url.searchParams.get("mode")).toBe("signin");
  });
});

describe("getInvitedEmail", () => {
  it("returns the email when the redirect is an invitation page", () => {
    expect(getInvitedEmail("me@example.com", "/invitations/inv-1/accept")).toBe(
      "me@example.com"
    );
  });

  it("ignores the param for any other redirect", () => {
    expect(getInvitedEmail("me@example.com", "")).toBe("");
    expect(getInvitedEmail("me@example.com", "/device")).toBe("");
  });

  it("ignores missing or malformed emails", () => {
    expect(getInvitedEmail(null, "/invitations/inv-1/accept")).toBe("");
    expect(getInvitedEmail("not-an-email", "/invitations/inv-1/accept")).toBe(
      ""
    );
  });
});
