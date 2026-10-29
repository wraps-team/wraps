import { describe, expect, it } from "vitest";
import { type BounceKind, classifyBounce } from "./bounce-classification";

describe("classifyBounce", () => {
  const cases: [string | null | undefined, string | null | undefined, BounceKind][] =
    [
      ["Permanent", "General", "hard"],
      ["Permanent", "NoEmail", "hard"],
      ["Transient", "General", "soft"],
      ["Transient", "MailboxFull", "soft"],
      ["Transient", "MessageTooLarge", "content"],
      ["Transient", "ContentRejected", "content"],
      ["Transient", "AttachmentRejected", "content"],
      ["Undetermined", "Undetermined", "soft"],
      [undefined, undefined, "unknown"],
      [null, null, "unknown"],
      ["Bogus", "General", "unknown"],
      ["permanent", "General", "unknown"],
    ];

  it.each(cases)("%s / %s -> %s", (type, subType, expected) => {
    expect(classifyBounce(type, subType)).toBe(expected);
  });
});
