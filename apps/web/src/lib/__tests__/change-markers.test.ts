import { describe, expect, it } from "vitest";
import { validateTimezone } from "../analytics-utils";
import {
  attachDeltas,
  buildChangeMarkers,
  COPY,
  capMarkers,
  clusterMarkers,
  computeMarkerDelta,
  deltaQueryWindow,
  describeMarkerDelta,
  groupMarkersByDate,
  MARKER_LABEL,
  MAX_MARKERS,
  TIMELINE_TAB_HREF,
} from "../change-markers";

const ORG = "acme";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// A pure fixture: the marker builder reads only these fields.
function rows(
  partial: Partial<{
    batches: unknown[];
    auditRows: unknown[];
    templateVersions: unknown[];
  }> = {}
) {
  return {
    batches: [],
    auditRows: [],
    templateVersions: [],
    ...partial,
  } as Parameters<typeof buildChangeMarkers>[0];
}

function batch(over: Record<string, unknown> = {}) {
  return {
    id: "batch-1",
    name: "October launch",
    totalRecipients: 1200,
    startedAt: new Date("2026-10-25T10:00:00.000Z"),
    ...over,
  };
}

function audit(over: Record<string, unknown> = {}) {
  return {
    id: "audit-1",
    action: "workflow.enabled",
    createdAt: new Date("2026-10-25T10:00:00.000Z"),
    workflowId: "wf-1",
    importCount: null,
    workflowName: "Welcome flow",
    ...over,
  };
}

function template(over: Record<string, unknown> = {}) {
  return {
    id: "tv-1",
    version: 4,
    createdAt: new Date("2026-10-25T10:00:00.000Z"),
    templateId: "tpl-1",
    templateName: "Receipt",
    ...over,
  };
}

const OPTS = { orgSlug: ORG, timezone: "UTC" };

describe("buildChangeMarkers: one marker per source row", () => {
  it("maps a broadcast start to broadcast_started with label, href and weight", () => {
    const [marker] = buildChangeMarkers(rows({ batches: [batch()] }), OPTS);
    expect(marker).toMatchObject({
      id: "broadcast_started:batch-1",
      type: "broadcast_started",
      label: "Broadcast started: October launch (1,200 recipients)",
      href: "/acme/emails/broadcasts/batch-1",
      weight: "major",
      count: 1,
      delta: null,
    });
  });

  it("maps workflow.enabled to automation_enabled", () => {
    const [marker] = buildChangeMarkers(
      rows({ auditRows: [audit({ action: "workflow.enabled" })] }),
      OPTS
    );
    expect(marker).toMatchObject({
      id: "automation_enabled:audit-1",
      type: "automation_enabled",
      label: "Automation enabled: Welcome flow",
      href: "/acme/automations/wf-1",
      weight: "minor",
    });
  });

  it("maps workflow.disabled to automation_disabled", () => {
    const [marker] = buildChangeMarkers(
      rows({ auditRows: [audit({ action: "workflow.disabled" })] }),
      OPTS
    );
    expect(marker).toMatchObject({
      type: "automation_disabled",
      label: "Automation disabled: Welcome flow",
      href: "/acme/automations/wf-1",
    });
  });

  it("maps a template version to template_saved", () => {
    const [marker] = buildChangeMarkers(
      rows({ templateVersions: [template()] }),
      OPTS
    );
    expect(marker).toMatchObject({
      id: "template_saved:tv-1",
      type: "template_saved",
      label: "Template saved: Receipt (v4)",
      href: "/acme/emails/templates/tpl-1",
      weight: "minor",
    });
  });

  it("maps contact.imported to contacts_imported using the count", () => {
    const [marker] = buildChangeMarkers(
      rows({
        auditRows: [
          audit({
            action: "contact.imported",
            importCount: "340",
            workflowId: null,
            workflowName: null,
          }),
        ],
      }),
      OPTS
    );
    expect(marker).toMatchObject({
      type: "contacts_imported",
      label: "Contacts imported: 340 new",
      href: "/acme/contacts",
      weight: "minor",
      value: 340,
    });
  });

  it("maps suppression.removed to suppression_removed", () => {
    const [marker] = buildChangeMarkers(
      rows({
        auditRows: [
          audit({
            action: "suppression.removed",
            workflowId: null,
            workflowName: null,
          }),
        ],
      }),
      OPTS
    );
    expect(marker).toMatchObject({
      type: "suppression_removed",
      label: "Suppressed address removed",
      href: "/acme/emails?tab=deliverability&list=suppressed",
      weight: "minor",
    });
  });

  it("maps settings.sender_defaults_updated to sender_defaults_changed", () => {
    const [marker] = buildChangeMarkers(
      rows({
        auditRows: [
          audit({
            action: "settings.sender_defaults_updated",
            workflowId: null,
            workflowName: null,
          }),
        ],
      }),
      OPTS
    );
    expect(marker).toMatchObject({
      type: "sender_defaults_changed",
      label: "Sender defaults changed",
      href: "/acme/settings/sender-defaults",
      weight: "minor",
    });
  });
});

