import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../index";
import {
  countActiveContactsWithEvents,
  countContactEventsInPeriod,
  getDailyContactEventCounts,
  getTopContactEventNames,
} from "../repositories/events";
import { contact, contactEvent, organization } from "../schema";

// Boundary fixture: four events straddling the "2026-01-15" start date in
// three timezones (America/New_York = UTC-5 in January, UTC itself, and
// Pacific/Kiritimati = UTC+14 year-round, no DST).
//
// - contactA / eventA: 2026-01-15T12:00:00Z -> Jan 15 in NY, Jan 15 in UTC, Jan 16 in Kiritimati
// - contactB / eventB: 2026-01-15T03:00:00Z -> Jan 14 in NY, Jan 15 in UTC, Jan 15 in Kiritimati
// - contactC / eventC: 2026-01-14T00:30:00Z -> Jan 13 in NY, Jan 14 in UTC, Jan 14 in Kiritimati
// - contactD / eventD: 2026-01-14T12:00:00Z -> Jan 14 in NY, Jan 14 in UTC, Jan 15 in Kiritimati
//
// eventD is the case that only a timezone AHEAD of UTC can pull into the
// window: its raw (UTC) created_at is Jan 14, so the sargable pre-filter
// `created_at >= startDate - interval '1 day'` (i.e. >= Jan 14 00:00 UTC)
// must keep it, or the exact local-date predicate never gets a chance to
// include it. Every other event here sits at or behind UTC, where the
// margin is never load-bearing -- that is exactly why eventD exists.
//
// With startDateStr = "2026-01-15":
// - NY:         only eventA's local date (Jan 15) is >= startDate -> 1 event, 1 contact
//               (eventD is Jan 14 in NY, so it does not change this)
// - UTC:        eventA and eventB's UTC date (Jan 15) are >= startDate -> 2 events, 2 contacts
//               (eventD is Jan 14 in UTC, so it does not change this)
// - Kiritimati: eventA (Jan 16), eventB (Jan 15), and eventD (Jan 15) are
//               >= startDate -> 3 events, 3 contacts (A, B, D); eventC
//               (Jan 14) stays excluded.
//               Daily breakdown: Jan 15 -> eventB + eventD = 2, Jan 16 -> eventA = 1.
//               Event names: eventA + eventB are "signup" (2), eventD is
//               "purchase" (1) -> top names [{signup: 2}, {purchase: 1}].
const suffix = crypto.randomUUID().slice(0, 8);
const orgId = `repo-events-org-${suffix}`;

const contactA = {
  id: `repo-events-contact-a-${suffix}`,
  organizationId: orgId,
  email: "a@example.com",
};
const contactB = {
  id: `repo-events-contact-b-${suffix}`,
  organizationId: orgId,
  email: "b@example.com",
};
const contactC = {
  id: `repo-events-contact-c-${suffix}`,
  organizationId: orgId,
  email: "c@example.com",
};
const contactD = {
  id: `repo-events-contact-d-${suffix}`,
  organizationId: orgId,
  email: "d@example.com",
};

const eventA = {
  id: `repo-events-event-a-${suffix}`,
  contactId: contactA.id,
  organizationId: orgId,
  eventName: "signup",
  createdAt: new Date("2026-01-15T12:00:00Z"),
};
const eventB = {
  id: `repo-events-event-b-${suffix}`,
  contactId: contactB.id,
  organizationId: orgId,
  eventName: "signup",
  createdAt: new Date("2026-01-15T03:00:00Z"),
};
const eventC = {
  id: `repo-events-event-c-${suffix}`,
  contactId: contactC.id,
  organizationId: orgId,
  eventName: "login",
  createdAt: new Date("2026-01-14T00:30:00Z"),
};
const eventD = {
  id: `repo-events-event-d-${suffix}`,
  contactId: contactD.id,
  organizationId: orgId,
  eventName: "purchase",
  createdAt: new Date("2026-01-14T12:00:00Z"),
};

const startDateStr = "2026-01-15";

