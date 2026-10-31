import { describe, expect, it } from "vitest";
import {
  type BounceKind,
  CONTENT_BOUNCE_SUBTYPES,
  classifyBounce,
  isSuppressionBounceSubType,
  SUPPRESSION_BOUNCE_SUBTYPES,
} from "./bounce-classification";

describe("classifyBounce", () => {
  const cases: [
    string | null | undefined,
    string | null | undefined,
    BounceKind,
  ][] = [
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

  it("exports the content sub-types the classifier treats as message problems", () => {
    expect([...CONTENT_BOUNCE_SUBTYPES]).toEqual([
      "MessageTooLarge",
      "ContentRejected",
      "AttachmentRejected",
    ]);
  });
});

describe("isSuppressionBounceSubType", () => {
  it.each([
    "Suppressed",
    "OnAccountSuppressionList",
    "OnTenantSuppressionList",
    "EmailValidationSuppressed",
  ])("%s is a suppression: SES never attempted delivery", (subType) => {
    expect(isSuppressionBounceSubType(subType)).toBe(true);
  });

  it.each([
    "General",
    "NoEmail",
    "MailboxFull",
    "Undetermined",
    "onaccountsuppressionlist",
    "",
    null,
    undefined,
  ])("%s is not a suppression", (subType) => {
    expect(isSuppressionBounceSubType(subType)).toBe(false);
  });

  it("exports the same sub-types the predicate accepts", () => {
    expect([...SUPPRESSION_BOUNCE_SUBTYPES]).toEqual([
      "Suppressed",
      "OnAccountSuppressionList",
      "OnTenantSuppressionList",
      "EmailValidationSuppressed",
    ]);
  });
});
