// baseline:allow-large-file
/**
 * Workflow Step Handlers
 *
 * Individual handler functions for each workflow step type.
 * Called by executeStep() in the main workflow processor.
 */

import {
  PinpointSMSVoiceV2Client,
  SendTextMessageCommand,
} from "@aws-sdk/client-pinpoint-sms-voice-v2";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import {
  awsAccount,
  CASCADE_ENGAGEMENT_FIELD,
  contact,
  contactTopic,
  db,
  eq,
  messageSend,
  organization,
  type PreferredChannel,
  template,
  type WorkflowDefinitionSnapshot,
  type WorkflowStep,
  type WorkflowStepConfig,
  type WorkflowTransition,
  workflow,
  workflowExecution,
  workflowStepExecution,
} from "@wraps/db";
import {
  generateSESTemplateName,
  transformVariablesForSes,
  upsertSESTemplate,
} from "@wraps/email";
import { and, sql } from "drizzle-orm";
import { trackFirstEmailSent } from "../../lib/activation-tracking";
import { awsDefaults } from "../../lib/aws-defaults";
import { log } from "../../lib/logger";
import { generateUnsubscribeToken } from "../../lib/unsubscribe-token";
import { getCredentials } from "../../services/credentials";
import {
  scheduleWaitTimeout,
  scheduleWorkflowStep,
} from "../../services/workflow-queue";

import {
  evaluateCondition,
  FIRST_CLASS_CONTACT_FIELDS,
  htmlToPlainText,
  isValidE164Phone,
  sanitizeEmailSubject,
  substituteVariables,
  validateWebhookUrl,
} from "./workflow-utils";

// ═══════════════════════════════════════════════════════════════════════════
// SEND EMAIL
// ═══════════════════════════════════════════════════════════════════════════