describe("buildChangeMarkers: labels and weights", () => {
  it('labels a workflow with no name as "Automation enabled" with no name in brackets', () => {
    const [marker] = buildChangeMarkers(
      rows({ auditRows: [audit({ workflowName: null })] }),
      OPTS
    );
    expect(marker.label).toBe("Automation enabled");
    expect(marker.label).not.toContain("(");
    expect(marker.label).not.toContain(":");
  });

  it('labels a broadcast with null name as "Untitled broadcast"', () => {
    const [marker] = buildChangeMarkers(
      rows({ batches: [batch({ name: null })] }),
      OPTS
    );
    expect(marker.label).toContain("Untitled broadcast");
  });

  it("broadcast_started is major at 1000 recipients and minor at 999", () => {
    const [major] = buildChangeMarkers(
      rows({ batches: [batch({ totalRecipients: 1000 })] }),
      OPTS
    );
    const [minor] = buildChangeMarkers(
      rows({ batches: [batch({ totalRecipients: 999 })] }),
      OPTS
    );
    expect(major.weight).toBe("major");
    expect(minor.weight).toBe("minor");
  });

  it("contacts_imported is major at 1000 and minor at 999", () => {
    const at = (importCount: string) =>
      buildChangeMarkers(
        rows({
          auditRows: [
            audit({
              action: "contact.imported",
              importCount,
              workflowId: null,
              workflowName: null,
            }),
          ],
        }),
        OPTS
      )[0];
    expect(at("1000").weight).toBe("major");
    expect(at("999").weight).toBe("minor");
  });

  it("suppression_removed label never contains an email address", () => {
    // The source row carries an address in fields the builder must never read.
    // The repository never selects them, but the builder must not reach for them.
    const leaked = {
      ...audit({
        action: "suppression.removed",
        workflowId: null,
        workflowName: null,
      }),
      resourceId: "reader@example.com",
      metadata: { email: "reader@example.com" },
    };
    const [marker] = buildChangeMarkers(rows({ auditRows: [leaked] }), OPTS);
    expect(marker.label).not.toMatch(/@/);
    expect(JSON.stringify(marker)).not.toContain("reader@example.com");
  });

  it("the label catalog never contains an email address for any type", () => {
    expect(MARKER_LABEL.suppressionRemoved()).not.toMatch(/@/);
  });
});