describe("Repository: contact-event analytics boundary", () => {
  beforeAll(async () => {
    await db
      .insert(organization)
      .values({
        id: orgId,
        name: "Events Repo Test Org",
        slug: `events-repo-test-${suffix}`,
        createdAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .insert(contact)
      .values([contactA, contactB, contactC, contactD])
      .onConflictDoNothing();

    await db.insert(contactEvent).values([eventA, eventB, eventC, eventD]);
  });

  afterAll(async () => {
    await db.delete(contactEvent).where(eq(contactEvent.organizationId, orgId));
    await db.delete(contact).where(eq(contact.organizationId, orgId));
    await db.delete(organization).where(eq(organization.id, orgId));
  });

  it("countContactEventsInPeriod: NY=1, UTC=2", async () => {
    const ny = await countContactEventsInPeriod(
      orgId,
      startDateStr,
      "America/New_York"
    );
    const utc = await countContactEventsInPeriod(orgId, startDateStr, "UTC");

    expect(ny).toBe(1);
    expect(utc).toBe(2);
  });

  it("countActiveContactsWithEvents: NY=1, UTC=2", async () => {
    const ny = await countActiveContactsWithEvents(
      orgId,
      startDateStr,
      "America/New_York"
    );
    const utc = await countActiveContactsWithEvents(orgId, startDateStr, "UTC");

    expect(ny).toBe(1);
    expect(utc).toBe(2);
  });

  it("getDailyContactEventCounts: NY=[{2026-01-15:1}], UTC=[{2026-01-15:2}], ascending", async () => {
    const ny = await getDailyContactEventCounts(
      orgId,
      startDateStr,
      "America/New_York"
    );
    const utc = await getDailyContactEventCounts(orgId, startDateStr, "UTC");

    expect(ny).toEqual([{ date: "2026-01-15", count: 1 }]);
    expect(utc).toEqual([{ date: "2026-01-15", count: 2 }]);
  });

  it("getTopContactEventNames: NY=[{signup:1}], UTC=[{signup:2}]", async () => {
    const ny = await getTopContactEventNames(
      orgId,
      startDateStr,
      "America/New_York",
      10
    );
    const utc = await getTopContactEventNames(orgId, startDateStr, "UTC", 10);

    expect(ny).toEqual([{ name: "signup", count: 1 }]);
    expect(utc).toEqual([{ name: "signup", count: 2 }]);
  });

  // Pacific/Kiritimati is UTC+14 year-round -- the extreme case the 1-day
  // margin exists to cover. eventD (raw created_at Jan 14 UTC) only enters
  // the window here because its LOCAL date is Jan 15; without the margin,
  // the sargable pre-filter drops it before the exact DATE(...) predicate
  // ever runs. See the fixture comment above for the by-hand arithmetic.
  it("countContactEventsInPeriod: Kiritimati (UTC+14)=3", async () => {
    const kiritimati = await countContactEventsInPeriod(
      orgId,
      startDateStr,
      "Pacific/Kiritimati"
    );

    expect(kiritimati).toBe(3);
  });

  it("countActiveContactsWithEvents: Kiritimati (UTC+14)=3", async () => {
    const kiritimati = await countActiveContactsWithEvents(
      orgId,
      startDateStr,
      "Pacific/Kiritimati"
    );

    expect(kiritimati).toBe(3);
  });

  it("getDailyContactEventCounts: Kiritimati (UTC+14)=[{2026-01-15:2},{2026-01-16:1}]", async () => {
    const kiritimati = await getDailyContactEventCounts(
      orgId,
      startDateStr,
      "Pacific/Kiritimati"
    );

    expect(kiritimati).toEqual([
      { date: "2026-01-15", count: 2 },
      { date: "2026-01-16", count: 1 },
    ]);
  });

  it("getTopContactEventNames: Kiritimati (UTC+14)=[{signup:2},{purchase:1}]", async () => {
    const kiritimati = await getTopContactEventNames(
      orgId,
      startDateStr,
      "Pacific/Kiritimati",
      10
    );

    expect(kiritimati).toEqual([
      { name: "signup", count: 2 },
      { name: "purchase", count: 1 },
    ]);
  });
});
