import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  sql,
} from "drizzle-orm";
import { db, escapeIlike } from "../index";
import { contact } from "../schema/contacts";
import { contactEvent } from "../schema/events";
import { workflow, workflowExecution } from "../schema/workflows";

type DrizzleTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbClient = typeof db | DrizzleTransaction;

export type ContactEventRecord = typeof contactEvent.$inferSelect;
export type WorkflowExecutionRecord = typeof workflowExecution.$inferSelect;

export type EventFilters = {
  eventName?: string;
  search?: string;
  contactEmail?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

const EVENT_CONTACT_FIELDS = {
  id: contactEvent.id,
  eventName: contactEvent.eventName,
  eventData: contactEvent.eventData,
  createdAt: contactEvent.createdAt,
  contactId: contactEvent.contactId,
  contactEmail: contact.email,
  contactFirstName: contact.firstName,
  contactLastName: contact.lastName,
};

function buildEventConditions(organizationId: string, filters: EventFilters) {
  const { search, eventName, contactEmail, dateFrom, dateTo } = filters;
  const conditions: ReturnType<typeof eq>[] = [
    eq(contactEvent.organizationId, organizationId),
  ];

  if (eventName) {
    conditions.push(eq(contactEvent.eventName, eventName));
  }
  if (dateFrom) {
    conditions.push(gte(contactEvent.createdAt, dateFrom) as never);
  }
  if (dateTo) {
    conditions.push(lte(contactEvent.createdAt, dateTo) as never);
  }
  if (search) {
    const pattern = `%${escapeIlike(search)}%`;
    conditions.push(
      sql`(
        "contact_event"."event_name" ILIKE ${pattern}
        OR "contact_event"."event_data"::text ILIKE ${pattern}
        OR "contact"."email" ILIKE ${pattern}
        OR COALESCE("contact"."first_name", '') ILIKE ${pattern}
        OR COALESCE("contact"."last_name", '') ILIKE ${pattern}
      )` as never
    );
  }
  if (contactEmail) {
    conditions.push(
      ilike(contact.email, `%${escapeIlike(contactEmail)}%`) as never
    );
  }

  return conditions;
}

// ─── Web Dashboard Queries ────────────────────────────────────────────────────

export async function listContactEvents(
  organizationId: string,
  filters: EventFilters,
  pagination: { page: number; pageSize: number },
  dbClient: DbClient = db
) {
  const { page, pageSize } = pagination;
  const offset = (page - 1) * pageSize;
  const conditions = buildEventConditions(organizationId, filters);
  const joinOn = and(
    eq(contactEvent.contactId, contact.id),
    eq(contact.organizationId, organizationId)
  );

  const [totalResult] = await dbClient
    .select({ count: count() })
    .from(contactEvent)
    .innerJoin(contact, joinOn)
    .where(and(...conditions));

  const total = totalResult?.count ?? 0;

  const events = await dbClient
    .select(EVENT_CONTACT_FIELDS)
    .from(contactEvent)
    .innerJoin(contact, joinOn)
    .where(and(...conditions))
    .orderBy(desc(contactEvent.createdAt))
    .limit(pageSize)
    .offset(offset);

  return { events, total };
}

export async function getContactEvent(
  eventId: string,
  organizationId: string,
  dbClient: DbClient = db
) {
  const [event] = await dbClient
    .select(EVENT_CONTACT_FIELDS)
    .from(contactEvent)
    .innerJoin(
      contact,
      and(
        eq(contactEvent.contactId, contact.id),
        eq(contact.organizationId, organizationId)
      )
    )
    .where(
      and(
        eq(contactEvent.id, eventId),
        eq(contactEvent.organizationId, organizationId)
      )
    )
    .limit(1);

  return event ?? null;
}

export async function listDistinctEventNames(
  organizationId: string,
  dbClient: DbClient = db
): Promise<string[]> {
  const results = await dbClient
    .selectDistinct({ eventName: contactEvent.eventName })
    .from(contactEvent)
    .where(eq(contactEvent.organizationId, organizationId))
    .orderBy(contactEvent.eventName);

  return results.map((r) => r.eventName);
}

export async function exportContactEvents(
  organizationId: string,
  filters: EventFilters,
  limit: number,
  dbClient: DbClient = db
) {
  const conditions = buildEventConditions(organizationId, filters);

  return dbClient
    .select(EVENT_CONTACT_FIELDS)
    .from(contactEvent)
    .innerJoin(
      contact,
      and(
        eq(contactEvent.contactId, contact.id),
        eq(contact.organizationId, organizationId)
      )
    )
    .where(and(...conditions))
    .orderBy(desc(contactEvent.createdAt))
    .limit(limit);
}

// ─── Analytics Queries ────────────────────────────────────────────────────────

export async function countAllContactEvents(
  organizationId: string,
  dbClient: DbClient = db
): Promise<number> {
  const [result] = await dbClient
    .select({ count: count() })
    .from(contactEvent)
    .where(eq(contactEvent.organizationId, organizationId));

  return result?.count ?? 0;
}

// tz must be pre-validated via Intl.DateTimeFormat before passing.
function makeLocalTs(tz: string) {
  const tzLiteral = sql.raw(`'${tz}'`);
  return sql`${contactEvent.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${tzLiteral}`;
}

export async function countContactEventsInPeriod(
  organizationId: string,
  startDateStr: string,
  tz: string,
  dbClient: DbClient = db
): Promise<number> {
  const createdAtLocal = makeLocalTs(tz);
  const [result] = await dbClient
    .select({ count: count() })
    .from(contactEvent)
    .where(
      and(
        eq(contactEvent.organizationId, organizationId),
        sql`${contactEvent.createdAt} >= ${startDateStr}::date - interval '1 day'`,
        sql`DATE(${createdAtLocal}) >= ${startDateStr}::date`
      )
    );

  return result?.count ?? 0;
}

export async function countActiveContactsWithEvents(
  organizationId: string,
  startDateStr: string,
  tz: string,
  dbClient: DbClient = db
): Promise<number> {
  const createdAtLocal = makeLocalTs(tz);
  const [result] = await dbClient
    .select({
      count: sql<number>`COUNT(DISTINCT ${contactEvent.contactId})`,
    })
    .from(contactEvent)
    .where(
      and(
        eq(contactEvent.organizationId, organizationId),
        sql`${contactEvent.createdAt} >= ${startDateStr}::date - interval '1 day'`,
        sql`DATE(${createdAtLocal}) >= ${startDateStr}::date`
      )
    );

  return Number(result?.count ?? 0);
}

export async function getDailyContactEventCounts(
  organizationId: string,
  startDateStr: string,
  tz: string,
  dbClient: DbClient = db
): Promise<{ date: string; count: number }[]> {
  const createdAtLocal = makeLocalTs(tz);
  const rows = await dbClient
    .select({
      date: sql<string>`DATE(${createdAtLocal})::text`,
      count: count(),
    })
    .from(contactEvent)
    .where(
      and(
        eq(contactEvent.organizationId, organizationId),
        sql`${contactEvent.createdAt} >= ${startDateStr}::date - interval '1 day'`,
        sql`DATE(${createdAtLocal}) >= ${startDateStr}::date`
      )
    )
    .groupBy(sql`DATE(${createdAtLocal})`)
    .orderBy(sql`DATE(${createdAtLocal})`);

  return rows.map((r) => ({
    date: String(r.date).split("T")[0],
    count: Number(r.count),
  }));
}

export async function getTopContactEventNames(
  organizationId: string,
  startDateStr: string,
  tz: string,
  limit: number,
  dbClient: DbClient = db
): Promise<{ name: string; count: number }[]> {
  const createdAtLocal = makeLocalTs(tz);
  const rows = await dbClient
    .select({
      name: contactEvent.eventName,
      count: count(),
    })
    .from(contactEvent)
    .where(
      and(
        eq(contactEvent.organizationId, organizationId),
        sql`${contactEvent.createdAt} >= ${startDateStr}::date - interval '1 day'`,
        sql`DATE(${createdAtLocal}) >= ${startDateStr}::date`
      )
    )
    .groupBy(contactEvent.eventName)
    .orderBy(desc(count()))
    .limit(limit);

  return rows.map((r) => ({ name: r.name, count: Number(r.count) }));
}

// ─── Event Ingestion (API Route) ──────────────────────────────────────────────

export async function findContactByEmailInOrg(
  email: string,
  organizationId: string,
  dbClient: DbClient = db
): Promise<typeof contact.$inferSelect | null> {
  const [result] = await dbClient
    .select()
    .from(contact)
    .where(
      and(eq(contact.email, email), eq(contact.organizationId, organizationId))
    )
    .limit(1);

  return result ?? null;
}

export async function findContactByExternalIdInOrg(
  externalId: string,
  organizationId: string,
  dbClient: DbClient = db
): Promise<typeof contact.$inferSelect | null> {
  const [result] = await dbClient
    .select()
    .from(contact)
    .where(
      and(
        eq(contact.externalId, externalId),
        eq(contact.organizationId, organizationId)
      )
    )
    .limit(1);

  return result ?? null;
}

export type InsertContactEventData = typeof contactEvent.$inferInsert;

export async function insertContactEvent(
  values: InsertContactEventData,
  dbClient: DbClient = db
): Promise<void> {
  await dbClient.insert(contactEvent).values(values);
}

export async function insertContactEventsBatch(
  values: InsertContactEventData[],
  dbClient: DbClient = db
): Promise<void> {
  if (values.length === 0) return;
  await dbClient.insert(contactEvent).values(values);
}

export async function findEventWorkflows(
  organizationId: string,
  eventName: string,
  dbClient: DbClient = db
): Promise<(typeof workflow.$inferSelect)[]> {
  return dbClient
    .select()
    .from(workflow)
    .where(
      and(
        eq(workflow.organizationId, organizationId),
        eq(workflow.status, "enabled"),
        eq(workflow.triggerType, "event"),
        sql`${workflow.triggerConfig}->>'eventName' = ${eventName}`
      )
    );
}

export async function findEventWorkflowsBatch(
  organizationId: string,
  eventNames: string[],
  dbClient: DbClient = db
): Promise<{ id: string; triggerConfig: unknown }[]> {
  if (eventNames.length === 0) return [];
  return dbClient
    .select({ id: workflow.id, triggerConfig: workflow.triggerConfig })
    .from(workflow)
    .where(
      and(
        eq(workflow.organizationId, organizationId),
        eq(workflow.status, "enabled"),
        eq(workflow.triggerType, "event"),
        inArray(sql`${workflow.triggerConfig}->>'eventName'`, eventNames)
      )
    );
}

export async function findWaitingExecutions(
  organizationId: string,
  contactId: string,
  eventName: string,
  dbClient: DbClient = db
): Promise<(typeof workflowExecution.$inferSelect)[]> {
  return dbClient
    .select()
    .from(workflowExecution)
    .where(
      and(
        eq(workflowExecution.organizationId, organizationId),
        eq(workflowExecution.contactId, contactId),
        eq(workflowExecution.status, "waiting"),
        eq(workflowExecution.waitingForEvent, eventName)
      )
    );
}

export async function findWaitingExecutionsBatch(
  organizationId: string,
  contactIds: string[],
  eventNames: string[],
  dbClient: DbClient = db
): Promise<(typeof workflowExecution.$inferSelect)[]> {
  if (contactIds.length === 0 || eventNames.length === 0) return [];
  return dbClient
    .select()
    .from(workflowExecution)
    .where(
      and(
        eq(workflowExecution.organizationId, organizationId),
        inArray(workflowExecution.contactId, contactIds),
        eq(workflowExecution.status, "waiting"),
        inArray(workflowExecution.waitingForEvent, eventNames)
      )
    );
}

export async function touchContactLastActivity(
  contactId: string,
  organizationId: string,
  dbClient: DbClient = db
): Promise<void> {
  await dbClient
    .update(contact)
    .set({ lastActivityAt: new Date() })
    .where(
      and(eq(contact.id, contactId), eq(contact.organizationId, organizationId))
    );
}

export async function findContactsByIdsInOrg(
  organizationId: string,
  ids: string[],
  dbClient: DbClient = db
): Promise<(typeof contact.$inferSelect)[]> {
  if (ids.length === 0) return [];
  return dbClient
    .select()
    .from(contact)
    .where(
      and(inArray(contact.id, ids), eq(contact.organizationId, organizationId))
    );
}

export async function findContactsByExternalIdsInOrg(
  organizationId: string,
  externalIds: string[],
  dbClient: DbClient = db
): Promise<(typeof contact.$inferSelect)[]> {
  if (externalIds.length === 0) return [];
  return dbClient
    .select()
    .from(contact)
    .where(
      and(
        inArray(contact.externalId, externalIds),
        eq(contact.organizationId, organizationId)
      )
    );
}

export async function findContactsByEmailsInOrg(
  organizationId: string,
  emails: string[],
  dbClient: DbClient = db
): Promise<(typeof contact.$inferSelect)[]> {
  if (emails.length === 0) return [];
  return dbClient
    .select()
    .from(contact)
    .where(
      and(
        inArray(contact.email, emails),
        eq(contact.organizationId, organizationId)
      )
    );
}