describe("clusterMarkers", () => {
  const sameDay = (type: "broadcast", at: string, id: string) =>
    buildChangeMarkers(
      rows({
        batches: [batch({ id, startedAt: new Date(at), name: `B ${id}` })],
      }),
      OPTS
    )[0];

  it("same-type markers on the same local day collapse into one group with count and delta null", () => {
    const markers = [
      sameDay("broadcast", "2026-10-25T08:00:00.000Z", "a"),
      sameDay("broadcast", "2026-10-25T18:00:00.000Z", "b"),
    ];
    const [group] = clusterMarkers(markers, { orgSlug: ORG });
    expect(markers).toHaveLength(2);
    expect(group).toMatchObject({
      id: "group:broadcast_started:2026-10-25",
      type: "broadcast_started",
      count: 2,
      delta: null,
      at: new Date("2026-10-25T18:00:00.000Z").getTime(),
      label: "2 broadcasts started",
    });
  });

  it("same-type markers on different local days do not collapse", () => {
    const markers = [
      sameDay("broadcast", "2026-10-25T08:00:00.000Z", "a"),
      sameDay("broadcast", "2026-10-26T08:00:00.000Z", "b"),
    ];
    expect(clusterMarkers(markers, { orgSlug: ORG })).toHaveLength(2);
  });

  it("the day boundary uses the request timezone, not UTC", () => {
    // Both are on 2026-10-25 in UTC. In America/New_York (EDT, UTC-4) they fall
    // on 2026-10-24 and 2026-10-25, so they must not collapse.
    const nyOpts = { orgSlug: ORG, timezone: "America/New_York" };
    const markers = [
      buildChangeMarkers(
        rows({
          batches: [
            batch({ id: "a", startedAt: new Date("2026-10-25T03:00:00.000Z") }),
          ],
        }),
        nyOpts
      )[0],
      buildChangeMarkers(
        rows({
          batches: [
            batch({ id: "b", startedAt: new Date("2026-10-25T23:00:00.000Z") }),
          ],
        }),
        nyOpts
      )[0],
    ];
    expect(markers[0].date).toBe("2026-10-24");
    expect(markers[1].date).toBe("2026-10-25");
    expect(clusterMarkers(markers, { orgSlug: ORG })).toHaveLength(2);
  });

  it("different types on the same day do not collapse", () => {
    const markers = buildChangeMarkers(
      rows({
        batches: [
          batch({ id: "a", startedAt: new Date("2026-10-25T08:00:00.000Z") }),
        ],
        auditRows: [
          audit({
            action: "workflow.enabled",
            createdAt: new Date("2026-10-25T09:00:00.000Z"),
          }),
        ],
      }),
      OPTS
    );
    expect(clusterMarkers(markers, { orgSlug: ORG })).toHaveLength(2);
  });

  it("the group href points at the list page for its type", () => {
    const markers = [
      sameDay("broadcast", "2026-10-25T08:00:00.000Z", "a"),
      sameDay("broadcast", "2026-10-25T18:00:00.000Z", "b"),
    ];
    const [group] = clusterMarkers(markers, { orgSlug: ORG });
    expect(group.href).toBe("/acme/emails/broadcasts");
  });

  it("a group of contact imports sums the contacts and labels both numbers", () => {
    const imports = [
      buildChangeMarkers(
        rows({
          auditRows: [
            audit({
              id: "i1",
              action: "contact.imported",
              importCount: "10",
              createdAt: new Date("2026-10-25T08:00:00.000Z"),
              workflowId: null,
              workflowName: null,
            }),
          ],
        }),
        OPTS
      )[0],
      buildChangeMarkers(
        rows({
          auditRows: [
            audit({
              id: "i2",
              action: "contact.imported",
              importCount: "32",
              createdAt: new Date("2026-10-25T09:00:00.000Z"),
              workflowId: null,
              workflowName: null,
            }),
          ],
        }),
        OPTS
      )[0],
    ];
    const [group] = clusterMarkers(imports, { orgSlug: ORG });
    expect(group.label).toBe("2 contact imports (42 contacts new)");
    expect(group.href).toBe("/acme/contacts");
  });

  it("a group's weight is the maximum weight of its members", () => {
    const markers = [
      sameDay("broadcast", "2026-10-25T08:00:00.000Z", "a"),
      buildChangeMarkers(
        rows({
          batches: [
            batch({
              id: "big",
              totalRecipients: 5000,
              startedAt: new Date("2026-10-25T18:00:00.000Z"),
            }),
          ],
        }),
        OPTS
      )[0],
    ];
    const [group] = clusterMarkers(markers, { orgSlug: ORG });
    expect(group.weight).toBe("major");
  });
});

describe("capMarkers", () => {
  it("caps the response at 100 markers, newest first, with totalMarkers and truncated set", () => {
    const many = Array.from(
      { length: 130 },
      (_, i) =>
        buildChangeMarkers(
          rows({
            templateVersions: [
              template({
                id: `tv-${i}`,
                createdAt: new Date(Date.UTC(2026, 9, 1) + i * DAY),
                templateId: `t-${i}`,
              }),
            ],
          }),
          OPTS
        )[0]
    );
    const capped = capMarkers(many, { truncatedSource: false });
    expect(capped.markers).toHaveLength(MAX_MARKERS);
    expect(MAX_MARKERS).toBe(100);
    expect(capped.totalMarkers).toBe(130);
    expect(capped.truncated).toBe(true);
    const ats = capped.markers.map((m) => m.at);
    expect([...ats].sort((a, b) => b - a)).toEqual(ats);
    expect(capped.markers[0].at).toBe(Date.UTC(2026, 9, 1) + 129 * DAY);
  });

  it("is truncated when a source reported the 501-row limit", () => {
    const capped = capMarkers([], { truncatedSource: true });
    expect(capped.truncated).toBe(true);
    expect(capped.totalMarkers).toBe(0);
  });
});

