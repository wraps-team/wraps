/**
 * Assistant tool renderer tests
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ToolUIPart } from "ai";
import { afterEach, describe, expect, it } from "vitest";
import {
  EmailMetricsCard,
  RecentSendsList,
  SetupStatusCard,
} from "@/components/assistant/tool-renderers";

afterEach(() => {
  cleanup();
});

function toolPart(overrides: Partial<ToolUIPart>): ToolUIPart {
  return {
    type: "tool-get_setup_status",
    toolCallId: "call-1",
    state: "output-available",
    input: {},
    output: {},
    ...overrides,
  } as ToolUIPart;
}

describe("SetupStatusCard", () => {
  it("renders the sandbox warning text when sandboxStatus is true", () => {
    const part = toolPart({
      output: {
        hasAwsAccount: true,
        hasPlatformConnection: true,
        hasVerifiedDomain: true,
        verifiedDomains: ["example.com"],
        hasSentEmail: true,
        emailCount: 5,
        sandboxStatus: true,
        awsRegion: "us-east-1",
        domainCount: 1,
      },
    });
    render(<SetupStatusCard part={part} />);
    expect(
      screen.getByText("SES sandbox — sends only reach verified recipients.")
    ).toBeInTheDocument();
  });

  it("renders the fallback status line and never paints unvalidated output", () => {
    const part = toolPart({ output: { nonsense: 1 } });
    render(<SetupStatusCard part={part} />);
    expect(screen.getByText(/get_setup_status/)).toBeInTheDocument();
    expect(screen.queryByText(/nonsense/)).not.toBeInTheDocument();
  });
});

describe("EmailMetricsCard", () => {
  it("renders — for bounce rate when totals.sent is 0, no NaN or Infinity", () => {
    const part = toolPart({
      type: "tool-get_email_metrics",
      output: {
        days: 7,
        totals: {
          sent: 0,
          delivered: 0,
          bounced: 0,
          complaints: 0,
          opens: 0,
          clicks: 0,
          renderingFailures: 0,
        },
        daily: [],
      },
    });
    const { container } = render(<EmailMetricsCard part={part} />);
    expect(container.textContent).not.toMatch(/NaN/);
    expect(container.textContent).not.toMatch(/Infinity/);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("renders 3.0% for a 30/1000 bounce rate", () => {
    const part = toolPart({
      type: "tool-get_email_metrics",
      output: {
        days: 7,
        totals: {
          sent: 1000,
          delivered: 950,
          bounced: 30,
          complaints: 0,
          opens: 0,
          clicks: 0,
          renderingFailures: 0,
        },
        daily: [],
      },
    });
    render(<EmailMetricsCard part={part} />);
    expect(screen.getByText("3.0%")).toBeInTheDocument();
  });
});

describe("RecentSendsList", () => {
  it("renders at most 10 rows given 50", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      subject: `Subject ${i}`,
      eventType: "delivered",
      timestampFormatted: new Date().toISOString(),
    }));
    const part = toolPart({
      type: "tool-list_recent_sends",
      output: rows,
    });
    render(<RecentSendsList part={part} />);
    expect(screen.getAllByRole("listitem").length).toBeLessThanOrEqual(10);
  });
});
