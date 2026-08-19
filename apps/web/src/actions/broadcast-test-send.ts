"use server";

import { SESv2Client } from "@aws-sdk/client-sesv2";
import { toPlainText } from "@react-email/render";
import {
  findAwsAccountForOrg,
  findTemplateContent,
  getSampleRecipientsWithProperties,
} from "@wraps/db";
import { resolveConfigurationSetName, sendEmail } from "@wraps/email-send";
import {
  buildSesRenderData,
  renderTemplateStrict,
  transformVariablesForSes,
} from "@wraps/template-render";
import { getOrAssumeRole } from "@/lib/aws/credential-cache";
import type { RecipientFilter, VariableMapping } from "@/lib/batch";
import { createActionLogger, serializeError } from "@/lib/logger";
import { orgAction } from "./shared/org-action";

export type SendBroadcastTestInput = {
  awsAccountId: string;
  to: string;
  from: string;
  fromName?: string;
  replyTo?: string;
  subject: string;
  /** Exactly one of these. `templateId` renders the stored compiled HTML. */
  templateId?: string;
  htmlContent?: string;
  variableMappings?: VariableMapping[];
  /** Used to pick the sample contact the test renders against, so the test
   *  send exercises the same data the real broadcast will. */
  recipientFilter?: RecipientFilter;
};

