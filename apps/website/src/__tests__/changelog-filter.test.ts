import { describe, expect, it } from "vitest";
import {
  matchesTag,
  parseTagParam,
  tagOptions,
  withTagParam,
} from "@/app/changelog/filter";
import { releases, TAG_LABELS } from "@/app/changelog/releases";

describe("changelog filter", () => {
  describe("tagOptions", () => {
    const labels = { cli: "CLI", api: "API", sdk: "SDK" };

    it("counts entries per surface, in label order", () => {
      const options = tagOptions(labels, [
        { tags: ["api", "cli"] },
        { tags: ["cli"] },
      ]);
      expect(options).toEqual([
        { tag: "cli", label: "CLI", count: 2 },
        { tag: "api", label: "API", count: 1 },
      ]);
    });

    it("leaves out a surface nothing is tagged with", () => {
      const options = tagOptions(labels, [{ tags: ["cli"] }]);
      expect(options.map((option) => option.tag)).not.toContain("sdk");
    });

    it("offers a chip for every surface the real entries use", () => {
      const used = new Set(releases.flatMap((release) => release.tags));
      const offered = tagOptions(TAG_LABELS, releases).map((o) => o.tag);
      expect(new Set(offered)).toEqual(used);
    });
  });

  describe("parseTagParam", () => {
    const known = ["cli", "api"] as const;

    it("reads a known surface", () => {
      expect(parseTagParam("?tag=api", known)).toBe("api");
    });

    it("ignores an unknown surface", () => {
      expect(parseTagParam("?tag=nope", known)).toBeNull();
    });

    it("returns null when the parameter is absent", () => {
      expect(parseTagParam("", known)).toBeNull();
      expect(parseTagParam("?utm_source=x", known)).toBeNull();
    });
  });

  describe("matchesTag", () => {
    it("shows every entry when nothing is selected", () => {
      expect(matchesTag(["cli"], null)).toBe(true);
    });

    it("keeps an entry that carries the selected surface among several", () => {
      expect(matchesTag(["dashboard", "cli", "iac"], "cli")).toBe(true);
    });

    it("drops an entry that does not carry it", () => {
      expect(matchesTag(["dashboard"], "cli")).toBe(false);
    });
  });

  describe("withTagParam", () => {
    it("sets the parameter", () => {
      expect(withTagParam("", "cli")).toBe("?tag=cli");
    });

    it("replaces an existing selection", () => {
      expect(withTagParam("?tag=api", "cli")).toBe("?tag=cli");
    });

    it("clears the parameter and the query string with it", () => {
      expect(withTagParam("?tag=cli", null)).toBe("");
    });

    it("leaves other parameters alone", () => {
      expect(withTagParam("?utm_source=x", "cli")).toBe(
        "?utm_source=x&tag=cli"
      );
      expect(withTagParam("?utm_source=x&tag=cli", null)).toBe("?utm_source=x");
    });
  });
});
