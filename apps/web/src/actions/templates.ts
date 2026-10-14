"use server";

import { toPlainText } from "@react-email/render";
import { auth } from "@wraps/auth";
import type { EmailType } from "@wraps/db";
import { auditLog, awsAccount, db, template } from "@wraps/db";
import {
  deleteSESTemplate,
  generateSESTemplateName,
  testRenderSESTemplate,
  toSesVariableName,
  transformVariablesForSes,
  upsertSESTemplate,
} from "@wraps/email";
import {
  extractCanonicalVars,
  normalizePlainTextForSes,
} from "@wraps/template-render";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { trackTemplatePublished } from "@/lib/activation-tracking";
import { auditLogEntry, getAuditContext } from "@/lib/audit";
import { getOrAssumeRole } from "@/lib/aws/credential-cache";
import { orgAction } from "./shared/org-action";

export type PublishTemplateResult =
  | { success: true; sesTemplateName: string }
  | { success: false; error: string };

// Bulk action result types
export type BulkDeleteResult =
  | { success: true; count: number }
  | { success: false; error: string };

export type BulkUpdateTypeResult =
  | { success: true; count: number }
  | { success: false; error: string };

export type BulkUpdateStatusResult =
  | {
      success: true;
      updated: number;
      published: number;
      skipped: string[];
      errors: string[];
    }
  | { success: false; error: string };

/**
 * Revalidate templates page using the org slug
 */
function revalidateTemplates(orgSlug: string): void {
  revalidatePath(`/${orgSlug}/emails/templates`, "page");
}

/**
 * Publish a template to SES.
 *
 * This function handles:
 * 1. Transforming the template's compiled HTML variables to SES format
 * 2. Uploading to SES
 * 3. Updating the template record with sesTemplateName
 *
 * Can be called from:
 * - The publish API route (for manual publish from UI)
 * - The createBatchSend action (for auto-publish before sending)
 */