describe("date key uses the request timezone", () => {
  it("a marker at 03:30 UTC in UTC-5 has the previous date", () => {
    const [marker] = buildChangeMarkers(
      rows({
        batches: [batch({ startedAt: new Date("2026-10-25T03:30:00.000Z") })],
      }),
      { orgSlug: ORG, timezone: "America/Bogota" }
    );
    expect(marker.date).toBe("2026-10-24");
  });

  it("a marker at 23:30 UTC in UTC-5 keeps the same date", () => {
    const [marker] = buildChangeMarkers(
      rows({
        batches: [batch({ startedAt: new Date("2026-10-25T23:30:00.000Z") })],
      }),
      { orgSlug: ORG, timezone: "America/Bogota" }
    );
    expect(marker.date).toBe("2026-10-25");
  });

  it("invalid timezone input falls back to UTC (through validateTimezone)", () => {
    const tz = validateTimezone("Not/AZone");
    expect(tz).toBe("UTC");
    const [marker] = buildChangeMarkers(
      rows({
        batches: [batch({ startedAt: new Date("2026-10-25T03:30:00.000Z") })],
      }),
      { orgSlug: ORG, timezone: tz }
    );
    expect(marker.date).toBe("2026-10-25");
  });
});

describe("window bounds", () => {
  it("markers outside [startMs, endMs] are excluded, even when their before window overlaps the chart window", () => {
    const startMs = Date.parse("2026-10-20T00:00:00.000Z");
    const endMs = Date.parse("2026-10-28T00:00:00.000Z");
    const markers = buildChangeMarkers(
      rows({
        batches: [
          batch({
            id: "early",
            startedAt: new Date("2026-10-19T23:00:00.000Z"),
          }),
          batch({ id: "start", startedAt: new Date(startMs) }),
          batch({ id: "end", startedAt: new Date(endMs) }),
          batch({
            id: "late",
            startedAt: new Date("2026-10-28T00:00:01.000Z"),
          }),
        ],
      }),
      { ...OPTS, window: { startMs, endMs } }
    );
    const ids = markers.map((m) => m.id);
    expect(ids).toContain("broadcast_started:start");
    expect(ids).toContain("broadcast_started:end");
    expect(ids).not.toContain("broadcast_started:early");
    expect(ids).not.toContain("broadcast_started:late");
  });
});

