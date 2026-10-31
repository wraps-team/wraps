import {
  type BounceSubtypeDescription,
  type CodeTranslation,
  describeBounceSubtype,
  translateDiagnosticCode,
} from "@wraps/core/email-diagnostics";
import type { BounceReasonRow } from "@wraps/db";

type BounceReasonInput = Pick<
  BounceReasonRow,
  "hasDetail" | "sampleStatus" | "sampleCode" | "bounceType" | "bounceSubType"
>;

/**
 * The copy for one bounce reason group: the translation of the group's sample
 * status and code when it has detail, and the sub-type copy as the fallback.
 * The deliverability reasons route and the address review filter both read
 * titles from here, so a reason the card shows resolves back to its groups.
 */
export function bounceReasonCopy(row: BounceReasonInput): {
  translation: CodeTranslation | null;
  subtype: BounceSubtypeDescription;
  title: string;
} {
  // The copy comes from the same catalog the webhook used. The sample is one
  // row's status and code, so the copy matches the reason key of the group.
  const translation = row.hasDetail
    ? translateDiagnosticCode({
        status: row.sampleStatus ?? undefined,
        diagnosticCode: row.sampleCode ?? undefined,
      })
    : null;
  const subtype = describeBounceSubtype({
    bounceType: row.bounceType,
    bounceSubType: row.bounceSubType,
  });
  return { translation, subtype, title: translation?.title ?? subtype.title };
}
