/**
 * Segment filter — column targeting, list-operator guards, and fail-closed
 * evaluation.
 *
 * Covers three defects found in the 2026-08-19 audience audit:
 *
 * - F1: the `status` filter field compiled to the deprecated `contact.status`
 *   column, which nothing writes. Production carries `status = 'active'` on
 *   100% of rows while `email_status` holds the real unsubscribed/bounced/
 *   complained state, so "Status equals Active" matched the entire org.
 * - F2: `inList`/`notInList` cast their value to `string[]` without checking.
 *   A scalar from the UI compiled to `= ANY($1)` with a text param, which
 *   Postgres rejects with `malformed array literal`.
 * - F18: `contactMatchesCondition` matched everything when the condition
 *   compiled to no SQL, while both send paths refuse to send.
 */

import { describe, expect, it, vi } from "vitest";
import type { FilterCondition, SegmentFilter } from "../schema/segments";
import {
  contactIdsMatchingCondition,
  contactMatchesCondition,
} from "../segment-evaluator";
import { buildConditionSQL, buildFilterSQL } from "../segment-filter";

const pgConfig = {
  escapeName: (name: string) => `"${name}"`,
  escapeParam: (num: number) => `$${num + 1}`,
  escapeString: (str: string) => `'${str}'`,
} as never;

function toSQL(sqlObj: ReturnType<typeof buildFilterSQL>) {
  return sqlObj ? sqlObj.toQuery(pgConfig) : null;
}

describe("status field targets the live email_status column", () => {
  it("compiles `status equals` against email_status", () => {
    const query = toSQL(
      buildFilterSQL({ field: "status", operator: "equals", value: "active" })
    );

    expect(query?.sql).toContain('"email_status"');
    expect(query?.sql).not.toContain('"status" =');
    expect(query?.params).toContain("active");
  });

  it("compiles `status inList` against email_status", () => {
    const query = toSQL(
      buildFilterSQL({
        field: "status",
        operator: "inList",
        value: ["bounced", "complained"],
      })
    );

    expect(query?.sql).toContain('"email_status"');
    expect(query?.sql).toContain("ANY");
  });

  it("compiles the whole condition tree against email_status", () => {
    const condition: FilterCondition = {
      logic: "AND",
      groups: [
        {
          filters: [
            { field: "status", operator: "notEquals", value: "active" },
          ],
        },
      ],
    };

    expect(toSQL(buildConditionSQL(condition))?.sql).toContain(
      '"email_status"'
    );
  });
});

describe("list operators reject a non-array value", () => {
  const scalarCases: SegmentFilter[] = [
    { field: "status", operator: "inList", value: "active" },
    { field: "status", operator: "notInList", value: "active" },
    { field: "properties.plan", operator: "inList", value: "pro" },
    { field: "properties.plan", operator: "notInList", value: "pro" },
  ];

  for (const filter of scalarCases) {
    it(`returns null for ${filter.field} ${filter.operator} with a scalar`, () => {
      expect(buildFilterSQL(filter)).toBeNull();
    });
  }

  it("returns null when the value is missing entirely", () => {
    expect(buildFilterSQL({ field: "status", operator: "inList" })).toBeNull();
  });

  it("still compiles a real array", () => {
    const query = toSQL(
      buildFilterSQL({
        field: "status",
        operator: "inList",
        value: ["active", "bounced"],
      })
    );

    expect(query?.sql).toContain("ANY");
    expect(query?.params).toContainEqual(["active", "bounced"]);
  });

  it("folds a scalar list filter out of the condition tree entirely", () => {
    const condition: FilterCondition = {
      logic: "AND",
      groups: [
        { filters: [{ field: "status", operator: "inList", value: "active" }] },
      ],
    };

    // No SQL at all — the send paths and the evaluator then fail closed rather
    // than sending the query to Postgres and getting `malformed array literal`.
    expect(buildConditionSQL(condition)).toBeNull();
  });
});