describe("computeMarkerDelta", () => {
  // A change at 2026-10-25T10:20Z has h0 = 10:00Z. Before is
  // [2026-10-24T10:00Z, 2026-10-25T10:00Z). After is
  // [2026-10-25T11:00Z, 2026-10-26T11:00Z). Close is 2026-10-26T11:00Z.
  const AT = Date.parse("2026-10-25T10:20:00.000Z");
  const H0 = Date.parse("2026-10-25T10:00:00.000Z");
  const CLOSE = H0 + 25 * HOUR;

  function bucket(
    hourIso: string,
    sent: number,
    bounced = 0,
    complained = 0,
    suppressed = 0
  ) {
    return {
      period: hourIso.replace("Z", "").replace(/\.000$/, ""),
      sent,
      bounced,
      complained,
      suppressed,
    };
  }
  // Helper for "2026-10-25T10:00:00Z" -> period "2026-10-25T10:00:00".
  const at = (iso: string) => iso;

  it("the hour containing the change is excluded from both windows", () => {
    const buckets = [
      bucket(at("2026-10-25T10:00:00.000Z"), 10, 10, 0, 0),
      bucket(at("2026-10-25T09:00:00.000Z"), 300),
      bucket(at("2026-10-25T11:00:00.000Z"), 300),
    ];
    const delta = computeMarkerDelta(buckets, {
      at: AT,
      now: new Date(CLOSE + DAY),
    });
    expect(delta.beforeSent).toBe(300);
    expect(delta.afterSent).toBe(300);
    expect(delta.metrics[0].before).toBe(0);
  });

  it("before window is the 24 hours [h0-24h, h0) and after is [h0+1h, h0+25h)", () => {
    const buckets = [
      bucket(at("2026-10-24T10:00:00.000Z"), 1), // h0-24h: in before
      bucket(at("2026-10-25T09:00:00.000Z"), 1), // h0-1h: in before
      bucket(at("2026-10-25T10:00:00.000Z"), 1000), // h0: in neither
      bucket(at("2026-10-25T11:00:00.000Z"), 1), // h0+1h: in after
      bucket(at("2026-10-26T10:00:00.000Z"), 1), // h0+24h: in after
      bucket(at("2026-10-26T11:00:00.000Z"), 1000), // h0+25h: in neither
      bucket(at("2026-10-24T09:00:00.000Z"), 1000), // h0-25h: in neither
    ];
    const delta = computeMarkerDelta(buckets, {
      at: AT,
      now: new Date(CLOSE + DAY),
    });
    expect(delta.beforeSent).toBe(2);
    expect(delta.afterSent).toBe(2);
  });

  it("status is pending until afterClosesAt", () => {
    const delta = computeMarkerDelta([], {
      at: AT,
      now: new Date(CLOSE - 60_000),
    });
    expect(delta.afterClosesAt).toBe(CLOSE);
    expect(delta.metrics.every((m) => m.status === "pending")).toBe(true);
  });

  it("three sends with a 300% relative rise is insufficient_volume", () => {
    // Before: 1 bounce of 3 sends. After: 4 bounces of 10 sends. That is +300%
    // relative, but both windows are far below 200 sends.
    const buckets = [
      bucket(at("2026-10-25T09:00:00.000Z"), 3, 1),
      bucket(at("2026-10-25T11:00:00.000Z"), 10, 4),
    ];
    const delta = computeMarkerDelta(buckets, {
      at: AT,
      now: new Date(CLOSE + 8 * DAY),
    });
    const bounce = delta.metrics.find((m) => m.metric === "bounce");
    expect(bounce?.status).toBe("insufficient_volume");
    expect(bounce?.deltaPts).toBeNull();
    expect(bounce?.direction).toBeNull();
    expect(bounce?.before).toBeNull();
    expect(bounce?.after).toBeNull();
  });

  it("below 200 sends on either side is insufficient_volume, and exactly 200 is not", () => {
    const now = new Date(CLOSE + 8 * DAY);
    const short = computeMarkerDelta(
      [
        bucket(at("2026-10-25T09:00:00.000Z"), 199),
        bucket(at("2026-10-25T11:00:00.000Z"), 200),
      ],
      { at: AT, now }
    );
    expect(short.metrics[0].status).toBe("insufficient_volume");
    const enough = computeMarkerDelta(
      [
        bucket(at("2026-10-25T09:00:00.000Z"), 200),
        bucket(at("2026-10-25T11:00:00.000Z"), 200),
      ],
      { at: AT, now }
    );
    expect(enough.metrics[0].status).not.toBe("insufficient_volume");
  });

  it("bounce and suppression settle 24 hours after afterClosesAt", () => {
    const enough = [
      bucket(at("2026-10-25T09:00:00.000Z"), 300, 3, 0, 3),
      bucket(at("2026-10-25T11:00:00.000Z"), 300, 3, 0, 3),
    ];
    const at23 = computeMarkerDelta(enough, {
      at: AT,
      now: new Date(CLOSE + 23 * HOUR),
    });
    const at24 = computeMarkerDelta(enough, {
      at: AT,
      now: new Date(CLOSE + 24 * HOUR),
    });
    expect(at23.metrics.find((m) => m.metric === "bounce")?.status).toBe(
      "accruing"
    );
    expect(at23.metrics.find((m) => m.metric === "suppression")?.status).toBe(
      "accruing"
    );
    expect(at24.metrics.find((m) => m.metric === "bounce")?.status).toBe(
      "ready"
    );
    expect(at24.metrics.find((m) => m.metric === "suppression")?.status).toBe(
      "ready"
    );
  });

  it("complaint settles 7 days after afterClosesAt", () => {
    const enough = [
      bucket(at("2026-10-25T09:00:00.000Z"), 300, 0, 1, 0),
      bucket(at("2026-10-25T11:00:00.000Z"), 300, 0, 1, 0),
    ];
    const at6d = computeMarkerDelta(enough, {
      at: AT,
      now: new Date(CLOSE + 6 * DAY),
    });
    const at7d = computeMarkerDelta(enough, {
      at: AT,
      now: new Date(CLOSE + 7 * DAY),
    });
    expect(at6d.metrics.find((m) => m.metric === "complaint")?.status).toBe(
      "accruing"
    );
    expect(at7d.metrics.find((m) => m.metric === "complaint")?.status).toBe(
      "ready"
    );
  });

  it("a bounce delta of 0.49 points is flat and 0.50 points is notable up", () => {
    const now = new Date(CLOSE + 8 * DAY);
    // Before 1.00% (100 of 10000). After 1.49% (149 of 10000) is 0.49 points.
    const flat = computeMarkerDelta(
      [
        bucket(at("2026-10-25T09:00:00.000Z"), 10000, 100),
        bucket(at("2026-10-25T11:00:00.000Z"), 10000, 149),
      ],
      { at: AT, now }
    );
    const notable = computeMarkerDelta(
      [
        bucket(at("2026-10-25T09:00:00.000Z"), 10000, 100),
        bucket(at("2026-10-25T11:00:00.000Z"), 10000, 150),
      ],
      { at: AT, now }
    );
    const f = flat.metrics.find((m) => m.metric === "bounce");
    const n = notable.metrics.find((m) => m.metric === "bounce");
    expect(f).toMatchObject({ deltaPts: 0.49, direction: "flat" });
    expect(n).toMatchObject({ deltaPts: 0.5, direction: "up" });
  });

  it("a suppression delta of 0.49 points is flat and 0.50 points is notable", () => {
    const now = new Date(CLOSE + 8 * DAY);
    const flat = computeMarkerDelta(
      [
        bucket(at("2026-10-25T09:00:00.000Z"), 10000, 0, 0, 100),
        bucket(at("2026-10-25T11:00:00.000Z"), 10000, 0, 0, 149),
      ],
      { at: AT, now }
    );
    const notable = computeMarkerDelta(
      [
        bucket(at("2026-10-25T09:00:00.000Z"), 10000, 0, 0, 100),
        bucket(at("2026-10-25T11:00:00.000Z"), 10000, 0, 0, 150),
      ],
      { at: AT, now }
    );
    expect(
      flat.metrics.find((m) => m.metric === "suppression")?.direction
    ).toBe("flat");
    expect(
      notable.metrics.find((m) => m.metric === "suppression")?.direction
    ).toBe("up");
  });

  it("a complaint delta of 0.04 points is flat and 0.05 points is notable", () => {
    const now = new Date(CLOSE + 8 * DAY);
    // Before 0.0100% (1 of 10000). After 0.0500% is 0.04 points, after 0.0600% is 0.05.
    const flat = computeMarkerDelta(
      [
        bucket(at("2026-10-25T09:00:00.000Z"), 10000, 0, 1),
        bucket(at("2026-10-25T11:00:00.000Z"), 10000, 0, 5),
      ],
      { at: AT, now }
    );
    const notable = computeMarkerDelta(
      [
        bucket(at("2026-10-25T09:00:00.000Z"), 10000, 0, 1),
        bucket(at("2026-10-25T11:00:00.000Z"), 10000, 0, 6),
      ],
      { at: AT, now }
    );
    expect(flat.metrics.find((m) => m.metric === "complaint")).toMatchObject({
      deltaPts: 0.04,
      direction: "flat",
    });
    expect(notable.metrics.find((m) => m.metric === "complaint")).toMatchObject(
      { deltaPts: 0.05, direction: "up" }
    );
  });

  it("a notable decrease is reported as down", () => {
    const delta = computeMarkerDelta(
      [
        bucket(at("2026-10-25T09:00:00.000Z"), 10000, 200),
        bucket(at("2026-10-25T11:00:00.000Z"), 10000, 100),
      ],
      { at: AT, now: new Date(CLOSE + 8 * DAY) }
    );
    expect(delta.metrics.find((m) => m.metric === "bounce")).toMatchObject({
      deltaPts: -1,
      direction: "down",
    });
  });

  it("rates equal the chart formula for the same bucket sums", () => {
    const delta = computeMarkerDelta(
      [
        bucket(at("2026-10-25T09:00:00.000Z"), 400, 8, 2, 4),
        bucket(at("2026-10-25T11:00:00.000Z"), 400, 4, 1, 0),
      ],
      { at: AT, now: new Date(CLOSE + 8 * DAY) }
    );
    const bounce = delta.metrics.find((m) => m.metric === "bounce");
    // Chart formula: bounced / sent * 100.
    expect(bounce?.before).toBeCloseTo((8 / 400) * 100, 10);
    expect(bounce?.after).toBeCloseTo((4 / 400) * 100, 10);
  });
});

