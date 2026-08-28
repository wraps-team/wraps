import { describe, expect, it } from "vitest";
import { canAutoRefresh } from "../live-refresh";

describe("canAutoRefresh", () => {
  it("allows the default (empty) view", () => {
    expect(canAutoRefresh({})).toBe(true);
  });

  it("allows an explicit first page", () => {
    expect(canAutoRefresh({ page: "1" })).toBe(true);
  });

  it("disallows any other page", () => {
    expect(canAutoRefresh({ page: "2" })).toBe(false);
  });

  it("disallows a search filter", () => {
    expect(canAutoRefresh({ search: "signup" })).toBe(false);
  });

  it("disallows an event name filter", () => {
    expect(canAutoRefresh({ eventName: "user.created" })).toBe(false);
  });

  it("disallows a contact email filter", () => {
    expect(canAutoRefresh({ contactEmail: "a@b.com" })).toBe(false);
  });

  it("disallows a date preset filter", () => {
    expect(canAutoRefresh({ datePreset: "7d" })).toBe(false);
  });

  it("disallows a dateFrom filter", () => {
    expect(canAutoRefresh({ dateFrom: "2026-01-01" })).toBe(false);
  });

  it("treats empty-string params as cleared, not set", () => {
    expect(canAutoRefresh({ search: "", page: "" })).toBe(true);
  });
});
