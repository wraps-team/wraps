import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { BatchSendWithMeta } from "@/lib/batch";
import {
  mapBatchToCampaignData,
  requiredPlanName,
  stripSelfReferencingPlaceholder,
} from "../batch-form-utils";

describe("stripSelfReferencingPlaceholder", () => {
  it("drops a value that is only the placeholder for its own variable", () => {
    expect(stripSelfReferencingPlaceholder("subject", "{{subject}}")).toBe("");
    expect(stripSelfReferencingPlaceholder("subject", "  {{ subject }} ")).toBe(
      ""
    );
    expect(
      stripSelfReferencingPlaceholder("previewText", "{{previewText}}")
    ).toBe("");
  });

  it("keeps values that reference other variables", () => {
    expect(
      stripSelfReferencingPlaceholder("subject", "Hi {{firstName}}, welcome")
    ).toBe("Hi {{firstName}}, welcome");
    expect(stripSelfReferencingPlaceholder("subject", "{{heading}}")).toBe(
      "{{heading}}"
    );
  });

  it("keeps plain values and normalizes empty input", () => {
    expect(stripSelfReferencingPlaceholder("subject", "TorBox v9.2")).toBe(
      "TorBox v9.2"
    );
    expect(stripSelfReferencingPlaceholder("subject", null)).toBe("");
    expect(stripSelfReferencingPlaceholder("subject", undefined)).toBe("");
  });
});

describe("mapBatchToCampaignData", () => {
  it("clears self-referencing subject and preview text from a saved draft", () => {
    const result = mapBatchToCampaignData({
      subject: "{{subject}}",
      previewText: "{{previewText}}",
      templateId: "tmpl_1",
    } as BatchSendWithMeta);

    expect(result.subject).toBeUndefined();
    expect(result.previewText).toBeUndefined();
    expect(result.contentType).toBe("template");
  });

  // Drafts saved before the mapper bound these to the wizard's own fields put
  // the placeholder in `subject` and the real text in `variableMappings`.
  // Dropping the placeholder without lifting that answer out loses the
  // subject on load, and the mapper then overwrites the mapping with "".
  it("lifts subject and preview text out of a legacy draft's mappings", () => {
    const result = mapBatchToCampaignData({
      subject: "{{subject}}",
      previewText: "{{previewText}}",
      templateId: "tmpl_1",
      variableMappings: [
        {
          variableName: "subject",
          source: { type: "static", value: "TorBox updated to v9.2" },
        },
        {
          variableName: "previewText",
          source: { type: "static", value: "CDN performance updates" },
        },
      ],
    } as BatchSendWithMeta);

    expect(result.subject).toBe("TorBox updated to v9.2");
    expect(result.previewText).toBe("CDN performance updates");
  });

  it("does not lift a contact-sourced mapping into the subject field", () => {
    const result = mapBatchToCampaignData({
      subject: "{{subject}}",
      templateId: "tmpl_1",
      variableMappings: [
        {
          variableName: "subject",
          source: { type: "contact", field: "firstName" },
        },
      ],
    } as BatchSendWithMeta);

    expect(result.subject).toBeUndefined();
  });

  it("preserves a real subject and preview text", () => {
    const result = mapBatchToCampaignData({
      subject: "TorBox updated to v9.2",
      previewText: "CDN performance updates and more enclosed!",
      templateId: "tmpl_1",
    } as BatchSendWithMeta);

    expect(result.subject).toBe("TorBox updated to v9.2");
    expect(result.previewText).toBe(
      "CDN performance updates and more enclosed!"
    );
  });

  it("restores variable mappings saved on the draft", () => {
    const result = mapBatchToCampaignData({
      templateId: "tmpl_1",
      variableMappings: [
        { variableName: "dashboardUrl", source: { type: "static", value: "" } },
        {
          variableName: "greeting",
          source: { type: "contact", field: "firstName" },
        },
      ],
    } as BatchSendWithMeta);

    expect(result.variableMappings).toEqual([
      { variableName: "dashboardUrl", source: { type: "static", value: "" } },
      {
        variableName: "greeting",
        source: { type: "contact", field: "firstName" },
      },
    ]);
  });

  it("restores a topic audience", () => {
    const result = mapBatchToCampaignData({
      templateId: "tmpl_1",
      audienceType: "topic",
      topicId: "topic_1",
    } as BatchSendWithMeta);

    expect(result.audienceType).toBe("topic");
    expect(result.topicId).toBe("topic_1");
  });

  it("restores a segment audience", () => {
    const result = mapBatchToCampaignData({
      templateId: "tmpl_1",
      audienceType: "segment",
      segmentId: "segment_1",
    } as BatchSendWithMeta);

    expect(result.audienceType).toBe("segment");
    expect(result.segmentId).toBe("segment_1");
  });

  it("restores raw HTML content", () => {
    const result = mapBatchToCampaignData({
      htmlContent: "<p>Hello</p>",
    } as BatchSendWithMeta);

    expect(result.contentType).toBe("html");
    expect(result.htmlContent).toBe("<p>Hello</p>");
  });

  it("restores a scheduled send as date plus time-of-day", () => {
    // Relative to now so the assertion doesn't start failing once a hardcoded
    // date falls into the past and hits the send-now fallback below.
    const scheduledFor = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    scheduledFor.setHours(14, 30, 0, 0);

    const result = mapBatchToCampaignData({
      templateId: "tmpl_1",
      scheduledFor,
    } as BatchSendWithMeta);

    expect(result.scheduleType).toBe("later");
    expect(result.scheduledDate).toEqual(scheduledFor);
    expect(result.scheduledTime).toBe("14:30");
  });

  // The date picker disables past dates, so a restored past schedule is a
  // dead end: the user cannot re-select the date they are being shown.
  it("drops a schedule that has already passed back to send-now", () => {
    const result = mapBatchToCampaignData({
      templateId: "tmpl_1",
      scheduledFor: new Date(Date.now() - 60 * 60 * 1000),
    } as BatchSendWithMeta);

    expect(result.scheduleType).toBe("now");
    expect(result.scheduledDate).toBeUndefined();
    expect(result.scheduledTime).toBeUndefined();
  });

  it("leaves an unscheduled draft on send-now", () => {
    const result = mapBatchToCampaignData({
      templateId: "tmpl_1",
      scheduledFor: null,
    } as BatchSendWithMeta);

    expect(result.scheduleType).toBe("now");
    expect(result.scheduledDate).toBeUndefined();
  });
});

describe("requiredPlanName", () => {
  it.each(["topics", "segments", "campaigns"] as const)(
    "%s unlocks on a current public plan",
    (feature) => {
      expect(requiredPlanName(feature)).toBe("Pro");
    }
  );
});

describe("batch-form lock labels", () => {
  it("never names a retired plan", () => {
    const src = readFileSync(
      fileURLToPath(new URL("../batch-form.tsx", import.meta.url)),
      "utf8"
    );
    expect(src).not.toMatch(/\b(Starter|Growth|Scale)\b/);
  });
});
