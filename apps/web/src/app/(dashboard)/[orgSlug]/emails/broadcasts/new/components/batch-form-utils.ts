import { format } from "date-fns";
import type {
  AudienceType,
  BatchSendWithMeta,
  ContentType,
  VariableMapping,
} from "@/lib/batch";
import { getRequiredPlan, PLANS, type PlanFeature } from "@/lib/plans";

/** Display name of the cheapest public plan that unlocks `feature`. */
export function requiredPlanName(feature: PlanFeature): string {
  return PLANS[getRequiredPlan(feature) ?? "pro"].name;
}

export type ScheduleType = "now" | "later";

export type CampaignData = {
  name: string;
  subject: string;
  previewText: string;
  fromPrefix: string;
  fromDomain: string;
  fromName: string;
  replyTo: string;
  awsAccountId: string;
  contentType: ContentType;
  templateId: string;
  htmlContent: string;
  variableMappings: VariableMapping[];
  audienceType: AudienceType;
  topicId: string;
  segmentId: string;
  scheduleType: ScheduleType;
  scheduledDate: Date | undefined;
  scheduledTime: string;
};

/**
 * A template whose subject is literally `{{subject}}` is asking the broadcast to
 * supply the value, so copying that placeholder into the broadcast's own subject
 * field would just leave it unresolved at send time. Treat it as empty and let
 * the user type the real subject in the Subject & Preview card.
 */
export function stripSelfReferencingPlaceholder(
  variableName: string,
  value: string | null | undefined
): string {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  const isSelfReference =
    trimmed === `{{${variableName}}}` || trimmed === `{{ ${variableName} }}`;
  return isSelfReference ? "" : value;
}

/**
 * Resolve what a draft's Subject / Preview Text field should show on load.
 *
 * Drafts saved before the mapper bound these to the Subject & Preview card
 * stored the bare placeholder in `subject` and the user's real text in
 * `variableMappings`. Stripping the placeholder without lifting that answer
 * back out would discard the subject the moment the draft is opened — and the
 * mapper's sync effect would then overwrite the mapping with the empty value,
 * losing it for good on the next save.
 */
export function resolveFormManagedValue(
  variableName: string,
  stored: string | null | undefined,
  mappings: VariableMapping[] | null | undefined
): string {
  const stripped = stripSelfReferencingPlaceholder(variableName, stored);
  if (stripped) {
    return stripped;
  }
  const mapped = mappings?.find((m) => m.variableName === variableName);
  return mapped?.source.type === "static" ? mapped.source.value : "";
}

export function mapBatchToCampaignData(
  batch: BatchSendWithMeta
): Partial<CampaignData> {
  const result: Partial<CampaignData> = {
    contentType: batch.templateId ? "template" : "html",
    scheduleType: "now",
  };

  if (batch.htmlContent) result.htmlContent = batch.htmlContent;
  if (batch.variableMappings?.length)
    result.variableMappings = batch.variableMappings;
  if (batch.audienceType) result.audienceType = batch.audienceType;
  if (batch.topicId) result.topicId = batch.topicId;
  if (batch.segmentId) result.segmentId = batch.segmentId;

  // A schedule that has already passed drops back to "send now". The date
  // picker disables past dates, so restoring one leaves the user looking at a
  // date they cannot re-select while the review step promises a send time that
  // is already gone.
  if (batch.scheduledFor && batch.scheduledFor.getTime() > Date.now()) {
    result.scheduleType = "later";
    result.scheduledDate = batch.scheduledFor;
    result.scheduledTime = format(batch.scheduledFor, "HH:mm");
  }

  if (batch.name) result.name = batch.name;

  const subject = resolveFormManagedValue(
    "subject",
    batch.subject,
    batch.variableMappings
  );
  if (subject) result.subject = subject;
  const previewText = resolveFormManagedValue(
    "previewText",
    batch.previewText,
    batch.variableMappings
  );
  if (previewText) result.previewText = previewText;
  if (batch.fromName) result.fromName = batch.fromName;
  if (batch.replyTo) result.replyTo = batch.replyTo;
  if (batch.templateId) result.templateId = batch.templateId;
  if (batch.awsAccount?.id) result.awsAccountId = batch.awsAccount.id;

  if (batch.from?.includes("@")) {
    const [prefix, domain] = batch.from.split("@");
    if (prefix) result.fromPrefix = prefix;
    if (domain) result.fromDomain = domain;
  }

  return result;
}
