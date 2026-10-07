import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A DLQ alarm on ApproximateNumberOfMessagesVisible only works for a DLQ
// nobody drains. The batch and workflow DLQs each have a Lambda consumer that
// moves a message in-flight within seconds and deletes it, so the visible
// count almost never reads >= 1 at the 1-minute sample and the alarm stays
// silent while jobs are dying. Those four alarms (managed + self-host) count
// arrivals instead: every message landing in a consumed DLQ is received by its
// consumer exactly once, so Sum(NumberOfMessagesReceived) >= 1 is the signal.
// (NumberOfMessagesSent is not usable: redrive-policy moves are not counted.)
// The marketplace DLQ has no consumer, so visible-count is correct there.
const infra = (name: string) =>
  readFileSync(new URL(`../infra/${name}`, import.meta.url), "utf-8");

function alarmBlock(source: string, name: string): string {
  const start = source.indexOf(`new aws.cloudwatch.MetricAlarm("${name}"`);
  if (start < 0) {
    throw new Error(`${name} not found`);
  }
  const end = source.indexOf("});", start);
  return source.slice(start, end);
}

const alarms = infra("alarms.ts");
const selfhost = infra("selfhost.config.ts");

describe("consumed DLQ alarms count arrivals", () => {
  const cases: [string, string][] = [
    ["WorkflowDlqAlarm", alarms],
    ["BatchDlqAlarm", alarms],
    ["SelfhostWorkflowDlqAlarm", selfhost],
    ["SelfhostBatchDlqAlarm", selfhost],
  ];

  for (const [name, source] of cases) {
    it(`${name} uses Sum(NumberOfMessagesReceived)`, () => {
      const block = alarmBlock(source, name);
      expect(block).toContain('metricName: "NumberOfMessagesReceived"');
      expect(block).toContain('statistic: "Sum"');
    });
  }

  it("MarketplaceDlqAlarm (no consumer) keeps the visible-count metric", () => {
    expect(alarmBlock(alarms, "MarketplaceDlqAlarm")).toContain(
      "ApproximateNumberOfMessagesVisible"
    );
  });
});