describe("deltaQueryWindow and attachDeltas", () => {
  it("returns null when there are no single markers, so the metrics query is skipped", () => {
    expect(deltaQueryWindow([])).toBeNull();
    const group = clusterMarkers(
      buildChangeMarkers(
        rows({
          batches: [
            batch({ id: "a", startedAt: new Date("2026-10-25T08:00:00Z") }),
            batch({ id: "b", startedAt: new Date("2026-10-25T09:00:00Z") }),
          ],
        }),
        OPTS
      ),
      { orgSlug: ORG }
    );
    expect(deltaQueryWindow(group)).toBeNull();
  });

  it("spans the earliest before window to the latest close, end-inclusive", () => {
    const markers = buildChangeMarkers(
      rows({
        batches: [
          batch({ id: "a", startedAt: new Date("2026-10-25T10:20:00Z") }),
          batch({ id: "b", startedAt: new Date("2026-10-20T03:00:00Z") }),
        ],
      }),
      OPTS
    );
    const window = deltaQueryWindow(markers);
    expect(window?.startTime.getTime()).toBe(
      Date.parse("2026-10-19T03:00:00Z")
    );
    expect(window?.endTime.getTime()).toBe(
      Date.parse("2026-10-26T11:00:00Z") - 1
    );
  });

  it("attaches a delta to single markers and leaves groups with delta null", () => {
    const singles = buildChangeMarkers(
      rows({
        batches: [
          batch({ id: "a", startedAt: new Date("2026-10-25T10:20:00Z") }),
        ],
      }),
      OPTS
    );
    const grouped = clusterMarkers(
      buildChangeMarkers(
        rows({
          batches: [
            batch({ id: "x", startedAt: new Date("2026-10-22T08:00:00Z") }),
            batch({ id: "y", startedAt: new Date("2026-10-22T09:00:00Z") }),
          ],
        }),
        OPTS
      ),
      { orgSlug: ORG }
    );
    const attached = attachDeltas(
      [...singles, ...grouped],
      [],
      new Date("2026-10-28T00:00:00Z")
    );
    expect(attached[0].delta).not.toBeNull();
    expect(attached[1].delta).toBeNull();
  });
});

