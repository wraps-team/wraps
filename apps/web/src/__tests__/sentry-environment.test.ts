import { sentryEnvironment } from "@/lib/sentry-environment";

describe("sentryEnvironment", () => {
  it("prefers the Vercel env when both are set", () => {
    expect(sentryEnvironment("production", "production")).toBe("production");
  });

  it("prefers the Vercel env when they differ", () => {
    expect(sentryEnvironment("preview", "production")).toBe("preview");
  });

  it("falls back to NODE_ENV when the Vercel env is unset", () => {
    expect(sentryEnvironment(undefined, "production")).toBe("production");
  });

  it("falls back to development when neither is set", () => {
    expect(sentryEnvironment(undefined, undefined)).toBe("development");
  });

  it("treats an empty string as unset and falls back to NODE_ENV", () => {
    expect(sentryEnvironment("", "test")).toBe("test");
  });
});
