import { describe, expect, it } from "vitest";
import { scoreAnswerShaped } from "../check-answer-shaped.js";

/** Builds a derived-markdown fixture in the same shape deriveMarkdownFromHtml produces. */
function doc(title: string, body: string): string {
  return `# ${title}\n\nSource: https://wraps.dev/example\n\n${body}\n`;
}

describe("scoreAnswerShaped", () => {
  it("scores 1.0 when every content term of the query appears in the first 100 words", () => {
    const body = `Mailgun and Wraps differ most on hipaa compliance: Wraps runs in your own AWS account, so you sign the BAA yourself. ${"filler ".repeat(90)}`;
    const { coverage, missing } = scoreAnswerShaped(
      doc("Mailgun vs Wraps", body),
      "mailgun vs wraps hipaa compliance"
    );

    expect(coverage).toBe(1);
    expect(missing).toEqual([]);
  });

  it("scores below 1.0 and reports the later position when a distinguishing term only appears at word 150", () => {
    const filler = "word ".repeat(149);
    const body = `${filler}hipaa is the term this page buries.`;
    const { coverage, missing } = scoreAnswerShaped(
      doc("Mailgun vs Wraps", body),
      "mailgun vs wraps hipaa compliance"
    );

    expect(coverage).toBeLessThan(1);
    const hipaaFinding = missing.find((m) => m.term === "hipaa");
    expect(hipaaFinding).toBeDefined();
    expect(hipaaFinding?.firstWordIndex).toBeGreaterThan(100);
  });

  it("ignores stopwords — a query padded with them scores the same as its content terms alone", () => {
    const body = `Suppression lists remove bad addresses before the next send. ${"filler ".repeat(90)}`;
    const bare = scoreAnswerShaped(
      doc("Suppression Lists", body),
      "suppression lists"
    );
    const padded = scoreAnswerShaped(
      doc("Suppression Lists", body),
      "what is suppression lists"
    );

    expect(padded.coverage).toBe(bare.coverage);
    expect(padded.coverage).toBe(1);
    expect(padded.missing).toEqual([]);
  });

  it("matches case-insensitively and by substring — 'RETENTION' matches 'data-retention.'", () => {
    const body = `Everything about data-retention. policies lives on this page. ${"filler ".repeat(90)}`;
    const { coverage, missing } = scoreAnswerShaped(
      doc("Resend vs Wraps", body),
      "RETENTION"
    );

    expect(coverage).toBe(1);
    expect(missing).toEqual([]);
  });
});