export async function handleSendEmail(
  config: Extract<WorkflowStepConfig, { type: "send_email" }>,
  execution: typeof workflowExecution.$inferSelect,
  contactRecord: typeof contact.$inferSelect,
  organizationId: string
): Promise<{ action: "next"; data: Record<string, unknown> }> {
  // Check contact has email
  if (!contactRecord.email) {
    log.info("Workflow: contact has no email, skipping", {
      contactId: contactRecord.id,
    });
    return {
      action: "next",
      data: {
        skipped: true,
        reason: "no_email",
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Check contact email status
  if (
    contactRecord.emailStatus === "unsubscribed" ||
    contactRecord.emailStatus === "bounced" ||
    contactRecord.emailStatus === "complained"
  ) {
    log.info("Workflow: contact email suppressed, skipping", {
      contactId: contactRecord.id,
      emailStatus: contactRecord.emailStatus,
    });
    return {
      action: "next",
      data: {
        skipped: true,
        reason: `email_status_${contactRecord.emailStatus}`,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Get the workflow to find the AWS account and sender defaults (scoped by org)
  const [wf] = await db
    .select({
      awsAccountId: workflow.awsAccountId,
      defaultFrom: workflow.defaultFrom,
      defaultFromName: workflow.defaultFromName,
      defaultReplyTo: workflow.defaultReplyTo,
    })
    .from(workflow)
    .where(
      and(
        eq(workflow.id, execution.workflowId),
        eq(workflow.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!wf?.awsAccountId) {
    log.warn("Workflow: no AWS account configured", {
      workflowId: execution.workflowId,
    });
    return {
      action: "next",
      data: {
        skipped: true,
        reason: "no_aws_account",
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Get AWS account region
  const [account] = await db
    .select({ region: awsAccount.region })
    .from(awsAccount)
    .where(eq(awsAccount.id, wf.awsAccountId))
    .limit(1);

  if (!account) {
    throw new Error(`AWS account ${wf.awsAccountId} not found`);
  }

  // Get template (scoped by org for defense-in-depth)
  const [tmpl] = await db
    .select({
      id: template.id,
      name: template.name,
      subject: template.subject,
      compiledHtml: template.compiledHtml,
      emailType: template.emailType,
      sesTemplateName: template.sesTemplateName,
    })
    .from(template)
    .where(
      and(
        eq(template.id, config.templateId),
        eq(template.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!tmpl) {
    throw new Error(`Template ${config.templateId} not found`);
  }

  if (!tmpl.compiledHtml) {
    throw new Error(`Template ${config.templateId} has no compiled HTML`);
  }

  // Get organization for name
  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);

  // Get credentials for customer's AWS account
  const credentials = await getCredentials(wf.awsAccountId);

  // Create SES client
  const sesClient = new SESv2Client({
    ...awsDefaults,
    region: account.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  // Build variable replacement data.
  // Always include contact fields with empty string fallbacks — SES templates
  // fail with a rendering error if a referenced variable is absent entirely.
  const replacementData: Record<string, string> = {
    email: contactRecord.email,
    contactEmail: contactRecord.email,
    firstName: contactRecord.firstName ?? "",
    lastName: contactRecord.lastName ?? "",
    company: contactRecord.company ?? "",
    jobTitle: contactRecord.jobTitle ?? "",
    contactFirstName: contactRecord.firstName ?? "",
    contactLastName: contactRecord.lastName ?? "",
    contactCompany: contactRecord.company ?? "",
    contactJobTitle: contactRecord.jobTitle ?? "",
  };

  const addIfPresent = (key: string, value: string | null | undefined) => {
    if (value) {
      replacementData[key] = value;
    }
  };
  addIfPresent("organizationName", org?.name);

  // Add contact properties
  const properties = contactRecord.properties as Record<string, unknown> | null;
  if (properties) {
    for (const [key, value] of Object.entries(properties)) {
      const strValue = value != null ? String(value) : null;
      if (strValue) {
        replacementData[key] = strValue;
      }
    }
  }

  // Add trigger data
  const triggerData = execution.triggerData as Record<string, unknown> | null;
  if (triggerData) {
    for (const [key, value] of Object.entries(triggerData)) {
      const strValue = value != null ? String(value) : null;
      if (strValue) {
        replacementData[key] = strValue;
      }
    }
  }

  // Generate unsubscribe URLs for marketing emails
  const isMarketing = tmpl.emailType === "marketing";
  const apiBaseUrl = process.env.API_BASE_URL || "https://api.wraps.dev";
  const appBaseUrl = process.env.APP_BASE_URL || "https://app.wraps.dev";

  let unsubscribeUrl: string | undefined;
  let preferencesUrl: string | undefined;

  if (isMarketing) {
    const unsubscribeToken = await generateUnsubscribeToken(
      contactRecord.id,
      organizationId
    );
    unsubscribeUrl = `${apiBaseUrl}/unsubscribe/${unsubscribeToken}`;
    preferencesUrl = `${appBaseUrl}/preferences/${unsubscribeToken}`;
    replacementData.unsubscribeUrl = unsubscribeUrl;
    replacementData.preferencesUrl = preferencesUrl;
  }

  // Build from address (step config > workflow default > fallback)
  const fromAddress =
    config.from ||
    wf.defaultFrom ||
    `noreply@${process.env.DEFAULT_DOMAIN || "wraps.dev"}`;
  const fromName = config.fromName || wf.defaultFromName;
  const fromDisplay = fromName ? `${fromName} <${fromAddress}>` : fromAddress;
  const replyTo = config.replyTo || wf.defaultReplyTo;

  // Build headers for marketing emails
  const headers: Array<{ Name: string; Value: string }> = [];
  if (isMarketing && unsubscribeUrl) {
    headers.push(
      { Name: "List-Unsubscribe", Value: `<${unsubscribeUrl}>` },
      { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" }
    );
  }

  // Common email tags
  const emailTags = [
    { Name: "workflowId", Value: execution.workflowId },
    { Name: "executionId", Value: execution.id },
    { Name: "organizationId", Value: organizationId },
    { Name: "templateId", Value: config.templateId },
    { Name: "source", Value: "automation" },
  ];

  // Try to use SES template if available
  let sesTemplateName = tmpl.sesTemplateName;

  // Auto-publish if not published to SES (requires compiledHtml)
  if (!sesTemplateName && tmpl.compiledHtml) {
    sesTemplateName = await autoPublishTemplate(
      tmpl as {
        id: string;
        name: string;
        subject: string | null;
        compiledHtml: string;
      },
      credentials,
      account.region
    );
  }

  // Step-level subject override takes precedence over template subject
  const baseSubject = config.subject || tmpl.subject || "Message";

  let result: { MessageId?: string };
  let subject: string;

  if (sesTemplateName && !config.subject) {
    // Use SES template - let SES handle variable substitution
    // (SES templates have their own subject baked in, so only use this path
    // when there's no step-level override)
    subject = sanitizeEmailSubject(tmpl.subject || "Message");

    result = await sesClient.send(
      new SendEmailCommand({
        FromEmailAddress: fromDisplay,
        ReplyToAddresses: replyTo ? [replyTo] : undefined,
        Destination: {
          ToAddresses: [contactRecord.email],
        },
        Content: {
          Template: {
            TemplateName: sesTemplateName,
            TemplateData: JSON.stringify(replacementData),
            Headers: headers.length > 0 ? headers : undefined,
          },
        },
        ConfigurationSetName: "wraps-email-tracking",
        EmailTags: emailTags,
      })
    );

    log.info("Workflow: email sent via SES template", {
      template: sesTemplateName,
      to: contactRecord.email,
    });
  } else if (sesTemplateName && config.subject) {
    // SES template exists but step has a subject override — send as raw HTML
    // so we can apply the overridden subject
    const html = substituteVariables(tmpl.compiledHtml, replacementData, {
      escapeHtml: true,
    });

    const rawSubject = substituteVariables(baseSubject, replacementData);
    subject = sanitizeEmailSubject(rawSubject);

    result = await sesClient.send(
      new SendEmailCommand({
        FromEmailAddress: fromDisplay,
        ReplyToAddresses: replyTo ? [replyTo] : undefined,
        Destination: {
          ToAddresses: [contactRecord.email],
        },
        Content: {
          Simple: {
            Subject: { Data: subject },
            Body: {
              Html: { Data: html },
              Text: { Data: htmlToPlainText(html) },
            },
            Headers: headers.length > 0 ? headers : undefined,
          },
        },
        ConfigurationSetName: "wraps-email-tracking",
        EmailTags: emailTags,
      })
    );

    log.info("Workflow: email sent via raw HTML (subject override)", {
      to: contactRecord.email,
    });
  } else {
    // Fallback: Apply variable substitution locally and send raw HTML
    const html = substituteVariables(tmpl.compiledHtml, replacementData, {
      escapeHtml: true,
    });

    // Build subject with variable substitution
    const rawSubject = substituteVariables(baseSubject, replacementData);
    subject = sanitizeEmailSubject(rawSubject);

    result = await sesClient.send(
      new SendEmailCommand({
        FromEmailAddress: fromDisplay,
        ReplyToAddresses: replyTo ? [replyTo] : undefined,
        Destination: {
          ToAddresses: [contactRecord.email],
        },
        Content: {
          Simple: {
            Subject: { Data: subject },
            Body: {
              Html: { Data: html },
              Text: { Data: htmlToPlainText(html) },
            },
            Headers: headers.length > 0 ? headers : undefined,
          },
        },
        ConfigurationSetName: "wraps-email-tracking",
        EmailTags: emailTags,
      })
    );

    log.info("Workflow: email sent via raw HTML", { to: contactRecord.email });
  }

  const messageId = result.MessageId ?? "";

  // Record the send in messageSend table
  // Note: workflowExecutionId is not yet in schema, will be added later
  await db.insert(messageSend).values({
    organizationId,
    contactId: contactRecord.id,
    awsAccountId: wf.awsAccountId,
    channel: "email",
    sourceType: "workflow",
    recipient: contactRecord.email,
    subject,
    from: fromAddress,
    fromName: fromName || null,
    emailTemplateId: config.templateId,
    messageId,
    status: "sent",
    sentAt: new Date(),
  });

  // Track first email sent (must await in Lambda)
  await trackFirstEmailSent(organizationId, {
    channel: "email",
    source: "workflow",
  });

  // Update contact email metrics
  await db
    .update(contact)
    .set({
      lastEmailSentAt: new Date(),
      emailsSent: sql`COALESCE(${contact.emailsSent}, 0) + 1`,
    })
    .where(eq(contact.id, contactRecord.id));

  return {
    action: "next",
    data: {
      messageId,
      templateId: config.templateId,
      recipient: contactRecord.email,
      subject,
      timestamp: new Date().toISOString(),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-PUBLISH TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Auto-publish a template to SES if not already published.
 * Uses the existing compiledHtml from the template.
 * Returns the SES template name if successful, or null if publishing fails.
 */
async function autoPublishTemplate(
  tmpl: {
    id: string;
    name: string;
    subject: string | null;
    compiledHtml: string;
  },
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  },
  region: string
): Promise<string | null> {
  try {
    // 1. Transform variables for SES compatibility
    // compiledHtml already has {{contact.firstName}} format
    // We need to transform to {{contactFirstName}} format for SES
    // Also handles fallbacks: {{name|fallback}} → {{#if name}}{{name}}{{else}}fallback{{/if}}
    const sesHtml = transformVariablesForSes(tmpl.compiledHtml);
    const sesText = htmlToPlainText(sesHtml);
    const sesSubject = transformVariablesForSes(tmpl.subject || "Message");

    // 2. Generate template name and publish to SES
    const sesTemplateName = generateSESTemplateName(tmpl.id, tmpl.name);
    await upsertSESTemplate(credentials, region, {
      templateName: sesTemplateName,
      subject: sesSubject,
      htmlPart: sesHtml,
      textPart: sesText,
    });

    // 3. Update template in DB with SES template name
    await db
      .update(template)
      .set({
        sesTemplateName,
        publishedAt: new Date(),
      })
      .where(eq(template.id, tmpl.id));

    log.info("Workflow: auto-published SES template", {
      templateId: tmpl.id,
      sesTemplateName,
    });
    return sesTemplateName;
  } catch (error) {
    log.error("Workflow: auto-publish failed", error);
    return null; // Fall back to raw HTML
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SEND SMS
// ═══════════════════════════════════════════════════════════════════════════

export async function handleSendSms(
  config: Extract<WorkflowStepConfig, { type: "send_sms" }>,
  execution: typeof workflowExecution.$inferSelect,
  contactRecord: typeof contact.$inferSelect,
  organizationId: string
): Promise<{ action: "next"; data: Record<string, unknown> }> {
  // Get the contact's phone number
  if (!contactRecord.phone) {
    log.info("Workflow: contact has no phone, skipping SMS", {
      contactId: contactRecord.id,
    });
    return {
      action: "next",
      data: {
        skipped: true,
        reason: "no_phone",
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Validate phone number format (E.164)
  if (!isValidE164Phone(contactRecord.phone)) {
    log.warn("Workflow: invalid phone format", {
      contactId: contactRecord.id,
      phone: contactRecord.phone,
    });
    return {
      action: "next",
      data: {
        skipped: true,
        reason: "invalid_phone_format",
        phone: contactRecord.phone,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Get the workflow to find the AWS account and sender defaults (scoped by org)
  const [wf] = await db
    .select({
      awsAccountId: workflow.awsAccountId,
      defaultSenderId: workflow.defaultSenderId,
    })
    .from(workflow)
    .where(
      and(
        eq(workflow.id, execution.workflowId),
        eq(workflow.organizationId, organizationId)
      )
    )
    .limit(1);

  if (!wf?.awsAccountId) {
    log.warn("Workflow: no AWS account configured for SMS", {
      workflowId: execution.workflowId,
    });
    return {
      action: "next",
      data: {
        skipped: true,
        reason: "no_aws_account",
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Get the AWS account region
  const [account] = await db
    .select({ region: awsAccount.region })
    .from(awsAccount)
    .where(eq(awsAccount.id, wf.awsAccountId))
    .limit(1);

  if (!account) {
    throw new Error(`AWS account ${wf.awsAccountId} not found`);
  }

  // Get credentials for the customer's AWS account
  const credentials = await getCredentials(wf.awsAccountId);

  // Create Pinpoint SMS Voice V2 client with assumed credentials
  const smsClient = new PinpointSMSVoiceV2Client({
    ...awsDefaults,
    region: account.region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  // Build message body with variable substitution
  const rawBody = config.body || "";
  if (!rawBody) {
    log.warn("Workflow: SMS step has no message body");
    return {
      action: "next",
      data: {
        skipped: true,
        reason: "no_message_body",
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Build replacement data (same pattern as handleSendEmail)
  const replacementData: Record<string, string> = {
    email: contactRecord.email ?? "",
    contactEmail: contactRecord.email ?? "",
    firstName: contactRecord.firstName ?? "",
    lastName: contactRecord.lastName ?? "",
    company: contactRecord.company ?? "",
    jobTitle: contactRecord.jobTitle ?? "",
    contactFirstName: contactRecord.firstName ?? "",
    contactLastName: contactRecord.lastName ?? "",
    contactCompany: contactRecord.company ?? "",
    contactJobTitle: contactRecord.jobTitle ?? "",
    phone: contactRecord.phone ?? "",
  };

  const addIfPresent = (key: string, value: string | null | undefined) => {
    if (value) replacementData[key] = value;
  };

  // Add contact properties
  const properties = contactRecord.properties as Record<string, unknown> | null;
  if (properties) {
    for (const [key, value] of Object.entries(properties)) {
      const strValue = value != null ? String(value) : null;
      if (strValue) replacementData[key] = strValue;
    }
  }

  // Add trigger data
  const triggerData = execution.triggerData as Record<string, unknown> | null;
  if (triggerData) {
    for (const [key, value] of Object.entries(triggerData)) {
      const strValue = value != null ? String(value) : null;
      if (strValue) replacementData[key] = strValue;
    }
  }

  const normalizedBody = transformVariablesForSes(rawBody);
  const messageBody = substituteVariables(normalizedBody, replacementData);

  // Build sender ID (step config > workflow default)
  const senderId = config.senderId || wf.defaultSenderId;

  // Send SMS
  const command = new SendTextMessageCommand({
    DestinationPhoneNumber: contactRecord.phone,
    MessageBody: messageBody,
    ConfigurationSetName: "wraps-sms-config",
    MessageType: "TRANSACTIONAL",
    ...(senderId && { OriginationIdentity: senderId }),
  });

  const response = await smsClient.send(command);

  const smsMessageId = response.MessageId ?? "";

  log.info("Workflow: SMS sent", {
    to: contactRecord.phone,
    messageId: smsMessageId,
  });

  // Record the send in messageSend table (parity with email sends)
  await db.insert(messageSend).values({
    organizationId,
    contactId: contactRecord.id,
    awsAccountId: wf.awsAccountId,
    channel: "sms",
    sourceType: "workflow",
    recipient: contactRecord.phone,
    subject: null,
    from: senderId || null,
    fromName: null,
    messageId: smsMessageId,
    status: "sent",
    sentAt: new Date(),
  });

  // Update contact SMS metrics
  await db
    .update(contact)
    .set({
      lastSmsSentAt: new Date(),
      smsSent: sql`COALESCE(${contact.smsSent}, 0) + 1`,
    })
    .where(eq(contact.id, contactRecord.id));

  return {
    action: "next",
    data: {
      messageId: smsMessageId,
      recipient: contactRecord.phone,
      body: messageBody,
      timestamp: new Date().toISOString(),
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DELAY
// ═══════════════════════════════════════════════════════════════════════════

export async function handleDelay(
  config: Extract<WorkflowStepConfig, { type: "delay" }>,
  execution: typeof workflowExecution.$inferSelect,
  stepId: string,
  organizationId: string,
  completeExecution: (executionId: string) => Promise<void>
): Promise<{ action: "wait" }> {
  // Calculate delay in seconds
  let delaySeconds = config.amount;
  switch (config.unit) {
    case "minutes":
      delaySeconds *= 60;
      break;
    case "hours":
      delaySeconds *= 3600;
      break;
    case "days":
      delaySeconds *= 86_400;
      break;
    case "weeks":
      delaySeconds *= 604_800;
      break;
  }

  // Use snapshot transitions (immune to live edits) with fallback for pre-snapshot executions
  const snapshot =
    execution.definitionSnapshot as WorkflowDefinitionSnapshot | null;
  let transitions: WorkflowTransition[] | undefined;

  if (snapshot) {
    transitions = snapshot.transitions;
  } else {
    const [wf] = await db
      .select()
      .from(workflow)
      .where(
        and(
          eq(workflow.id, execution.workflowId),
          eq(workflow.organizationId, organizationId)
        )
      )
      .limit(1);
    transitions = wf?.transitions as WorkflowTransition[] | undefined;
  }

  const nextTransition = transitions?.find((t) => t.fromStepId === stepId);

  if (!nextTransition) {
    // No next step - complete execution
    await completeExecution(execution.id);
    return { action: "wait" };
  }

  // Schedule the next step
  const schedulerName = await scheduleWorkflowStep({
    executionId: execution.id,
    stepId: nextTransition.toStepId,
    organizationId,
    delaySeconds,
  });

  // Update execution status
  await db
    .update(workflowExecution)
    .set({
      status: "paused",
      nextStepScheduledAt: new Date(Date.now() + delaySeconds * 1000),
      delaySchedulerName: schedulerName,
      updatedAt: new Date(),
    })
    .where(eq(workflowExecution.id, execution.id));

  return { action: "wait" };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONDITION
// ═══════════════════════════════════════════════════════════════════════════

export async function handleCondition(
  config: Extract<WorkflowStepConfig, { type: "condition" }>,
  contactRecord: typeof contact.$inferSelect,
  execution: typeof workflowExecution.$inferSelect,
  step: WorkflowStep
): Promise<{ action: "next"; branch: "yes" | "no" }> {
  // Handle engagement.status — used by cascade condition steps to check
  // whether the contact engaged with a previous email. The preceding
  // wait_for_email_engagement step records its branch ("opened", "clicked",
  // "bounced", or "timeout") on the step execution row.
  if (config.field === CASCADE_ENGAGEMENT_FIELD) {
    // Scope to the same cascade group to avoid picking up engagement results
    // from a different cascade node in the same workflow execution.
    // Cascade step IDs follow the pattern: ${cascadeGroupId}-cond-${i},
    // and wait steps are: ${cascadeGroupId}-wait-${i}.
    const cascadeGroupId = step.cascadeGroupId;
    const waitStepFilter = cascadeGroupId
      ? sql`${workflowStepExecution.stepId} LIKE ${`${cascadeGroupId}-wait-%`}`
      : undefined;

    const previousWaitStep = await db
      .select({ branch: workflowStepExecution.branch })
      .from(workflowStepExecution)
      .where(
        and(
          eq(workflowStepExecution.executionId, execution.id),
          eq(workflowStepExecution.stepType, "wait_for_email_engagement"),
          eq(workflowStepExecution.status, "completed"),
          waitStepFilter
        )
      )
      .orderBy(sql`${workflowStepExecution.completedAt} DESC`)
      .limit(1);

    const engaged =
      previousWaitStep[0]?.branch === "opened" ||
      previousWaitStep[0]?.branch === "clicked";

    // The cascade expansion uses operator "equals" / value "true",
    // so "true" === "true" when engaged, "false" !== "true" when not.
    const fieldValue = String(engaged);
    const conditionMet = evaluateCondition(
      fieldValue,
      config.operator,
      config.value
    );

    return {
      action: "next",
      branch: conditionMet ? "yes" : "no",
    };
  }

  // Get the field value from contact properties
  const properties = contactRecord.properties as Record<string, unknown> | null;
  const triggerData = execution.triggerData as Record<string, unknown> | null;

  // Strip "properties." prefix — the editor generates field values like
  // "properties.plan" for custom properties, but the actual key in the
  // properties object is just "plan".
  const field = config.field.startsWith("properties.")
    ? config.field.slice("properties.".length)
    : config.field;

  // Try contact fields first, then contact.properties, then trigger data
  let fieldValue: unknown;
  if (field in contactRecord) {
    fieldValue = contactRecord[field as keyof typeof contactRecord];
  } else if (properties && field in properties) {
    fieldValue = properties[field];
  } else if (triggerData && field in triggerData) {
    fieldValue = triggerData[field];
  }

  // Evaluate condition
  const conditionMet = evaluateCondition(
    fieldValue,
    config.operator,
    config.value
  );

  return {
    action: "next",
    branch: conditionMet ? "yes" : "no",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// UPDATE CONTACT
// ═══════════════════════════════════════════════════════════════════════════

export async function handleUpdateContact(
  config: Extract<WorkflowStepConfig, { type: "update_contact" }>,
  contactRecord: typeof contact.$inferSelect
): Promise<{ action: "next"; data: Record<string, unknown> }> {
  const updates = config.updates || [];
  const currentProperties =
    (contactRecord.properties as Record<string, unknown>) || {};
  const newProperties = { ...currentProperties };
  const directUpdates: Partial<typeof contact.$inferInsert> = {};

  for (const update of updates) {
    const isFirstClass = FIRST_CLASS_CONTACT_FIELDS.has(update.field);

    switch (update.operation) {
      case "set":
        if (isFirstClass) {
          switch (update.field) {
            case "preferredChannel":
              directUpdates.preferredChannel =
                update.value as PreferredChannel | null;
              break;
            case "firstName":
              directUpdates.firstName = update.value as string | null;
              break;
            case "lastName":
              directUpdates.lastName = update.value as string | null;
              break;
            case "company":
              directUpdates.company = update.value as string | null;
              break;
            case "jobTitle":
              directUpdates.jobTitle = update.value as string | null;
              break;
          }
        } else {
          newProperties[update.field] = update.value;
        }
        break;
      case "unset":
        if (isFirstClass) {
          switch (update.field) {
            case "preferredChannel":
              directUpdates.preferredChannel = null;
              break;
            case "firstName":
              directUpdates.firstName = null;
              break;
            case "lastName":
              directUpdates.lastName = null;
              break;
            case "company":
              directUpdates.company = null;
              break;
            case "jobTitle":
              directUpdates.jobTitle = null;
              break;
          }
        } else {
          delete newProperties[update.field];
        }
        break;
      case "increment":
        newProperties[update.field] =
          (Number(newProperties[update.field]) || 0) + Number(update.value);
        break;
      case "decrement":
        newProperties[update.field] =
          (Number(newProperties[update.field]) || 0) - Number(update.value);
        break;
      case "append": {
        const arr = Array.isArray(newProperties[update.field])
          ? newProperties[update.field]
          : [];
        (arr as unknown[]).push(update.value);
        newProperties[update.field] = arr;
        break;
      }
      case "remove":
        if (Array.isArray(newProperties[update.field])) {
          newProperties[update.field] = (
            newProperties[update.field] as unknown[]
          ).filter((v) => v !== update.value);
        }
        break;
    }
  }

  await db
    .update(contact)
    .set({
      ...directUpdates,
      properties: newProperties,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(contact.id, contactRecord.id),
        eq(contact.organizationId, contactRecord.organizationId)
      )
    );

  return {
    action: "next",
    data: { updatedFields: updates.map((u) => u.field) },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK
// ═══════════════════════════════════════════════════════════════════════════

export async function handleWebhook(
  config: Extract<WorkflowStepConfig, { type: "webhook" }>,
  contactRecord: typeof contact.$inferSelect,
  execution: typeof workflowExecution.$inferSelect
): Promise<{ action: "next"; data: Record<string, unknown> }> {
  try {
    await validateWebhookUrl(config.url);
  } catch (error) {
    log.error("Webhook SSRF blocked", error, { url: config.url });
    return {
      action: "next",
      data: {
        error: error instanceof Error ? error.message : "Invalid webhook URL",
        blocked: true,
      },
    };
  }

  const body = {
    contact: {
      id: contactRecord.id,
      email: contactRecord.email,
      properties: contactRecord.properties,
    },
    execution: {
      id: execution.id,
      workflowId: execution.workflowId,
      triggerData: execution.triggerData,
    },
    ...(config.body || {}),
  };

  try {
    const response = await fetch(config.url, {
      method: config.method,
      headers: {
        "Content-Type": "application/json",
        ...(config.headers || {}),
      },
      body: config.method !== "GET" ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });

    return {
      action: "next",
      data: {
        status: response.status,
        ok: response.ok,
      },
    };
  } catch (error) {
    log.error("Webhook failed", error);
    return {
      action: "next",
      data: {
        error: error instanceof Error ? error.message : "Webhook failed",
      },
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// WAIT FOR EVENT
// ═══════════════════════════════════════════════════════════════════════════

export async function handleWaitForEvent(
  config: Extract<WorkflowStepConfig, { type: "wait_for_event" }>,
  execution: typeof workflowExecution.$inferSelect,
  stepId: string,
  organizationId: string
): Promise<{ action: "wait" }> {
  const timeoutSeconds = config.timeoutSeconds || 86_400; // Default 24 hours
  const timeoutAt = new Date(Date.now() + timeoutSeconds * 1000);

  // Schedule timeout
  const schedulerName = await scheduleWaitTimeout({
    executionId: execution.id,
    stepId,
    organizationId,
    timeoutSeconds,
  });

  // Update execution to waiting state
  await db
    .update(workflowExecution)
    .set({
      status: "waiting",
      waitingForEvent: config.eventName,
      waitTimeoutAt: timeoutAt,
      waitTimeoutSchedulerName: schedulerName,
      updatedAt: new Date(),
    })
    .where(eq(workflowExecution.id, execution.id));

  return { action: "wait" };
}

// ═══════════════════════════════════════════════════════════════════════════
// WAIT FOR EMAIL ENGAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export async function handleWaitForEmailEngagement(
  config: Extract<WorkflowStepConfig, { type: "wait_for_email_engagement" }>,
  execution: typeof workflowExecution.$inferSelect,
  step: WorkflowStep,
  organizationId: string
): Promise<{ action: "wait" }> {
  const timeoutSeconds = config.timeoutSeconds || 259_200; // Default 3 days
  const timeoutAt = new Date(Date.now() + timeoutSeconds * 1000);

  // Scope to cascade group if applicable, so we match the correct email
  const cascadeGroupId = step.cascadeGroupId;
  const sendStepFilter = cascadeGroupId
    ? sql`${workflowStepExecution.stepId} LIKE ${`${cascadeGroupId}-send-%`}`
    : undefined;

  // Find the previous send_email step execution to get the message ID
  const previousStepExecs = await db
    .select()
    .from(workflowStepExecution)
    .where(
      and(
        eq(workflowStepExecution.executionId, execution.id),
        eq(workflowStepExecution.stepType, "send_email"),
        eq(workflowStepExecution.status, "completed"),
        sendStepFilter
      )
    )
    .orderBy(sql`${workflowStepExecution.completedAt} DESC`)
    .limit(1);

  const lastEmailStep = previousStepExecs[0];
  const messageId = lastEmailStep?.result
    ? (lastEmailStep.result as Record<string, unknown>).messageId
    : undefined;

  // Schedule timeout
  const schedulerName = await scheduleWaitTimeout({
    executionId: execution.id,
    stepId: step.id,
    organizationId,
    timeoutSeconds,
  });

  // Update execution to waiting state
  // We use 'email_engagement' as a special event name prefix
  await db
    .update(workflowExecution)
    .set({
      status: "waiting",
      waitingForEvent: `email_engagement:${messageId || "unknown"}`,
      waitTimeoutAt: timeoutAt,
      waitTimeoutSchedulerName: schedulerName,
      updatedAt: new Date(),
    })
    .where(eq(workflowExecution.id, execution.id));

  return { action: "wait" };
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBSCRIBE / UNSUBSCRIBE TOPIC
// ═══════════════════════════════════════════════════════════════════════════

export async function handleSubscribeTopic(
  config: Extract<WorkflowStepConfig, { type: "subscribe_topic" }>,
  contactRecord: typeof contact.$inferSelect
): Promise<{ action: "next"; data: Record<string, unknown> }> {
  // Upsert contact-topic subscription
  await db
    .insert(contactTopic)
    .values({
      contactId: contactRecord.id,
      topicId: config.topicId,
      status: "subscribed",
      subscribedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [contactTopic.contactId, contactTopic.topicId],
      set: {
        status: "subscribed",
        subscribedAt: new Date(),
        unsubscribedAt: null,
      },
    });

  return {
    action: "next",
    data: {
      topicId: config.topicId,
      channel: config.channel,
      action: "subscribed",
    },
  };
}

export async function handleUnsubscribeTopic(
  config: Extract<WorkflowStepConfig, { type: "unsubscribe_topic" }>,
  contactRecord: typeof contact.$inferSelect
): Promise<{ action: "next"; data: Record<string, unknown> }> {
  // Update subscription to unsubscribe
  await db
    .update(contactTopic)
    .set({
      status: "unsubscribed",
      unsubscribedAt: new Date(),
    })
    .where(
      and(
        eq(contactTopic.contactId, contactRecord.id),
        eq(contactTopic.topicId, config.topicId)
      )
    );

  return {
    action: "next",
    data: {
      topicId: config.topicId,
      channel: config.channel,
      action: "unsubscribed",
    },
  };
}
