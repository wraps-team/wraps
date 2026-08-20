/**
 * Segment Filter SQL Builder Tests
 *
 * Tests for pure SQL builder functions that translate segment conditions
 * into Drizzle SQL fragments. Used by both the web app and batch sender.
 */

import type { FilterCondition, SegmentFilter } from "@wraps/db";
import { buildConditionSQL, buildFilterSQL } from "@wraps/db";
import { describe, expect, it } from "vitest";

// Helper to serialize drizzle SQL to string for assertions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pgConfig: any = {
  escapeName: (name: string) => `"${name}"`,
  escapeParam: (num: number, _value: unknown) => `$${num}`,
  escapeString: (str: string) => `'${str.replace(/'/g, "''")}'`,
};

function toSQL(sqlObj: ReturnType<typeof buildConditionSQL>) {
  if (!sqlObj) return null;
  return sqlObj.toQuery(pgConfig);
}

describe("buildConditionSQL", () => {
  it("combines filters across groups with AND logic", () => {
    const condition: FilterCondition = {
      logic: "AND",
      groups: [
        {
          filters: [{ field: "emailsSent", operator: "greaterThan", value: 5 }],
        },
        {
          filters: [{ field: "status", operator: "equals", value: "active" }],
        },
      ],
    };

    const result = buildConditionSQL(condition);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query).not.toBeNull();
    // Should contain both conditions joined by AND
    expect(query!.sql).toContain('"emails_sent"');
    expect(query!.sql).toContain('"email_status"');
  });

  it("combines filters across groups with OR logic", () => {
    const condition: FilterCondition = {
      logic: "OR",
      groups: [
        {
          filters: [{ field: "emailsSent", operator: "greaterThan", value: 5 }],
        },
        {
          filters: [{ field: "status", operator: "equals", value: "active" }],
        },
      ],
    };

    const result = buildConditionSQL(condition);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query).not.toBeNull();
    // Should contain both conditions
    expect(query!.sql).toContain('"emails_sent"');
    expect(query!.sql).toContain('"email_status"');
    // OR logic should produce OR between groups (not just AND)
    expect(query!.sql).toContain(" or ");
  });

  it("returns null for empty condition", () => {
    const condition: FilterCondition = {
      logic: "AND",
      groups: [],
    };

    const result = buildConditionSQL(condition);
    expect(result).toBeNull();
  });

  it("returns null for groups with no valid filters", () => {
    const condition: FilterCondition = {
      logic: "AND",
      groups: [
        {
          filters: [
            { field: "unknownField", operator: "equals", value: "test" },
          ],
        },
      ],
    };

    const result = buildConditionSQL(condition);
    expect(result).toBeNull();
  });
});

