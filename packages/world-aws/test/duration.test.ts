import { describe, expect, it } from "vitest";
import { Duration } from "../src/duration.js";

describe("Duration", () => {
  it("seconds() returns correct value", () => {
    expect(Duration.seconds(30)).toEqual({ seconds: 30 });
  });

  it("minutes() converts to seconds", () => {
    expect(Duration.minutes(5)).toEqual({ seconds: 300 });
  });

  it("hours() converts to seconds", () => {
    expect(Duration.hours(2)).toEqual({ seconds: 7200 });
  });

  it("days() converts to seconds", () => {
    expect(Duration.days(90)).toEqual({ seconds: 7_776_000 });
  });

  it("days(1) equals hours(24)", () => {
    expect(Duration.days(1)).toEqual(Duration.hours(24));
  });

  it("hours(1) equals minutes(60)", () => {
    expect(Duration.hours(1)).toEqual(Duration.minutes(60));
  });
});
