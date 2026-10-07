/**
 * Tests for templates push skip/lockfile decisions.
 */
import { describe, expect, it } from "vitest";
import {
  isTemplateUnchanged,
  nextTemplateEntry,
} from "../template-push-state.js";

const entry = (over: Record<string, unknown> = {}) => ({
  id: "tpl_1",
  localHash: "h1",
  remoteHash: "h1",
  sesTemplateName: "wraps-welcome",
  lastPushed: "2026-01-01T00:00:00.000Z",
  ...over,
});

const base = {
  entry: entry(),
  sourceHash: "h1",
  existsRemotely: true,
  dashboardConfigured: true,
  force: false,
};

describe("isTemplateUnchanged", () => {
  it("T1: skips when both hashes match", () => {
    expect(isTemplateUnchanged(base)).toBe(true);
  });

  it("T2: retries when remoteHash is stale", () => {
    expect(
      isTemplateUnchanged({ ...base, entry: entry({ remoteHash: "old" }) })
    ).toBe(false);
  });

  it("T3: retries when remoteHash is missing", () => {
    expect(
      isTemplateUnchanged({ ...base, entry: entry({ remoteHash: undefined }) })
    ).toBe(false);
  });

  it("T4: SES-only users skip without remoteHash", () => {
    expect(
      isTemplateUnchanged({
        ...base,
        entry: entry({ remoteHash: undefined }),
        dashboardConfigured: false,
      })
    ).toBe(true);
  });

  it("T5: force, missing entry, or missing remote never skip", () => {
    expect(isTemplateUnchanged({ ...base, force: true })).toBe(false);
    expect(isTemplateUnchanged({ ...base, entry: undefined })).toBe(false);
    expect(isTemplateUnchanged({ ...base, existsRemotely: false })).toBe(false);
  });
});

describe("nextTemplateEntry", () => {
  const common = {
    sourceHash: "h2",
    sesTemplateName: "wraps-welcome",
    now: "2026-02-02T00:00:00.000Z",
  };

  it("T6: advances everything when SES and API succeed", () => {
    const next = nextTemplateEntry({
      ...common,
      previous: undefined,
      sesOk: true,
      apiResult: { success: true, id: "tpl_new" },
    });
    expect(next?.remoteHash).toBe("h2");
    expect(next?.localHash).toBe("h2");
    expect(next?.id).toBe("tpl_new");
    expect(next?.lastPushed).toBe(common.now);
  });

  it("T7: keeps remoteHash and id when the dashboard sync failed, and the next push retries", () => {
    const next = nextTemplateEntry({
      ...common,
      previous: entry({ id: "tpl_1", remoteHash: "old" }),
      sesOk: true,
      apiResult: { success: false },
    });
    expect(next?.localHash).toBe("h2");
    expect(next?.remoteHash).toBe("old");
    expect(next?.id).toBe("tpl_1");
    expect(
      isTemplateUnchanged({
        entry: next,
        sourceHash: "h2",
        existsRemotely: true,
        dashboardConfigured: true,
        force: false,
      })
    ).toBe(false);
  });

  it("T8: no API result and no previous leaves remote fields empty", () => {
    const next = nextTemplateEntry({
      ...common,
      previous: undefined,
      sesOk: true,
      apiResult: undefined,
    });
    expect(next?.remoteHash).toBeUndefined();
    expect(next?.id).toBeUndefined();
    expect(next?.localHash).toBe("h2");
  });

  it("T9: returns undefined when nothing reached any target", () => {
    expect(
      nextTemplateEntry({
        ...common,
        previous: entry(),
        sesOk: false,
        apiResult: undefined,
      })
    ).toBeUndefined();
  });
});