export const publishTemplateToSES = orgAction(
  {
    name: "publishTemplateToSES",
    resource: "templates",
    permission: ["write"],
    orgId: (_templateId: string, organizationId: string) => organizationId,
    onError: "Something went wrong. Please try again.",
  },
  async (
    ctx,
    templateId: string,
    organizationId: string
  ): Promise<PublishTemplateResult> => {
    // Fetch template
    const templateData = await db.query.template.findFirst({
      where: and(
        eq(template.id, templateId),
        eq(template.organizationId, organizationId)
      ),
    });

    if (!templateData) {
      return { success: false, error: "Template not found" };
    }

    // SMS templates don't need SES publishing
    if (templateData.channel === "sms") {
      const now = new Date();
      await db
        .update(template)
        .set({
          status: "PUBLISHED",
          publishedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(template.id, templateId),
            eq(template.organizationId, organizationId)
          )
        );
      return { success: true, sesTemplateName: "" };
    }

    // Validate subject is set
    if (!templateData.subject) {
      return {
        success: false,
        error:
          "Template subject is required for publishing. Please set a subject line.",
      };
    }

    // Get the organization's AWS account
    const customerAwsAccount = await db.query.awsAccount.findFirst({
      where: eq(awsAccount.organizationId, organizationId),
    });

    if (!customerAwsAccount) {
      return {
        success: false,
        error: "No AWS account connected. Please connect an AWS account first.",
      };
    }

    // Get credentials for the customer's AWS account
    const credentials = await getOrAssumeRole({
      roleArn: customerAwsAccount.roleArn,
      externalId: customerAwsAccount.externalId,
      region: customerAwsAccount.region,
    });

    // Templates compile to HTML on save (or on CLI push). Without that there
    // is nothing to upload — publishing an uncompiled template would ship an
    // empty body to SES.
    if (!templateData.compiledHtml) {
      return {
        success: false,
        error:
          "Template must be compiled before publishing. Open it in the editor and save first.",
      };
    }

    const rawHtml = templateData.compiledHtml;
    const rawText = templateData.compiledText ?? toPlainText(rawHtml);

    // Transform variables for SES compatibility
    // {{contact.email}} → {{contactEmail}}
    // {{contact.firstName|there}} → {{#if contactFirstName}}{{contactFirstName}}{{else}}there{{/if}}
    const sesHtml = transformVariablesForSes(rawHtml);
    // normalizePlainTextForSes: html-to-text uppercases heading content,
    // corrupting {{#if firstName}} into {{#IF FIRSTNAME}} — SES rejects the
    // text part at send time. Normalizing here also repairs templates whose
    // stored compiledText predates the fix.
    const sesText = transformVariablesForSes(
      normalizePlainTextForSes(rawText, rawHtml)
    );
    const sesSubject = transformVariablesForSes(templateData.subject);

    // Generate SES template name
    const sesTemplateName = generateSESTemplateName(
      templateData.id,
      templateData.name
    );

    // Smoke-check that SES can actually render this template before touching
    // the live one. SES's Handlebars dialect is not handlebars.js — a
    // template our renderer accepts can still hard-fail in SES at send time
    // (RenderingFailure event → silent non-delivery). TestRenderEmailTemplate
    // only renders by name, so publish to a probe name first; a failed
    // publish never overwrites the live template a broadcast may be using.
    // Pad every referenced variable with "" exactly like the batch sender
    // pads TemplateData: bare {{var}} resolves, {{#if}} treats "" as falsy.
    const renderProbeData: Record<string, string> = {};
    for (const rawVar of extractCanonicalVars(
      `${sesSubject}\n${sesHtml}\n${sesText}`
    )) {
      renderProbeData[toSesVariableName(rawVar)] = "";
    }
    const probeName =
      `wraps-probe-${templateData.id.replace(/[^a-zA-Z0-9-_]/g, "-")}`.substring(
        0,
        64
      );
    await upsertSESTemplate(credentials, customerAwsAccount.region, {
      templateName: probeName,
      subject: sesSubject,
      htmlPart: sesHtml,
      textPart: sesText,
    });
    const renderCheck = await testRenderSESTemplate(
      credentials,
      customerAwsAccount.region,
      { templateName: probeName, templateData: renderProbeData }
    );
    await deleteSESTemplate(
      credentials,
      customerAwsAccount.region,
      probeName
    ).catch(() => {}); // Best-effort cleanup; probe templates are inert

    if (renderCheck.status === "render-failed") {
      ctx.log.error(
        { templateId, reason: renderCheck.reason },
        "SES test render failed; publish blocked"
      );
      return {
        success: false,
        error: `SES cannot render this template: ${renderCheck.reason}. Fix the template syntax and publish again.`,
      };
    }
    if (renderCheck.status === "skipped") {
      ctx.log.warn(
        { templateId, reason: renderCheck.reason },
        "SES test render check skipped"
      );
    }

    // Clean up old SES template if name changed (e.g. after a rename)
    if (
      templateData.sesTemplateName &&
      templateData.sesTemplateName !== sesTemplateName
    ) {
      await deleteSESTemplate(
        credentials,
        customerAwsAccount.region,
        templateData.sesTemplateName
      ).catch(() => {}); // Best-effort cleanup
    }

    // Create or update SES template with transformed variables
    await upsertSESTemplate(credentials, customerAwsAccount.region, {
      templateName: sesTemplateName,
      subject: sesSubject,
      htmlPart: sesHtml,
      textPart: sesText,
    });

    // Update template in our database + audit log in one transaction
    const now = new Date();
    await ctx.audited(
      async (tx) => {
        await tx
          .update(template)
          .set({
            status: "PUBLISHED",
            sesTemplateName,
            publishedAt: now,
            compiledHtml: sesHtml, // Store SES-compatible HTML
            compiledText: sesText,
            updatedAt: now,
          })
          .where(
            and(
              eq(template.id, templateId),
              eq(template.organizationId, organizationId)
            )
          );
      },
      () => ({
        action: "template.published" as const,
        resource: "template",
        resourceId: templateId,
        metadata: {
          templateId,
          name: templateData.name,
          type: templateData.emailType,
        },
      })
    );

    ctx.log.info({ templateId, sesTemplateName }, "Template published to SES");

    // Track activation event (fire-and-forget)
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      if (session?.user?.email) {
        await trackTemplatePublished(session.user.email, organizationId, {
          templateName: templateData.name,
        });
      }
    } catch {
      // tracking should never fail the publish
    }

    return { success: true, sesTemplateName };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// BULK ACTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Bulk delete templates
 *
 * Also deletes from AWS SES for any templates that were published.
 */
export const bulkDeleteTemplates = orgAction(
  {
    name: "bulkDeleteTemplates",
    resource: "templates",
    permission: ["delete"],
    orgId: (organizationId: string, _templateIds: string[]) => organizationId,
    onError: "Failed to delete templates",
  },
  async (
    ctx,
    organizationId: string,
    templateIds: string[]
  ): Promise<BulkDeleteResult> => {
    if (templateIds.length === 0) {
      return { success: false, error: "No templates selected" };
    }

    // Fetch templates to get their SES template names
    const templates = await db.query.template.findMany({
      where: and(
        eq(template.organizationId, organizationId),
        inArray(template.id, templateIds)
      ),
      columns: {
        id: true,
        sesTemplateName: true,
      },
    });

    // Delete from SES for templates that were published
    const templatesWithSES = templates.filter((t) => t.sesTemplateName);
    if (templatesWithSES.length > 0) {
      // Get the organization's AWS account
      const customerAwsAccount = await db.query.awsAccount.findFirst({
        where: eq(awsAccount.organizationId, organizationId),
      });

      if (customerAwsAccount) {
        const credentials = await getOrAssumeRole({
          roleArn: customerAwsAccount.roleArn,
          externalId: customerAwsAccount.externalId,
          region: customerAwsAccount.region,
        });

        // Delete from SES (fire and settle - don't fail the whole operation if SES fails)
        await Promise.allSettled(
          templatesWithSES.map(async (t) => {
            try {
              await deleteSESTemplate(
                credentials,
                customerAwsAccount.region,
                t.sesTemplateName!
              );
              ctx.log.info(
                { templateId: t.id, sesTemplateName: t.sesTemplateName },
                "Deleted template from SES"
              );
            } catch (err) {
              ctx.log.warn(
                { err, templateId: t.id },
                "Failed to delete template from SES"
              );
            }
          })
        );
      }
    }

    // Delete templates from database + audit log in one transaction
    await ctx.audited(
      async (tx) => {
        await tx
          .delete(template)
          .where(
            and(
              eq(template.organizationId, organizationId),
              inArray(template.id, templateIds)
            )
          );
      },
      () => ({
        action: "template.deleted" as const,
        resource: "template",
        metadata: { count: templateIds.length, templateIds },
      })
    );

    // Revalidate
    revalidateTemplates(ctx.access.orgSlug);

    return { success: true, count: templateIds.length };
  }
);

/**
 * Bulk update template email type (marketing/transactional)
 */
export const bulkUpdateTemplateType = orgAction(
  {
    name: "bulkUpdateTemplateType",
    resource: "templates",
    permission: ["write"],
    orgId: (
      organizationId: string,
      _templateIds: string[],
      _emailType: EmailType
    ) => organizationId,
    onError: "Failed to update templates",
  },
  async (
    ctx,
    organizationId: string,
    templateIds: string[],
    emailType: EmailType
  ): Promise<BulkUpdateTypeResult> => {
    if (templateIds.length === 0) {
      return { success: false, error: "No templates selected" };
    }

    // Validate email type
    if (!["marketing", "transactional"].includes(emailType)) {
      return { success: false, error: "Invalid email type" };
    }

    // Update templates + audit log in one transaction
    await ctx.audited(
      async (tx) => {
        await tx
          .update(template)
          .set({
            emailType,
            lastEditedFrom: "dashboard",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(template.organizationId, organizationId),
              inArray(template.id, templateIds)
            )
          );
      },
      () => ({
        action: "template.type_updated" as const,
        resource: "template",
        metadata: { count: templateIds.length, newType: emailType },
      })
    );

    // Revalidate
    revalidateTemplates(ctx.access.orgSlug);

    return { success: true, count: templateIds.length };
  }
);

/**
 * Bulk update template status (DRAFT/PUBLISHED/ARCHIVED)
 *
 * When status = "PUBLISHED", templates are also published to AWS SES.
 * Templates without subjects are skipped for SES publishing.
 */
export const bulkUpdateTemplateStatus = orgAction(
  {
    name: "bulkUpdateTemplateStatus",
    resource: "templates",
    permission: ["write"],
    orgId: (
      organizationId: string,
      _templateIds: string[],
      _status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
    ) => organizationId,
    onError: "Failed to update templates",
  },
  async (
    ctx,
    organizationId: string,
    templateIds: string[],
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
  ): Promise<BulkUpdateStatusResult> => {
    if (templateIds.length === 0) {
      return {
        success: false,
        error: "No templates selected",
      };
    }

    // Validate status
    if (!["DRAFT", "PUBLISHED", "ARCHIVED"].includes(status)) {
      return { success: false, error: "Invalid status" };
    }

    // For DRAFT or ARCHIVED, just update the status + audit in one transaction
    if (status !== "PUBLISHED") {
      const auditCtx = await getAuditContext();
      await db.transaction(async (tx) => {
        await tx
          .update(template)
          .set({
            status,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(template.organizationId, organizationId),
              inArray(template.id, templateIds)
            )
          );

        await tx.insert(auditLog).values(
          auditLogEntry(auditCtx, {
            organizationId,
            actorId: ctx.access.userId,
            actorEmail: ctx.access.userEmail,
            action: "template.status_updated",
            resource: "template",
            metadata: { count: templateIds.length, newStatus: status },
          })
        );
      });

      revalidateTemplates(ctx.access.orgSlug);

      return {
        success: true,
        updated: templateIds.length,
        published: 0,
        skipped: [],
        errors: [],
      };
    }

    // For PUBLISHED, we need to publish each template to SES
    // Fetch all templates to check for subjects
    const templates = await db.query.template.findMany({
      where: and(
        eq(template.organizationId, organizationId),
        inArray(template.id, templateIds)
      ),
    });

    // Separate templates with and without subjects
    const templatesWithSubject = templates.filter((t) => !!t.subject);
    const templatesWithoutSubject = templates.filter((t) => !t.subject);
    const skipped = templatesWithoutSubject.map((t) => t.name);

    // Update status to PUBLISHED for templates without subjects (they still get the status)
    if (templatesWithoutSubject.length > 0) {
      await db
        .update(template)
        .set({
          status: "PUBLISHED",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(template.organizationId, organizationId),
            inArray(
              template.id,
              templatesWithoutSubject.map((t) => t.id)
            )
          )
        );
    }

    // Publish templates with subjects to SES
    const publishResults = await Promise.allSettled(
      templatesWithSubject.map((t) =>
        publishTemplateToSES(t.id, organizationId)
      )
    );

    // Collect results
    const errors: string[] = [];
    let publishedCount = 0;

    for (let i = 0; i < publishResults.length; i++) {
      const result = publishResults[i];
      const templateName = templatesWithSubject[i].name;

      if (result.status === "rejected") {
        errors.push(templateName);
      } else if (result.value.success) {
        publishedCount++;
      } else {
        errors.push(templateName);
      }
    }

    // Write audit log for the overall bulk status update
    const auditCtx = await getAuditContext();
    await db.insert(auditLog).values(
      auditLogEntry(auditCtx, {
        organizationId,
        actorId: ctx.access.userId,
        actorEmail: ctx.access.userEmail,
        action: "template.status_updated",
        resource: "template",
        metadata: { count: templates.length, newStatus: status },
      })
    );

    revalidateTemplates(ctx.access.orgSlug);

    return {
      success: true,
      updated: templates.length,
      published: publishedCount,
      skipped,
      errors,
    };
  }
);
