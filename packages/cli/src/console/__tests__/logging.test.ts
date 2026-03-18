import { describe, expect, it } from "vitest";
import { redactLoggedUrl } from "../logging.js";

describe("redactLoggedUrl", () => {
  it("redacts a token when it is the only query parameter", () => {
    expect(redactLoggedUrl("/api/metrics?token=secret-token")).toBe(
      "/api/metrics?token=***"
    );
  });

  it("redacts a token without changing surrounding query parameters", () => {
    expect(redactLoggedUrl("/api/metrics?cursor=1&token=secret-token&limit=50")).toBe(
      "/api/metrics?cursor=1&token=***&limit=50"
    );
  });

  it("redacts every token query parameter in a URL", () => {
    expect(
      redactLoggedUrl("/api/metrics?token=first-token&cursor=1&token=second-token")
    ).toBe("/api/metrics?token=***&cursor=1&token=***");
  });

  it("leaves URLs without a token query parameter unchanged", () => {
    expect(redactLoggedUrl("/api/metrics?cursor=1&limit=50")).toBe(
      "/api/metrics?cursor=1&limit=50"
    );
  });
});
