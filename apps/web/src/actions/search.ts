"use server";

import { auth } from "@wraps/auth";
import {
  batchSend,
  brandKit,
  contact,
  db,
  segment,
  template,
  topic,
  workflow,
} from "@wraps/db";
import { and, eq, ilike, or } from "drizzle-orm";
import { headers } from "next/headers";
import { createActionLogger, serializeError } from "@/lib/logger";
import { checkFeatureAccess } from "@/lib/plan-limits";

export type SearchEntityType =
  | "contact"
  | "template"
  | "broadcast"
  | "workflow"
  | "segment"
  | "topic"
  | "brandKit";

export type SearchResultItem = {
  id: string;
  type: SearchEntityType;
  title: string;
  subtitle: string | null;
  status: string | null;
  url: string;
};

export type UniversalSearchResult =
  | { success: true; results: Record<SearchEntityType, SearchResultItem[]> }
  | { success: false; error: string };

/**
 * Escape ILIKE special characters to prevent wildcard injection
 */
function escapeIlike(value: string): string {
  return value.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Verify user has access to organization (same pattern as contacts.ts)
 */
async function verifyOrgAccess(organizationId: string): Promise<{
  userId: string;
  orgSlug: string;
} | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return null;
  }

  const membership = await db.query.member.findFirst({
    where: (m, { and: a, eq: e }) =>
      a(e(m.organizationId, organizationId), e(m.userId, session.user.id)),
    with: {
      organization: {
        columns: { slug: true },
      },
    },
  });

  if (!membership?.organization.slug) {
    return null;
  }

  return {
    userId: session.user.id,
    orgSlug: membership.organization.slug,
  };
}

/**
 * Universal search across all Wraps entities
 */
export async function universalSearch(
  organizationId: string,
  query: string
): Promise<UniversalSearchResult> {
  const log = createActionLogger("universalSearch", {});

  try {
    const access = await verifyOrgAccess(organizationId);
    if (!access) {
      return { success: false, error: "Unauthorized" };
    }

    const { orgSlug } = access;
    const escaped = escapeIlike(query.trim());
    const pattern = `%${escaped}%`;

    // Check feature access for gated entities in parallel
    const [workflowAccess, segmentAccess, topicAccess] = await Promise.all([
      checkFeatureAccess(organizationId, "automations"),
      checkFeatureAccess(organizationId, "segments"),
      checkFeatureAccess(organizationId, "topics"),
    ]);

    // Build queries array - always include base entities, conditionally include gated ones
    const queries = await Promise.all([
      // Contacts - always available
      db
        .select({
          id: contact.id,
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
        })
        .from(contact)
        .where(
          and(
            eq(contact.organizationId, organizationId),
            or(
              ilike(contact.email, pattern),
              ilike(contact.firstName, pattern),
              ilike(contact.lastName, pattern)
            )
          )
        )
        .limit(5),

      // Templates - always available
      db
        .select({
          id: template.id,
          name: template.name,
          subject: template.subject,
          status: template.status,
        })
        .from(template)
        .where(
          and(
            eq(template.organizationId, organizationId),
            or(ilike(template.name, pattern), ilike(template.subject, pattern))
          )
        )
        .limit(5),

      // Broadcasts - always available
      db
        .select({
          id: batchSend.id,
          name: batchSend.name,
          channel: batchSend.channel,
          status: batchSend.status,
        })
        .from(batchSend)
        .where(
          and(
            eq(batchSend.organizationId, organizationId),
            ilike(batchSend.name, pattern)
          )
        )
        .limit(5),

      // Workflows - gated
      workflowAccess.allowed
        ? db
            .select({
              id: workflow.id,
              name: workflow.name,
              description: workflow.description,
              status: workflow.status,
            })
            .from(workflow)
            .where(
              and(
                eq(workflow.organizationId, organizationId),
                or(
                  ilike(workflow.name, pattern),
                  ilike(workflow.description, pattern)
                )
              )
            )
            .limit(5)
        : Promise.resolve([]),

      // Segments - gated
      segmentAccess.allowed
        ? db
            .select({
              id: segment.id,
              name: segment.name,
              description: segment.description,
              memberCount: segment.memberCount,
            })
            .from(segment)
            .where(
              and(
                eq(segment.organizationId, organizationId),
                or(
                  ilike(segment.name, pattern),
                  ilike(segment.description, pattern)
                )
              )
            )
            .limit(5)
        : Promise.resolve([]),

      // Topics - gated
      topicAccess.allowed
        ? db
            .select({
              id: topic.id,
              name: topic.name,
              description: topic.description,
            })
            .from(topic)
            .where(
              and(
                eq(topic.organizationId, organizationId),
                or(
                  ilike(topic.name, pattern),
                  ilike(topic.description, pattern)
                )
              )
            )
            .limit(5)
        : Promise.resolve([]),

      // Brand Kits - always available
      db
        .select({
          id: brandKit.id,
          name: brandKit.name,
          companyName: brandKit.companyName,
        })
        .from(brandKit)
        .where(
          and(
            eq(brandKit.organizationId, organizationId),
            or(
              ilike(brandKit.name, pattern),
              ilike(brandKit.companyName, pattern)
            )
          )
        )
        .limit(5),
    ]);

    const [
      contacts,
      templates,
      broadcasts,
      workflows,
      segments,
      topics,
      brandKits,
    ] = queries;

    const results: Record<SearchEntityType, SearchResultItem[]> = {
      contact: contacts.map((c) => ({
        id: c.id,
        type: "contact" as const,
        title:
          c.firstName || c.lastName
            ? [c.firstName, c.lastName].filter(Boolean).join(" ")
            : c.email || "Unknown",
        subtitle: c.firstName || c.lastName ? c.email : null,
        status: null,
        url: `/${orgSlug}/contacts?contactId=${c.id}`,
      })),
      template: templates.map((t) => ({
        id: t.id,
        type: "template" as const,
        title: t.name,
        subtitle: t.subject,
        status: t.status,
        url: `/${orgSlug}/emails/templates/${t.id}`,
      })),
      broadcast: broadcasts.map((b) => ({
        id: b.id,
        type: "broadcast" as const,
        title: b.name || "Untitled",
        subtitle: b.channel === "sms" ? "SMS" : "Email",
        status: b.status,
        url: `/${orgSlug}/emails/broadcasts/${b.id}`,
      })),
      workflow: workflows.map((w) => ({
        id: w.id,
        type: "workflow" as const,
        title: w.name,
        subtitle: w.description,
        status: w.status,
        url: `/${orgSlug}/automations/${w.id}`,
      })),
      segment: segments.map((s) => ({
        id: s.id,
        type: "segment" as const,
        title: s.name,
        subtitle: s.description || `${s.memberCount} members`,
        status: null,
        url: `/${orgSlug}/segments`,
      })),
      topic: topics.map((t) => ({
        id: t.id,
        type: "topic" as const,
        title: t.name,
        subtitle: t.description,
        status: null,
        url: `/${orgSlug}/topics`,
      })),
      brandKit: brandKits.map((b) => ({
        id: b.id,
        type: "brandKit" as const,
        title: b.name,
        subtitle: b.companyName,
        status: null,
        url: `/${orgSlug}/emails/brand-kits/${b.id}`,
      })),
    };

    return { success: true, results };
  } catch (error) {
    log.error({ err: serializeError(error) }, "Universal search failed");
    return { success: false, error: "Search failed" };
  }
}
