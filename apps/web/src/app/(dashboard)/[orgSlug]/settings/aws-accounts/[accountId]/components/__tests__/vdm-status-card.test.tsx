// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { VdmStatusCard } from "../vdm-status-card";

afterEach(cleanup);

type HealthDetail = NonNullable<
  Parameters<typeof VdmStatusCard>[0]["account"]["healthDetail"]
>;

function healthDetail(overrides: Partial<HealthDetail> = {}): HealthDetail {
  return {
    bounceRate: null,
    complaintRate: null,
    quotaUsedRatio: null,
    sendingEnabled: true,
    enforcementStatus: "HEALTHY",
    productionAccessEnabled: true,
    reviewStatus: null,
    reviewCaseId: null,
    max24HourSend: null,
    sentLast24Hours: null,
    maxSendRate: null,
    reasons: [],
    ...overrides,
  };
}

describe("VdmStatusCard", () => {
  it("renders nothing when healthDetail is null", () => {
    const { container } = render(
      <VdmStatusCard account={{ region: "us-east-1", healthDetail: null }} />
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when vdm is absent from healthDetail", () => {
    const { container } = render(
      <VdmStatusCard
        account={{ region: "us-east-1", healthDetail: healthDetail() }}
      />
    );

    expect(container.innerHTML).toBe("");
  });

  it("on ESSENTIALS with VDM off shows the included-but-off text and the enable command", () => {
    render(
      <VdmStatusCard
        account={{
          region: "us-east-1",
          healthDetail: healthDetail({
            sesPricingPlan: { current: "ESSENTIALS", next: null },
            vdm: {
              enabled: false,
              engagementMetrics: false,
              optimizedSharedDelivery: false,
              recommendations: { status: "vdm_disabled" },
            },
          }),
        }}
      />
    );

    expect(
      screen.getByText(/included in your Essentials plan/)
    ).toBeInTheDocument();
    expect(screen.getByText(/switched off/)).toBeInTheDocument();
    expect(
      screen.getByText("wraps email vdm --enable --region us-east-1")
    ).toBeInTheDocument();
  });

  it("shows the ses:ListRecommendations permission text and an #iam-role link", () => {
    render(
      <VdmStatusCard
        account={{
          region: "us-east-1",
          healthDetail: healthDetail({
            sesPricingPlan: { current: "ESSENTIALS", next: null },
            vdm: {
              enabled: true,
              engagementMetrics: true,
              optimizedSharedDelivery: true,
              recommendations: { status: "permission_missing" },
            },
          }),
        }}
      />
    );

    expect(screen.getByText(/ses:ListRecommendations/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Update the IAM role" });
    expect(link).toHaveAttribute("href", "#iam-role");
  });

  it("shows 'No open recommendations.' when status is ok with an empty list", () => {
    render(
      <VdmStatusCard
        account={{
          region: "us-east-1",
          healthDetail: healthDetail({
            sesPricingPlan: { current: "ESSENTIALS", next: null },
            vdm: {
              enabled: true,
              engagementMetrics: true,
              optimizedSharedDelivery: true,
              recommendations: { status: "ok", open: [], truncated: false },
            },
          }),
        }}
      />
    );

    expect(screen.getByText("No open recommendations.")).toBeInTheDocument();
  });

  it("shows the plan-unknown sentence when sesPricingPlan is absent", () => {
    render(
      <VdmStatusCard
        account={{
          region: "us-east-1",
          healthDetail: healthDetail({
            vdm: {
              enabled: false,
              engagementMetrics: false,
              optimizedSharedDelivery: false,
              recommendations: { status: "vdm_disabled" },
            },
          }),
        }}
      />
    );

    expect(
      screen.getByText(/Could not read your SES plan/)
    ).toBeInTheDocument();
  });

  it("shows the plan-unknown sentence, without throwing, for a raw plan value this build doesn't recognise", () => {
    expect(() =>
      render(
        <VdmStatusCard
          account={{
            region: "us-east-1",
            healthDetail: healthDetail({
              sesPricingPlan: { current: "SOMETHING_NEW", next: null },
              vdm: {
                enabled: false,
                engagementMetrics: false,
                optimizedSharedDelivery: false,
                recommendations: { status: "vdm_disabled" },
              },
            }),
          }}
        />
      )
    ).not.toThrow();

    expect(
      screen.getByText(/Could not read your SES plan/)
    ).toBeInTheDocument();
  });

  it("on NONE (à la carte) with VDM off shows the add-on sentence with the entitlement price", () => {
    render(
      <VdmStatusCard
        account={{
          region: "us-east-1",
          healthDetail: healthDetail({
            sesPricingPlan: { current: "NONE", next: null },
            vdm: {
              enabled: false,
              engagementMetrics: false,
              optimizedSharedDelivery: false,
              recommendations: { status: "vdm_disabled" },
            },
          }),
        }}
      />
    );

    expect(screen.getByText(/billed as an add-on/)).toBeInTheDocument();
    expect(
      screen.getByText(/Charged at the à la carte VDM rate/)
    ).toBeInTheDocument();
  });
});
