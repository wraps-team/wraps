/**
 * Automation Trigger Routes
 *
 * API endpoints for directly triggering automations.
 * Used for automations with triggerType "api" that are triggered
 * by external systems or customer code.
 */

import { automation, contact, db, eq } from "@wraps/db";
import { and, inArray } from "drizzle-orm";
import { t } from "elysia";

import { log } from "../../lib/logger";
import {
  type AuthContext,
  createAuthenticatedRoutes,
} from "../../middleware/auth";
import { rateLimitMiddleware } from "../../middleware/rate-limit";
import {
  enqueueAutomationStep,
  enqueueAutomationStepBatch,
  type AutomationJob,
} from "../../services/automation-queue";

// Common response schemas
const _errorResponse = t.Object({
  success: t.Literal(false),
  error: t.String({ description: "Error message" }),
});

// OpenAPI 3.0 compatible arbitrary properties object
const dataSchema = t.Optional(
  t.Object(
    {},
    {
      additionalProperties: true,
      description: "Data to pass to the automation",
    }
  )
);

export const automationsRoutes = createAuthenticatedRoutes("/v1/automations")
  .use(rateLimitMiddleware)

  /**
   * Trigger an automation via API
   *
   * POST /v1/automations/:automationId/trigger
   *
   * Triggers a specific automation for a contact. The automation must have
   * triggerType "api" and be enabled.
   */
  .post(
    "/:automationId/trigger",
    async (ctx) => {
      const { params, body } = ctx;
      const auth = (ctx as unknown as { auth: AuthContext }).auth;
      const { automationId } = params;
      const { contactId, contactEmail, data } = body;

      // Find the automation
      const [a] = await db
        .select()
        .from(automation)
        .where(
          and(
            eq(automation.id, automationId),
            eq(automation.organizationId, auth.organizationId)
          )
        )
        .limit(1);

      if (!a) {
        return {
          success: false,
          error: "Automation not found",
        };
      }

      // Check automation is enabled
      if (a.status !== "enabled") {
        return {
          success: false,
          error: "Automation is not enabled",
        };
      }

      // Check automation has api trigger type
      if (a.triggerType !== "api") {
        return {
          success: false,
          error: `Automation has trigger type "${a.triggerType}", expected "api"`,
        };
      }

      // Find the contact
      let contactRecord: typeof contact.$inferSelect | undefined;

      if (contactId) {
        const [c] = await db
          .select()
          .from(contact)
          .where(
            and(
              eq(contact.id, contactId),
              eq(contact.organizationId, auth.organizationId)
            )
          )
          .limit(1);
        contactRecord = c;
      } else if (contactEmail) {
        const [c] = await db
          .select()
          .from(contact)
          .where(
            and(
              eq(contact.email, contactEmail),
              eq(contact.organizationId, auth.organizationId)
            )
          )
          .limit(1);
        contactRecord = c;
      }

      if (!contactRecord) {
        return {
          success: false,
          error: "Contact not found",
        };
      }

      // Enqueue the automation trigger
      await enqueueAutomationStep({
        type: "trigger",
        workflowId: a.id,
        contactId: contactRecord.id,
        organizationId: auth.organizationId,
        eventData: data || {},
      });

      log.info("Automation API trigger", {
        automationId: a.id,
        contactId: contactRecord.id,
      });

      return {
        success: true,
        message: "Automation triggered successfully",
        automationId: a.id,
        automationName: a.name,
        contactId: contactRecord.id,
      };
    },
    {
      params: t.Object({
        automationId: t.String({
          description: "Automation ID to trigger",
          maxLength: 36,
        }),
      }),
      body: t.Object({
        contactId: t.Optional(
          t.String({ description: "Contact ID", maxLength: 36 })
        ),
        contactEmail: t.Optional(
          t.String({
            description: "Contact email (alternative to contactId)",
            maxLength: 255,
          })
        ),
        data: dataSchema,
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          message: t.Optional(t.String()),
          automationId: t.Optional(t.String()),
          automationName: t.Optional(t.String()),
          contactId: t.Optional(t.String()),
          error: t.Optional(t.String()),
        }),
      },
      detail: {
        summary: "Trigger automation",
        description:
          "Trigger a specific automation for a contact. The automation must have triggerType 'api' and be enabled.",
        tags: ["automations"],
      },
    }
  )

  /**
   * Batch trigger an automation for multiple contacts
   *
   * POST /v1/automations/:automationId/trigger/batch
   *
   * Triggers an automation for multiple contacts at once.
   */
  .post(
    "/:automationId/trigger/batch",
    async (ctx) => {
      const { params, body } = ctx;
      const auth = (ctx as unknown as { auth: AuthContext }).auth;
      const { automationId } = params;
      const { contacts, data } = body;

      // Find the automation
      const [a] = await db
        .select()
        .from(automation)
        .where(
          and(
            eq(automation.id, automationId),
            eq(automation.organizationId, auth.organizationId)
          )
        )
        .limit(1);

      if (!a) {
        return {
          success: false,
          error: "Automation not found",
        };
      }

      // Check automation is enabled
      if (a.status !== "enabled") {
        return {
          success: false,
          error: "Automation is not enabled",
        };
      }

      // Check automation has api trigger type
      if (a.triggerType !== "api") {
        return {
          success: false,
          error: `Automation has trigger type "${a.triggerType}", expected "api"`,
        };
      }

      const results = {
        triggered: 0,
        errors: [] as string[],
      };

      // Batch fetch all contacts in 2 queries (by ID and by email) instead of N queries
      const contactIds = contacts
        .filter((c) => c.contactId)
        .map((c) => c.contactId as string);
      const contactEmails = contacts
        .filter((c) => c.contactEmail && !c.contactId)
        .map((c) => c.contactEmail as string);

      // Fetch contacts by ID
      const contactsById = new Map<string, typeof contact.$inferSelect>();
      if (contactIds.length > 0) {
        const foundById = await db
          .select()
          .from(contact)
          .where(
            and(
              inArray(contact.id, contactIds),
              eq(contact.organizationId, auth.organizationId)
            )
          );
        for (const c of foundById) {
          contactsById.set(c.id, c);
        }
      }

      // Fetch contacts by email
      const contactsByEmail = new Map<string, typeof contact.$inferSelect>();
      if (contactEmails.length > 0) {
        const foundByEmail = await db
          .select()
          .from(contact)
          .where(
            and(
              inArray(contact.email, contactEmails),
              eq(contact.organizationId, auth.organizationId)
            )
          );
        for (const c of foundByEmail) {
          if (c.email) {
            contactsByEmail.set(c.email, c);
          }
        }
      }

      // Process each contact request and collect jobs for batch enqueue
      const jobs: AutomationJob[] = [];
      for (const c of contacts) {
        let contactRecord: typeof contact.$inferSelect | undefined;

        if (c.contactId) {
          contactRecord = contactsById.get(c.contactId);
        } else if (c.contactEmail) {
          contactRecord = contactsByEmail.get(c.contactEmail);
        }

        if (!contactRecord) {
          results.errors.push(
            `Contact not found: ${c.contactId || c.contactEmail}`
          );
          continue;
        }

        jobs.push({
          type: "trigger",
          workflowId: a.id,
          contactId: contactRecord.id,
          organizationId: auth.organizationId,
          eventData: { ...(data || {}), ...(c.data || {}) },
        });

        results.triggered++;
      }

      // Batch enqueue all trigger jobs
      await enqueueAutomationStepBatch(jobs);

      log.info("Automation API batch trigger", {
        automationId: a.id,
        triggered: results.triggered,
      });

      return {
        success: results.errors.length === 0,
        automationId: a.id,
        automationName: a.name,
        ...results,
      };
    },
    {
      params: t.Object({
        automationId: t.String({
          description: "Automation ID to trigger",
          maxLength: 36,
        }),
      }),
      body: t.Object({
        contacts: t.Array(
          t.Object({
            contactId: t.Optional(t.String({ maxLength: 36 })),
            contactEmail: t.Optional(t.String({ maxLength: 255 })),
            data: t.Optional(t.Object({}, { additionalProperties: true })),
          }),
          {
            description:
              "List of contacts to trigger the automation for",
          }
        ),
        data: t.Optional(
          t.Object(
            {},
            {
              additionalProperties: true,
              description:
                "Common data to pass to all automation triggers",
            }
          )
        ),
      }),
      response: {
        200: t.Object({
          success: t.Boolean(),
          automationId: t.Optional(t.String()),
          automationName: t.Optional(t.String()),
          triggered: t.Optional(
            t.Number({ description: "Number of contacts triggered" })
          ),
          errors: t.Optional(
            t.Array(t.String(), { description: "Error messages if any" })
          ),
          error: t.Optional(t.String()),
        }),
      },
      detail: {
        summary: "Batch trigger automation",
        description:
          "Trigger an automation for multiple contacts at once. Each contact can have its own data that gets merged with common data.",
        tags: ["automations"],
      },
    }
  );

// Backward-compat alias
/** @deprecated Use `automationsRoutes` instead */
export const workflowsRoutes = automationsRoutes;
