import { describe, expect, it } from "vitest";
import { resolveReporterIds } from "../resolve";

describe("resolveReporterIds", () => {
  it("reads WRAPS_ERROR_PROVIDERS", () => {
    expect(resolveReporterIds({ WRAPS_ERROR_PROVIDERS: "sentry" })).toEqual([
      "sentry",
    ]);
  });

  it("trims, lowercases and drops empty entries", () => {
    expect(
      resolveReporterIds({ WRAPS_ERROR_PROVIDERS: " Sentry , , foo " })
    ).toEqual(["sentry", "foo"]);
  });

  it("derives sentry from SENTRY_DSN when providers are unset", () => {
    expect(resolveReporterIds({ SENTRY_DSN: "https://k@o.ingest/1" })).toEqual([
      "sentry",
    ]);
  });

  it("derives sentry from WRAPS_ERROR_DSN when providers are unset", () => {
    expect(
      resolveReporterIds({ WRAPS_ERROR_DSN: "https://k@o.ingest/1" })
    ).toEqual(["sentry"]);
  });

  it("derives from credentials when providers are empty", () => {
    expect(
      resolveReporterIds({
        WRAPS_ERROR_PROVIDERS: "",
        SENTRY_DSN: "https://k@o.ingest/1",
      })
    ).toEqual(["sentry"]);
  });

  it("returns nothing with no providers and no DSN", () => {
    expect(resolveReporterIds({})).toEqual([]);
  });

  it("treats an empty SENTRY_DSN as absent", () => {
    expect(resolveReporterIds({ SENTRY_DSN: "" })).toEqual([]);
  });
});