describe("groupMarkersByDate", () => {
  it("returns one entry per chart date with the count of changes and whether any is major", () => {
    const markers = buildChangeMarkers(
      rows({
        batches: [
          batch({
            id: "a",
            startedAt: new Date("2026-10-25T08:00:00Z"),
            totalRecipients: 1500,
          }),
        ],
        auditRows: [
          audit({
            action: "workflow.enabled",
            createdAt: new Date("2026-10-25T09:00:00Z"),
          }),
        ],
      }),
      OPTS
    );
    const lines = groupMarkersByDate(markers, ["2026-10-24", "2026-10-25"]);
    expect(lines).toEqual([
      expect.objectContaining({ date: "2026-10-25", count: 2, major: true }),
    ]);
  });

  it("drops markers whose date is not one of the chart categories", () => {
    const markers = buildChangeMarkers(
      rows({
        batches: [batch({ startedAt: new Date("2026-10-25T08:00:00Z") })],
      }),
      OPTS
    );
    expect(groupMarkersByDate(markers, ["2026-10-01"])).toEqual([]);
  });
});

describe("TIMELINE_TAB_HREF", () => {
  it("links to the hub's changes view with the metric and days", () => {
    expect(TIMELINE_TAB_HREF("acme", { metric: "complaint", days: 30 })).toBe(
      "/acme/emails?tab=deliverability&metric=complaint&days=30&drive=changes"
    );
  });
});

describe("describeMarkerDelta", () => {
  const AT = Date.parse("2026-10-25T10:20:00.000Z");
  const CLOSE = Date.parse("2026-10-26T11:00:00.000Z");
  const bucketOf = (iso: string, sent: number, bounced: number) => ({
    period: iso.replace(".000Z", "").replace("Z", ""),
    sent,
    bounced,
    complained: 0,
    suppressed: 0,
  });

  it("a ready bounce shows the heading, a notable chip, and the notable sentence", () => {
    const delta = computeMarkerDelta(
      [
        bucketOf("2026-10-25T09:00:00Z", 10000, 120),
        bucketOf("2026-10-25T11:00:00Z", 10000, 290),
      ],
      { at: AT, now: new Date(CLOSE + 8 * 24 * 3_600_000) }
    );
    const lines = describeMarkerDelta(delta, {
      timezone: "UTC",
      first: "bounce",
    });
    const bounce = lines[0];
    expect(bounce.heading).toBe("Bounce rate 1.20% -> 2.90% (+1.70 points)");
    expect(bounce.chip).toBe("Notable increase");
    expect(bounce.text).toBe(
      "The bounce rate was 1.20% in the 24 hours before and 2.90% in the 24 hours after. This change happened around the same time as that movement."
    );
  });

  it("lists the selected metric first", () => {
    const delta = computeMarkerDelta([], { at: AT, now: new Date(CLOSE - 1) });
    const lines = describeMarkerDelta(delta, {
      timezone: "UTC",
      first: "suppression",
    });
    expect(lines.map((l) => l.metric)).toEqual([
      "suppression",
      "bounce",
      "complaint",
    ]);
  });

  it("insufficient volume shows the copy and never a percentage change", () => {
    const delta = computeMarkerDelta(
      [
        bucketOf("2026-10-25T09:00:00Z", 3, 1),
        bucketOf("2026-10-25T11:00:00Z", 10, 4),
      ],
      { at: AT, now: new Date(CLOSE + 8 * 24 * 3_600_000) }
    );
    const bounce = describeMarkerDelta(delta, {
      timezone: "UTC",
      first: "bounce",
    })[0];
    expect(bounce.status).toBe("insufficient_volume");
    expect(bounce.text).toBe(
      "Not enough sends to compare: 3 before and 10 after. Each window needs 200 sends."
    );
    expect(bounce.heading).toBeNull();
    expect(bounce.chip).toBeNull();
    expect(bounce.text).not.toMatch(/points|->|%/);
  });

  it("accruing copy names the metric and the final date", () => {
    const delta = computeMarkerDelta(
      [
        bucketOf("2026-10-25T09:00:00Z", 300, 3),
        bucketOf("2026-10-25T11:00:00Z", 300, 3),
      ],
      { at: AT, now: new Date(CLOSE + 2 * 24 * 3_600_000) }
    );
    const complaint = describeMarkerDelta(delta, {
      timezone: "UTC",
      first: "complaint",
    }).find((l) => l.metric === "complaint");
    expect(complaint?.status).toBe("accruing");
    expect(complaint?.text).toBe(
      "Complaint figures are still arriving. Final on Nov 2, 2026."
    );
  });
});