describe("event filters are reachable from an `event.`-prefixed field", () => {
  it("strips the prefix so the subquery matches the bare event name", () => {
    const query = toSQL(
      buildFilterSQL({ field: "event.course_download", operator: "triggered" })
    );

    expect(query?.sql).toContain("contact_event");
    expect(query?.params).toContain("course_download");
    expect(query?.params).not.toContain("event.course_download");
  });

  it("still accepts a bare event name", () => {
    const query = toSQL(
      buildFilterSQL({ field: "course_download", operator: "notTriggered" })
    );

    expect(query?.sql).toContain("NOT EXISTS");
    expect(query?.params).toContain("course_download");
  });

  it("returns null when the event name is empty", () => {
    expect(
      buildFilterSQL({ field: "event.", operator: "triggered" })
    ).toBeNull();
    expect(
      buildFilterSQL({
        field: "event.",
        operator: "triggeredWithin",
        value: 7,
        unit: "days",
      })
    ).toBeNull();
  });
});

describe("evaluator fails closed on a condition that compiles to no SQL", () => {
  const uncompilable: FilterCondition = {
    logic: "AND",
    groups: [
      { filters: [{ field: "unknownField", operator: "equals", value: "x" }] },
    ],
  };

  const db = { select: vi.fn() } as never;

  it("contactMatchesCondition returns false without querying", async () => {
    const select = vi.fn();

    await expect(
      contactMatchesCondition(
        { select } as never,
        "contact-1",
        "org-1",
        uncompilable
      )
    ).resolves.toBe(false);
    expect(select).not.toHaveBeenCalled();
  });

  it("contactIdsMatchingCondition returns no ids without querying", async () => {
    const select = vi.fn();

    await expect(
      contactIdsMatchingCondition(
        { select } as never,
        ["contact-1", "contact-2"],
        "org-1",
        uncompilable
      )
    ).resolves.toEqual([]);
    expect(select).not.toHaveBeenCalled();
  });

  it("an empty condition matches nobody", async () => {
    await expect(
      contactMatchesCondition(db, "contact-1", "org-1", {
        logic: "AND",
        groups: [],
      })
    ).resolves.toBe(false);
  });
});

/**
 * The send path reads a *stored* condition and compiles it directly — there is
 * no validation gate in front of it, unlike create/update/preview. A filter
 * that no longer compiles (an older build's operator, an API-written value of
 * the wrong shape) used to be dropped while its siblings survived, which
 * widens the audience instead of refusing it.
 */
describe("a condition that compiles only in part is refused whole", () => {
  const good = { field: "email", operator: "contains" as const, value: "@" };
  const uncompilable = {
    field: "status",
    operator: "inList" as const,
    value: "active", // scalar where the operator needs an array
  };

  it("drops the whole condition when one filter in a group fails", () => {
    expect(
      buildConditionSQL({
        logic: "AND",
        groups: [{ filters: [good, uncompilable] }],
      })
    ).toBeNull();
  });

  it("drops the whole condition when one group of an OR fails", () => {
    // Under OR, keeping the good group alone would still change who matches.
    expect(
      buildConditionSQL({
        logic: "OR",
        groups: [{ filters: [good] }, { filters: [uncompilable] }],
      })
    ).toBeNull();
  });

  it("drops the whole condition when a nested block fails", () => {
    expect(
      buildConditionSQL({
        logic: "AND",
        groups: [
          {
            filters: [good],
            nested: { logic: "AND", groups: [{ filters: [uncompilable] }] },
          },
        ],
      })
    ).toBeNull();
  });

  it("still compiles when every filter is good", () => {
    expect(
      buildConditionSQL({
        logic: "AND",
        groups: [
          {
            filters: [good],
            nested: {
              logic: "OR",
              groups: [
                {
                  filters: [
                    {
                      field: "status",
                      operator: "inList",
                      value: ["active", "bounced"],
                    },
                  ],
                },
              ],
            },
          },
        ],
      })
    ).not.toBeNull();
  });

  it("ignores an empty nested block rather than failing on it", () => {
    expect(
      buildConditionSQL({
        logic: "AND",
        groups: [{ filters: [good], nested: { logic: "AND", groups: [] } }],
      })
    ).not.toBeNull();
  });
});
