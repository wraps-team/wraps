import { describe, expect, it } from "vitest";
import { toSafeRedirectPath } from "../utils";

describe("toSafeRedirectPath", () => {
  it("returns fallback for null, undefined, and empty values", () => {
    expect(toSafeRedirectPath(null)).toBe("/");
    expect(toSafeRedirectPath(undefined)).toBe("/");
    expect(toSafeRedirectPath("")).toBe("/");
    expect(toSafeRedirectPath("   ")).toBe("/");
    expect(toSafeRedirectPath(null, "/dashboard")).toBe("/dashboard");
  });

  it("allows valid relative paths", () => {
    expect(toSafeRedirectPath("/")).toBe("/");
    expect(toSafeRedirectPath("/onboarding")).toBe("/onboarding");
    expect(toSafeRedirectPath("/device?user_code=abc")).toBe(
      "/device?user_code=abc"
    );
    expect(toSafeRedirectPath("/invitations/test#section")).toBe(
      "/invitations/test#section"
    );
    expect(toSafeRedirectPath("/org/settings?tab=billing")).toBe(
      "/org/settings?tab=billing"
    );
  });

  it("rejects absolute URLs", () => {
    expect(toSafeRedirectPath("https://evil.example/phish")).toBe("/");
    expect(toSafeRedirectPath("http://evil.example")).toBe("/");
    expect(toSafeRedirectPath("ftp://files.example")).toBe("/");
  });

  it("rejects protocol-relative URLs", () => {
    expect(toSafeRedirectPath("//evil.example/path")).toBe("/");
    expect(toSafeRedirectPath("//evil.example")).toBe("/");
  });

  it("rejects javascript: scheme", () => {
    expect(toSafeRedirectPath("javascript:alert(1)")).toBe("/");
  });

  it("rejects scheme-like paths starting with /", () => {
    expect(toSafeRedirectPath("/javascript:alert(1)")).toBe("/");
    expect(toSafeRedirectPath("/vbscript:msgbox")).toBe("/");
    expect(toSafeRedirectPath("/data:text/html,<h1>hi</h1>")).toBe("/");
  });

  it("rejects percent-encoded scheme bypasses", () => {
    expect(toSafeRedirectPath("/javascript%3aalert(1)")).toBe("/");
    expect(toSafeRedirectPath("/javascript%3Aalert(1)")).toBe("/");
  });

  it("trims whitespace before checking", () => {
    expect(toSafeRedirectPath("  /onboarding  ")).toBe("/onboarding");
    expect(toSafeRedirectPath("  https://evil.example  ")).toBe("/");
  });

  it("uses custom fallback", () => {
    expect(toSafeRedirectPath("https://evil.example", "/custom")).toBe(
      "/custom"
    );
    expect(toSafeRedirectPath(null, "")).toBe("");
  });
});