export type SendBroadcastTestResult =
  | {
      success: true;
      messageId: string;
      /** Which contact's data the render used, or null when the audience is
       *  empty and placeholder data was used instead. */
      renderedAs: string | null;
      /** Things that are true of the test but not of the real broadcast. */
      caveats: string[];
    }
  | { success: false; error: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** SES's own wording for a sandbox / unverified-identity rejection. */
const SES_UNVERIFIED_PATTERN = /not verified|MessageRejected/i;

/**
 * Send one copy of the composed broadcast to a single address.
 *
 * There was no test send anywhere in the broadcast flow. The only external
 * customer who ever sent a real broadcast sent it to exactly one recipient and
 * never came back — the most likely reading is that they used a real broadcast
 * as a test send, which is the only way this flow offered to try one.
 *
 * Deliberately writes nothing: no batch_send row, no message_send row, no
 * counters. A test send must not show up in broadcast history or move any
 * reported number, or it becomes a second source of untrue counts.
 */
export const sendBroadcastTest = orgAction(
  {
    name: "sendBroadcastTest",
    resource: "broadcasts",
    permission: ["send"],
    orgId: (organizationId: string, _input: SendBroadcastTestInput) =>
      organizationId,
    onError: "Failed to send the test email",
  },
  async (
    _ctx,
    organizationId: string,
    input: SendBroadcastTestInput
  ): Promise<SendBroadcastTestResult> => {
    if (!EMAIL_PATTERN.test(input.to)) {
      return {
        success: false,
        error: `"${input.to}" is not a valid email address.`,
      };
    }
    if (!input.from) {
      return { success: false, error: "Pick a from address first." };
    }
    if (!input.subject) {
      return { success: false, error: "Add a subject line first." };
    }

    // Scoped by (awsAccountId, organizationId) — this is what stops a
    // caller-supplied account id from assuming another tenant's role.
    const account = await findAwsAccountForOrg(
      input.awsAccountId,
      organizationId
    );
    if (!account) {
      return { success: false, error: "AWS account not found" };
    }

    const html = await resolveHtml(input, organizationId);
    if (!html.ok) {
      return { success: false, error: html.error };
    }

    const caveats: string[] = [];
    const { renderData, renderedAs } = await buildRenderData(
      organizationId,
      input,
      caveats
    );

    let renderedHtml: string;
    let renderedSubject: string;
    try {
      const merged = buildSesRenderData(renderData);
      renderedHtml = renderTemplateStrict(
        transformVariablesForSes(html.html),
        merged
      );
      renderedSubject = renderTemplateStrict(
        transformVariablesForSes(input.subject),
        merged
      );
    } catch (error) {
      // A template that will not render is exactly what a test send is for.
      return {
        success: false,
        error: `This content could not be rendered: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      };
    }

    const sent = await deliverTestEmail({
      account,
      input,
      html: renderedHtml,
      subject: renderedSubject,
      organizationId,
    });

    if (!sent.ok) {
      return { success: false, error: sent.error };
    }

    return {
      success: true,
      messageId: sent.messageId,
      renderedAs,
      caveats,
    };
  }
);

type TestAccount = NonNullable<
  Awaited<ReturnType<typeof findAwsAccountForOrg>>
>;

async function deliverTestEmail(params: {
  account: TestAccount;
  input: SendBroadcastTestInput;
  html: string;
  subject: string;
  organizationId: string;
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const { account, input, html, subject, organizationId } = params;
  const log = createActionLogger("sendBroadcastTest", { organizationId });

  let credentials: Awaited<ReturnType<typeof getOrAssumeRole>>;
  try {
    credentials = await getOrAssumeRole({
      roleArn: account.roleArn,
      externalId: account.externalId,
      region: account.region,
    });
  } catch (error) {
    log.error(
      { err: serializeError(error) },
      "AssumeRole failed for broadcast test send"
    );
    return {
      ok: false,
      error:
        "Wraps could not assume the IAM role for this AWS account. Reconnect the account, or run `wraps platform update-role`.",
    };
  }

  const client = new SESv2Client({
    region: account.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  // Same config-set resolution the batch sender uses, so a test send is
  // tracked and throttled the way the broadcast will be.
  const configurationSetName = resolveConfigurationSetName({
    fromDomain: input.from.split("@").at(-1),
    storedConfigSetName: account.features?.email?.configSetName,
    identities: account.features?.email?.identities,
  });

  try {
    const result = await sendEmail({
      client,
      from: input.fromName ? `${input.fromName} <${input.from}>` : input.from,
      replyTo: input.replyTo,
      to: input.to,
      subject,
      html,
      text: toPlainText(html),
      configurationSetName,
      tags: [
        { name: "organizationId", value: organizationId },
        { name: "source", value: "broadcast-test" },
      ],
    });
    return { ok: true, messageId: result.messageId };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    log.error(
      { err: serializeError(error) },
      "SES rejected a broadcast test send"
    );

    // The sandbox rejection is the single most likely failure here, and the
    // generic SES text does not say what to do about it.
    if (SES_UNVERIFIED_PATTERN.test(message)) {
      return {
        ok: false,
        error: `SES rejected this send: ${message} If this AWS account is still in the SES sandbox, only verified addresses can receive mail — verify ${input.to} in the SES console, or request production access.`,
      };
    }
    return { ok: false, error: message || "SES rejected this send." };
  }
}

async function resolveHtml(
  input: SendBroadcastTestInput,
  organizationId: string
): Promise<{ ok: true; html: string } | { ok: false; error: string }> {
  if (input.templateId) {
    const templateData = await findTemplateContent(
      input.templateId,
      organizationId
    );
    if (!templateData) {
      return { ok: false, error: "Template not found" };
    }
    if (!templateData.compiledHtml) {
      return {
        ok: false,
        error:
          "This template has not been compiled yet. Open it in the editor and save it first.",
      };
    }
    return { ok: true, html: templateData.compiledHtml };
  }

  if (input.htmlContent?.trim()) {
    return { ok: true, html: input.htmlContent };
  }

  return { ok: false, error: "Pick a template or enter HTML content first." };
}

/**
 * Mirrors resolveContactField in apps/api's variable-mappings worker — the
 * test send has to resolve exactly what the broadcast will, or it tests
 * something else.
 */
function applyVariableMappings(
  data: Record<string, unknown>,
  mappings: VariableMapping[] | undefined,
  sample: Record<string, unknown> | undefined
): void {
  const PROPERTY_PREFIX = "properties.";
  const properties = sample?.properties as Record<string, unknown> | undefined;

  for (const mapping of mappings ?? []) {
    if (mapping.source.type === "static") {
      data[mapping.variableName] = mapping.source.value;
      continue;
    }
    const field = mapping.source.field;
    data[mapping.variableName] = field.startsWith(PROPERTY_PREFIX)
      ? (properties?.[field.slice(PROPERTY_PREFIX.length)] ?? "")
      : (sample?.[field] ?? "");
  }
}

/**
 * Render against a real contact from the selected audience, mirroring what the
 * preview carousel shows and what the batch sender resolves. Falls back to
 * placeholder values when the audience is empty, and says so.
 */
async function buildRenderData(
  organizationId: string,
  input: SendBroadcastTestInput,
  caveats: string[]
): Promise<{ renderData: Record<string, unknown>; renderedAs: string | null }> {
  const { contacts } = await getSampleRecipientsWithProperties(
    organizationId,
    "email",
    input.recipientFilter
      ? {
          audienceType: input.recipientFilter.audienceType,
          topicId: input.recipientFilter.topicId,
          segmentId: input.recipientFilter.segmentId,
        }
      : undefined
  );

  const sample = contacts[0];
  if (!sample) {
    caveats.push(
      "This audience has no contacts, so the test rendered with placeholder values rather than real contact data."
    );
  }

  const data: Record<string, unknown> = {
    "contact.email": sample?.email ?? input.to,
    "contact.firstName": sample?.firstName ?? "there",
    "contact.lastName": sample?.lastName ?? "",
    "contact.company": sample?.company ?? "",
    email: sample?.email ?? input.to,
    firstName: sample?.firstName ?? "there",
    lastName: sample?.lastName ?? "",
    company: sample?.company ?? "",
    jobTitle: sample?.jobTitle ?? "",
    ...(sample?.properties ?? {}),
  };

  applyVariableMappings(data, input.variableMappings, sample);

  // The real broadcast injects per-recipient unsubscribe and preference links.
  // A test send has no contact to key them to, so they are placeholders and
  // that has to be said rather than shipping a dead link silently.
  if (!(data.unsubscribeUrl && data.preferencesUrl)) {
    caveats.push(
      "Unsubscribe and preference links are placeholders in a test send — they resolve per recipient in the real broadcast."
    );
  }
  data.unsubscribeUrl ||= "#test-send-unsubscribe";
  data.preferencesUrl ||= "#test-send-preferences";

  return { renderData: data, renderedAs: sample?.email ?? null };
}