describe("copy", () => {
  it("chart footnote and tab description use the exact spec strings", () => {
    expect(COPY.tabDescription).toBe(
      "Changes made in this window, listed next to the rate movements that happened around the same time. These are timing records only, not a diagnosis."
    );
    expect(COPY.listFootnote).toBe(
      "Markers show changes that happened around the same time as rate movements. They are timing records only, not a diagnosis."
    );
  });

  it("copy contains no causal wording", () => {
    const causal =
      /\b(caused|causes|causing|because|due to|led to|resulted in|driven by|blame)\b/i;
    const strings: string[] = [
      COPY.tabHeading,
      COPY.tabDescription,
      COPY.chartToggle,
      COPY.chartListHeading,
      COPY.listFootnote,
      COPY.noChangesInPeriod,
      COPY.chartListError,
      COPY.loadError,
      COPY.tryAgain,
      COPY.notableIncrease,
      COPY.notableDecrease,
      COPY.noNotableChange,
      COPY.deltaReady("bounce", "1.20", "2.90"),
      COPY.deltaFlat("complaint", "0.0100", "0.0120"),
      COPY.insufficient(3, 10),
      COPY.accruing("Complaint", "Nov 2, 2026"),
      COPY.pending("Oct 27, 2026, 11:00 AM"),
      COPY.grouped(3),
      COPY.truncated(130),
      COPY.timelineFooter(30),
      COPY.emptyBody(30),
      COPY.moreChanges(3),
      COPY.showChanges(4),
    ];
    const labels = [
      MARKER_LABEL.broadcastStarted("Launch", 5),
      MARKER_LABEL.broadcastStarted(null, 5),
      MARKER_LABEL.automationEnabled("Welcome"),
      MARKER_LABEL.automationEnabled(null),
      MARKER_LABEL.automationDisabled("Welcome"),
      MARKER_LABEL.automationDisabled(null),
      MARKER_LABEL.templateSaved("Receipt", 2),
      MARKER_LABEL.contactsImported(12),
      MARKER_LABEL.contactsImported(null),
      MARKER_LABEL.suppressionRemoved(),
      MARKER_LABEL.senderDefaultsChanged(),
      MARKER_LABEL.groupBroadcasts(2),
      MARKER_LABEL.groupAutomationsEnabled(2),
      MARKER_LABEL.groupAutomationsDisabled(2),
      MARKER_LABEL.groupTemplates(2),
      MARKER_LABEL.groupImports(2, 42),
      MARKER_LABEL.groupSuppressions(2),
      MARKER_LABEL.groupSenderDefaults(2),
    ];
    for (const text of [...strings, ...labels]) {
      expect(text, text).not.toMatch(causal);
    }
    expect(strings.length).toBeGreaterThan(10);
  });

  it("the causal-wording matcher rejects causal sentences (self-check)", () => {
    const causal =
      /\b(caused|causes|causing|because|due to|led to|resulted in|driven by|blame)\b/i;
    expect(causal.test("This change caused the spike.")).toBe(true);
    expect(causal.test("The rate rose because of a broadcast.")).toBe(true);
    expect(causal.test("This change happened around the same time.")).toBe(
      false
    );
  });
});
