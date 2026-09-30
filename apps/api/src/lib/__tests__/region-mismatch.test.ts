import { beforeEach, describe, expect, it, vi } from "vitest";

const { info } = vi.hoisted(() => ({ info: vi.fn() }));
vi.mock("../logger", () => ({ log: { info } }));

import {
  logNonHomeRegionEvent,
  resetNonHomeRegionLog,
} from "../region-mismatch";

const base = {
  accountId: "acct-1",
  awsAccountNumber: "123456789012",
  storedRegion: "us-east-1",
  now: 1_000_000,
};

describe("logNonHomeRegionEvent", () => {
  beforeEach(() => {
    info.mockClear();
    resetNonHomeRegionLog();
  });

  it("does not log an event from the stored region", () => {
    expect(logNonHomeRegionEvent({ ...base, eventRegion: "us-east-1" })).toBe(
      false
    );
    expect(info).not.toHaveBeenCalled();
  });

  it("does not log when the envelope has no region", () => {
    expect(logNonHomeRegionEvent({ ...base, eventRegion: undefined })).toBe(
      false
    );
    expect(info).not.toHaveBeenCalled();
  });

  it("logs an event from another region with both regions", () => {
    expect(logNonHomeRegionEvent({ ...base, eventRegion: "eu-west-1" })).toBe(
      true
    );
    expect(info).toHaveBeenCalledWith("Webhook: event from non-home region", {
      awsAccountNumber: "123456789012",
      eventRegion: "eu-west-1",
      storedRegion: "us-east-1",
    });
  });

  it("logs once per account and region per hour", () => {
    logNonHomeRegionEvent({ ...base, eventRegion: "eu-west-1" });
    expect(
      logNonHomeRegionEvent({
        ...base,
        eventRegion: "eu-west-1",
        now: base.now + 59 * 60 * 1000,
      })
    ).toBe(false);
    expect(
      logNonHomeRegionEvent({
        ...base,
        eventRegion: "eu-west-1",
        now: base.now + 60 * 60 * 1000,
      })
    ).toBe(true);
    expect(info).toHaveBeenCalledTimes(2);
  });

  it("throttles each region and account independently", () => {
    logNonHomeRegionEvent({ ...base, eventRegion: "eu-west-1" });
    expect(logNonHomeRegionEvent({ ...base, eventRegion: "ap-south-1" })).toBe(
      true
    );
    expect(
      logNonHomeRegionEvent({
        ...base,
        accountId: "acct-2",
        eventRegion: "eu-west-1",
      })
    ).toBe(true);
    expect(info).toHaveBeenCalledTimes(3);
  });
});
