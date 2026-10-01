// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { SesHealthDetail } from "@/hooks/use-ses-health-queries";
import { humanizeSesHealthReason } from "@/lib/ses-health-reasons";
import { HealthSummary } from "../overview/health-summary";

afterEach(cleanup);

const detail = (overrides: Partial<SesHealthDetail> = {}): SesHealthDetail => ({
  bounceRate: 0.01,
  complaintRate: 0.0001,
  quotaUsedRatio: 0.1,
  sendingEnabled: true,
  enforcementStatus: "HEALTHY",
  productionAccessEnabled: true,
  reviewStatus: null,
  reviewCaseId: null,
  max24HourSend: 50_000,
  sentLast24Hours: 5000,
  maxSendRate: 14,
  reasons: [],
  ...overrides,
});

describe("HealthSummary", () => {
  it("says 'Not checked yet' and shows no meters or Healthy for an unmeasured account", () => {
    render(
      <HealthSummary
        healthCheckedAt={null}
        healthDetail={null}
        orgSlug="acme"
        reasons={[]}
        region="us-east-1"
        status={{ level: "unknown", label: "Not checked yet", detail: null }}
      />
    );

    expect(
      screen.getByText("Not checked yet. Wraps checks every hour.")
    ).toBeInTheDocument();
    expect(screen.queryByText(/Healthy/)).not.toBeInTheDocument();
    expect(screen.queryByText("Bounce rate")).not.toBeInTheDocument();
  });

  it("shows the status label and the humanized reason when in danger", () => {
    render(
      <HealthSummary
        healthCheckedAt={new Date().toISOString()}
        healthDetail={detail({ bounceRate: 0.11, reasons: ["bounce_pause"] })}
        orgSlug="acme"
        reasons={["bounce_pause"]}
        region="us-east-1"
        status={{ level: "critical", label: "In danger", detail: null }}
      />
    );

    expect(screen.getByText("In danger")).toBeInTheDocument();
    expect(
      screen.getByText(humanizeSesHealthReason("bounce_pause"))
    ).toBeInTheDocument();
  });

  it("shows the meters and a region-labelled title when healthy", () => {
    render(
      <HealthSummary
        healthCheckedAt={new Date().toISOString()}
        healthDetail={detail()}
        orgSlug="acme"
        reasons={[]}
        region="us-east-1"
        status={{ level: "healthy", label: "Healthy", detail: null }}
      />
    );

    expect(screen.getByText("Bounce rate")).toBeInTheDocument();
    expect(screen.getByText("Complaint rate")).toBeInTheDocument();
    expect(screen.getByText("Sending health · us-east-1")).toBeInTheDocument();
    expect(screen.getByText(/^checked /)).toBeInTheDocument();
  });
});
