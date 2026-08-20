/**
 * Segment builder vocabulary and client-side validation.
 *
 * F1: the Status filter offered `pending_confirmation` (a topic-subscription
 * concept, never an email status) and omitted `suppressed`. It now speaks the
 * same five words as the contacts table.
 *
 * F2: `inList`/`notInList` were rendered as a single-select and passed
 * validation with a scalar, which then blew up in Postgres. Validation now
 * rejects a non-array before any server round-trip.
 *
 * F17: event filters had no `FILTER_FIELDS` entry, so no UI could emit them.
 */

import { describe, expect, it } from "vitest";
import { EMAIL_STATUS_LABELS, EMAIL_STATUSES } from "@/lib/contacts";
import {
  createEmptyCondition,
  EMAIL_STATUS_OPTIONS,
  FILTER_FIELDS,
  type FilterCondition,
  validateCondition,
} from "@/lib/segments";

function conditionOf(filters: FilterCondition["groups"][number]["filters"]) {
  return { logic: "AND", groups: [{ id: "g1", filters }] } as FilterCondition;
}

describe("status filter vocabulary", () => {
  it("offers exactly the email statuses the contacts table uses", () => {
    expect(EMAIL_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      ...EMAIL_STATUSES,
    ]);
    for (const option of EMAIL_STATUS_OPTIONS) {
      expect(option.label).toBe(EMAIL_STATUS_LABELS[option.value]);
    }
  });

  it("does not offer pending_confirmation, which is not an email status", () => {
    expect(EMAIL_STATUS_OPTIONS.map((o) => o.value)).not.toContain(
      "pending_confirmation"
    );
  });

  it("labels the status field as email status", () => {
    const field = FILTER_FIELDS.find((f) => f.id === "status");
    expect(field?.label).toBe("Email Status");
  });

  it("seeds a new segment with a status filter that can be evaluated", () => {
    expect(validateCondition(createEmptyCondition())).toBeNull();
  });
});

describe("list operators require a real list", () => {
  it("rejects a scalar for inList", () => {
    const error = validateCondition(
      conditionOf([
        { id: "f1", field: "status", operator: "inList", value: "active" },
      ])
    );
    expect(error).toMatch(/one or more/i);
  });

  it("rejects a scalar for notInList", () => {
    const error = validateCondition(
      conditionOf([
        { id: "f1", field: "status", operator: "notInList", value: "bounced" },
      ])
    );
    expect(error).toMatch(/one or more/i);
  });

  it("rejects an empty list", () => {
    const error = validateCondition(
      conditionOf([
        { id: "f1", field: "status", operator: "inList", value: [] },
      ])
    );
    expect(error).toMatch(/one or more/i);
  });

  it("accepts a populated list", () => {
    expect(
      validateCondition(
        conditionOf([
          {
            id: "f1",
            field: "status",
            operator: "inList",
            value: ["bounced", "complained"],
          },
        ])
      )
    ).toBeNull();
  });
});

describe("event filters are reachable", () => {
  const eventField = FILTER_FIELDS.find((f) => f.id === "event");

  it("exposes an event field with the three event operators", () => {
    expect(eventField?.type).toBe("event");
    expect(eventField?.operators).toEqual([
      "triggered",
      "notTriggered",
      "triggeredWithin",
    ]);
  });

  it("accepts a triggered filter with no value", () => {
    expect(
      validateCondition(
        conditionOf([
          { id: "f1", field: "event.course_download", operator: "triggered" },
        ])
      )
    ).toBeNull();
  });

  it("requires an event name", () => {
    const error = validateCondition(
      conditionOf([{ id: "f1", field: "event.", operator: "triggered" }])
    );
    expect(error).toMatch(/event name/i);
  });

  it("still requires a duration for triggeredWithin", () => {
    expect(
      validateCondition(
        conditionOf([
          {
            id: "f1",
            field: "event.course_download",
            operator: "triggeredWithin",
          },
        ])
      )
    ).not.toBeNull();
  });
});