describe("buildFilterSQL", () => {
  it("handles standard column equals operator", () => {
    const filter: SegmentFilter = {
      field: "status",
      operator: "equals",
      value: "active",
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain('"email_status"');
    expect(query!.params).toContain("active");
  });

  it("handles contains operator with ILIKE", () => {
    const filter: SegmentFilter = {
      field: "email",
      operator: "contains",
      value: "gmail",
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain('"email"');
    expect(query!.sql).toContain("ILIKE");
    expect(query!.params).toContain("%gmail%");
  });

  it("handles greaterThan operator", () => {
    const filter: SegmentFilter = {
      field: "emailsSent",
      operator: "greaterThan",
      value: 10,
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain('"emails_sent"');
    expect(query!.sql).toContain(">");
  });

  it("handles custom properties with dot notation", () => {
    const filter: SegmentFilter = {
      field: "properties.plan",
      operator: "equals",
      value: "pro",
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("properties");
    expect(query!.params).toContain("pro");
  });

  it("handles topic hasTopic filter", () => {
    const filter: SegmentFilter = {
      field: "topics",
      operator: "hasTopic",
      value: "topic-123",
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("EXISTS");
    expect(query!.sql).toContain("contact_topic");
    expect(query!.params).toContain("topic-123");
  });

  it("handles topic notHasTopic filter", () => {
    const filter: SegmentFilter = {
      field: "topics",
      operator: "notHasTopic",
      value: "topic-456",
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("NOT EXISTS");
    expect(query!.sql).toContain("contact_topic");
    expect(query!.params).toContain("topic-456");
  });

  it("handles within time-based operator with days", () => {
    const filter: SegmentFilter = {
      field: "lastActivityAt",
      operator: "within",
      value: 30,
      unit: "days",
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain('"last_activity_at"');
    expect(query!.sql).toContain("NOW()");
    expect(query!.sql).toContain("INTERVAL");
  });

  it("handles within time-based operator with hours", () => {
    const filter: SegmentFilter = {
      field: "lastEmailSentAt",
      operator: "within",
      value: 24,
      unit: "hours",
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("INTERVAL");
    expect(query!.params).toContain("24 hours");
  });

  it("handles inList operator", () => {
    const filter: SegmentFilter = {
      field: "status",
      operator: "inList",
      value: ["active", "bounced"],
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("ANY");
  });

  it("handles notInList operator", () => {
    const filter: SegmentFilter = {
      field: "status",
      operator: "notInList",
      value: ["bounced", "complained"],
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("ALL");
  });

  it("handles empty inList as FALSE", () => {
    const filter: SegmentFilter = {
      field: "status",
      operator: "inList",
      value: [],
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("FALSE");
  });

  it("handles exists/notExists operators", () => {
    const existsFilter: SegmentFilter = {
      field: "lastActivityAt",
      operator: "exists",
    };
    const notExistsFilter: SegmentFilter = {
      field: "lastActivityAt",
      operator: "notExists",
    };

    const existsResult = buildFilterSQL(existsFilter);
    const notExistsResult = buildFilterSQL(notExistsFilter);

    expect(existsResult).not.toBeNull();
    expect(notExistsResult).not.toBeNull();

    expect(toSQL(existsResult)!.sql).toContain("IS NOT NULL");
    expect(toSQL(notExistsResult)!.sql).toContain("IS NULL");
  });

  it("handles properties exists/notExists", () => {
    const filter: SegmentFilter = {
      field: "properties.plan",
      operator: "exists",
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("properties");
    expect(query!.sql).toContain("?");
  });

  it("returns null for unknown field", () => {
    const filter: SegmentFilter = {
      field: "nonexistentField",
      operator: "equals",
      value: "test",
    };

    const result = buildFilterSQL(filter);
    expect(result).toBeNull();
  });
});

describe("buildFilterSQL - event operators", () => {
  it("handles triggered operator with EXISTS subquery on contact_event", () => {
    const filter: SegmentFilter = {
      field: "purchase_made",
      operator: "triggered",
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("EXISTS");
    expect(query!.sql).toContain("contact_event");
    expect(query!.sql).toContain("event_name");
    expect(query!.params).toContain("purchase_made");
  });

  it("handles triggeredWithin operator with time-bounded EXISTS", () => {
    const filter: SegmentFilter = {
      field: "email_opened",
      operator: "triggeredWithin",
      value: 7,
      unit: "days",
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("EXISTS");
    expect(query!.sql).toContain("contact_event");
    expect(query!.sql).toContain("event_name");
    expect(query!.sql).toContain("created_at");
    expect(query!.sql).toContain("INTERVAL");
    expect(query!.params).toContain("email_opened");
    expect(query!.params).toContain("7 days");
  });

  it("handles triggeredWithin with hours unit", () => {
    const filter: SegmentFilter = {
      field: "page_viewed",
      operator: "triggeredWithin",
      value: 24,
      unit: "hours",
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.params).toContain("24 hours");
  });

  it("handles triggeredWithin with minutes unit", () => {
    const filter: SegmentFilter = {
      field: "button_clicked",
      operator: "triggeredWithin",
      value: 30,
      unit: "minutes",
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.params).toContain("30 minutes");
  });

  it("handles triggeredWithin defaults to days when unit is missing", () => {
    const filter: SegmentFilter = {
      field: "form_submitted",
      operator: "triggeredWithin",
      value: 14,
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.params).toContain("14 days");
  });

  it("handles notTriggered operator with NOT EXISTS subquery", () => {
    const filter: SegmentFilter = {
      field: "cart_abandoned",
      operator: "notTriggered",
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("NOT EXISTS");
    expect(query!.sql).toContain("contact_event");
    expect(query!.sql).toContain("event_name");
    expect(query!.params).toContain("cart_abandoned");
  });
});

describe("buildFilterSQL - property startsWith/endsWith", () => {
  it("handles startsWith on property fields", () => {
    const filter: SegmentFilter = {
      field: "properties.company",
      operator: "startsWith",
      value: "Acme",
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("properties");
    expect(query!.sql).toContain("ILIKE");
    expect(query!.params).toContain("Acme%");
  });

  it("handles endsWith on property fields", () => {
    const filter: SegmentFilter = {
      field: "properties.email",
      operator: "endsWith",
      value: "@gmail.com",
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("properties");
    expect(query!.sql).toContain("ILIKE");
    expect(query!.params).toContain("%@gmail.com");
  });
});

describe("buildFilterSQL - property numeric comparisons", () => {
  it("handles greaterThan on property fields with numeric cast", () => {
    const filter: SegmentFilter = {
      field: "properties.score",
      operator: "greaterThan",
      value: 80,
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("properties");
    expect(query!.sql).toContain("::numeric");
    expect(query!.sql).toContain(">");
  });

  it("handles lessThan on property fields with numeric cast", () => {
    const filter: SegmentFilter = {
      field: "properties.score",
      operator: "lessThan",
      value: 50,
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("::numeric");
    expect(query!.sql).toContain("<");
  });

  it("handles greaterThanOrEqual on property fields", () => {
    const filter: SegmentFilter = {
      field: "properties.age",
      operator: "greaterThanOrEqual",
      value: 18,
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("::numeric");
    expect(query!.sql).toContain(">=");
  });

  it("handles lessThanOrEqual on property fields", () => {
    const filter: SegmentFilter = {
      field: "properties.age",
      operator: "lessThanOrEqual",
      value: 65,
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("::numeric");
    expect(query!.sql).toContain("<=");
  });
});

describe("buildFilterSQL - property date comparisons", () => {
  it("casts to timestamptz when the comparison value is a bare date", () => {
    const filter: SegmentFilter = {
      field: "properties.createdAt",
      operator: "greaterThanOrEqual",
      value: "2026-07-01",
    };

    const query = toSQL(buildFilterSQL(filter));
    expect(query!.sql).toContain("::timestamptz");
    expect(query!.sql).not.toContain("::numeric");
    expect(query!.sql).toContain(">=");
  });

  it("anchors a bare date to UTC so the boundary is server-timezone independent", () => {
    const filter: SegmentFilter = {
      field: "properties.createdAt",
      operator: "lessThan",
      value: "2026-08-01",
    };

    const query = toSQL(buildFilterSQL(filter));
    expect(query!.params).toContain("2026-08-01T00:00:00Z");
  });

  it("passes a full ISO-8601 timestamp through unchanged", () => {
    const filter: SegmentFilter = {
      field: "properties.createdAt",
      operator: "greaterThan",
      value: "2026-07-31T04:58:18.232021+00:00",
    };

    const query = toSQL(buildFilterSQL(filter));
    expect(query!.sql).toContain("::timestamptz");
    expect(query!.params).toContain("2026-07-31T04:58:18.232021+00:00");
  });

  it("keeps the numeric path for numeric comparison values", () => {
    const filter: SegmentFilter = {
      field: "properties.score",
      operator: "greaterThan",
      value: 80,
    };

    const query = toSQL(buildFilterSQL(filter));
    expect(query!.sql).toContain("::numeric");
    expect(query!.sql).not.toContain("::timestamptz");
  });

  it("keeps the numeric path for non-date strings", () => {
    const filter: SegmentFilter = {
      field: "properties.score",
      operator: "greaterThan",
      value: "not-a-date",
    };

    const query = toSQL(buildFilterSQL(filter));
    expect(query!.sql).toContain("::numeric");
    expect(query!.sql).not.toContain("::timestamptz");
  });

  it("guards the cast so non-date property values cannot error the query", () => {
    const filter: SegmentFilter = {
      field: "properties.createdAt",
      operator: "greaterThan",
      value: "2026-07-01",
    };

    const query = toSQL(buildFilterSQL(filter));
    expect(query!.sql).toContain("CASE WHEN");
    expect(query!.params).toContain(
      String.raw`^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])`
    );
  });
});

describe("buildFilterSQL - partition buckets", () => {
  const bucketFilter = (value: unknown): SegmentFilter => ({
    field: "bucket",
    operator: "inBucket",
    value,
  });

  it("builds a modulo partition over a stable md5 hash of the contact id", () => {
    const query = toSQL(buildFilterSQL(bucketFilter({ buckets: 6, index: 1 })));
    expect(query!.sql).toContain("md5");
    expect(query!.sql).toContain('"contact"."id"');
    expect(query!.params).toContain(6);
  });

  it("normalises the modulo to a 1-based partition number", () => {
    const first = toSQL(buildFilterSQL(bucketFilter({ buckets: 6, index: 1 })));
    const last = toSQL(buildFilterSQL(bucketFilter({ buckets: 6, index: 6 })));

    // The expression shifts the 0-based modulo into 1..buckets, so the
    // comparison is against the partition number the user actually typed.
    expect(first!.sql).toContain("+ 1)");
    expect(first!.params).toContain(1);
    expect(last!.params).toContain(6);
  });

  it("emits a distinct predicate for every partition of a split", () => {
    const predicates = new Set(
      Array.from({ length: 6 }, (_, i) => {
        const q = toSQL(
          buildFilterSQL(bucketFilter({ buckets: 6, index: i + 1 }))
        );
        return JSON.stringify({ sql: q!.sql, params: q!.params });
      })
    );

    expect(predicates.size).toBe(6);
  });

  it.each([
    ["a partition number below the range", { buckets: 6, index: 0 }],
    ["a partition number above the range", { buckets: 6, index: 7 }],
    ["fewer than two partitions", { buckets: 1, index: 1 }],
    ["more partitions than the cap", { buckets: 1001, index: 1 }],
    ["a fractional partition count", { buckets: 6.5, index: 1 }],
    ["a fractional partition number", { buckets: 6, index: 1.5 }],
    ["a missing index", { buckets: 6 }],
    ["a missing count", { index: 1 }],
    ["a non-object value", 6],
    ["a null value", null],
  ])("returns null for %s", (_label, value) => {
    expect(buildFilterSQL(bucketFilter(value))).toBeNull();
  });

  it("drops an invalid partition filter rather than widening the segment", () => {
    // A null filter is omitted by buildConditionSQL. If a partition filter were
    // the only filter in the group, the whole condition must collapse to null
    // so callers treat it as "no valid segment" instead of "every contact".
    const condition = {
      logic: "AND" as const,
      groups: [{ filters: [bucketFilter({ buckets: 6, index: 99 })] }],
    };
    expect(buildConditionSQL(condition)).toBeNull();
  });

  it("combines a partition with other filters in the same group", () => {
    const condition = {
      logic: "AND" as const,
      groups: [
        {
          filters: [
            { field: "status", operator: "equals" as const, value: "active" },
            bucketFilter({ buckets: 6, index: 3 }),
          ],
        },
      ],
    };
    const query = toSQL(buildConditionSQL(condition));
    expect(query!.sql).toContain("md5");
    expect(query!.sql).toContain("email_status");
    expect(query!.params).toContain("active");
  });
});

describe("buildFilterSQL - property inList/notInList", () => {
  it("handles inList on property fields", () => {
    const filter: SegmentFilter = {
      field: "properties.plan",
      operator: "inList",
      value: ["free", "pro", "enterprise"],
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("properties");
    expect(query!.sql).toContain("ANY");
  });

  it("handles notInList on property fields", () => {
    const filter: SegmentFilter = {
      field: "properties.plan",
      operator: "notInList",
      value: ["churned", "banned"],
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("properties");
    expect(query!.sql).toContain("ALL");
  });

  it("handles empty inList on property fields as FALSE", () => {
    const filter: SegmentFilter = {
      field: "properties.plan",
      operator: "inList",
      value: [],
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("FALSE");
  });

  it("handles empty notInList on property fields as TRUE", () => {
    const filter: SegmentFilter = {
      field: "properties.plan",
      operator: "notInList",
      value: [],
    };

    const result = buildFilterSQL(filter);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain("TRUE");
  });
});

describe("buildConditionSQL - nested groups", () => {
  it("handles nested conditions recursively", () => {
    const condition: FilterCondition = {
      logic: "AND",
      groups: [
        {
          filters: [{ field: "status", operator: "equals", value: "active" }],
          nested: {
            logic: "OR",
            groups: [
              {
                filters: [
                  { field: "emailsSent", operator: "greaterThan", value: 5 },
                ],
              },
              {
                filters: [
                  { field: "emailsOpened", operator: "greaterThan", value: 0 },
                ],
              },
            ],
          },
        },
      ],
    };

    const result = buildConditionSQL(condition);
    expect(result).not.toBeNull();

    const query = toSQL(result);
    expect(query!.sql).toContain('"email_status"');
    expect(query!.sql).toContain('"emails_sent"');
    expect(query!.sql).toContain('"emails_opened"');
    // The nested OR should be present
    expect(query!.sql).toContain(" or ");
  });
});
