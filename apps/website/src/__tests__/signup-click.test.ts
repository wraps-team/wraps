import { describe, expect, it } from "vitest";
import { signupClickProperties } from "@/lib/signup-click";

describe("signupClickProperties", () => {
  it("classifies a signup link with its page, text and plan", () => {
    expect(
      signupClickProperties(
        "https://app.wraps.dev/auth?mode=signup&plan=pro&utm_source=x",
        "/tools/ses-calculator",
        "  Start\n  building "
      )
    ).toEqual({
      page_path: "/tools/ses-calculator",
      link_text: "Start building",
      plan: "pro",
    });
  });

  it("treats /sign-up and a bare /auth as signup", () => {
    expect(
      signupClickProperties("https://app.wraps.dev/sign-up", "/", "Sign up")
    ).toEqual({ page_path: "/", link_text: "Sign up" });
    expect(
      signupClickProperties("https://app.wraps.dev/auth", "/", "Get started")
    ).toEqual({ page_path: "/", link_text: "Get started" });
  });

  it("ignores sign-in links", () => {
    expect(
      signupClickProperties(
        "https://app.wraps.dev/auth?mode=signin",
        "/",
        "Log in"
      )
    ).toBeNull();
  });

  it("ignores links that are not into the signup flow", () => {
    expect(signupClickProperties("/docs/quickstart", "/", "Docs")).toBeNull();
    expect(
      signupClickProperties("https://app.wraps.dev/emails", "/", "Emails")
    ).toBeNull();
    expect(
      signupClickProperties("https://evil.dev/auth?mode=signup", "/", "x")
    ).toBeNull();
  });

  it("caps long link text", () => {
    const props = signupClickProperties(
      "https://app.wraps.dev/auth?mode=signup",
      "/",
      "a".repeat(200)
    );
    expect(props?.link_text).toHaveLength(80);
  });
});
