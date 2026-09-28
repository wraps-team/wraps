// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SesPlanCard } from "../ses-plan-card";

afterEach(cleanup);

type HealthDetail = NonNullable<
  Parameters<typeof SesPlanCard>[0]["account"]["healthDetail"]
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

describe("SesPlanCard", () => {
  it("renders 'not checked yet' when healthDetail is null", () => {
    render(
      <SesPlanCard
        account={{ region: "us-east-1", healthDetail: null, features: null }}
      />
    );

    expect(screen.getByText(/Not checked yet/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders 'not checked yet' when healthDetail has no sesPricingPlan", () => {
    render(
      <SesPlanCard
        account={{
          region: "us-east-1",
          healthDetail: healthDetail(),
          features: null,
        }}
      />
    );

    expect(screen.getByText(/Not checked yet/)).toBeInTheDocument();
  });

  it("renders 'no plan reported' when current and next are both null", () => {
    render(
      <SesPlanCard
        account={{
          region: "us-east-1",
          healthDetail: healthDetail({
            sesPricingPlan: { current: null, next: null },
          }),
          features: null,
        }}
      />
    );

    expect(
      screen.getByText(/AWS reported no SES pricing plan/)
    ).toBeInTheDocument();
  });

  it("prices 300,000 emails/mo on ESSENTIALS and shows the à la carte switch hint", () => {
    render(
      <SesPlanCard
        account={{
          region: "us-east-1",
          healthDetail: healthDetail({
            sentLast24Hours: 10_000,
            sesPricingPlan: { current: "ESSENTIALS", next: null },
          }),
          features: null,
        }}
      />
    );

    expect(screen.getByText("$30.00")).toBeInTheDocument();
    expect(screen.getByText("$48.00")).toBeInTheDocument();
    expect(screen.getByText("$171.00")).toBeInTheDocument();
    expect(screen.getByText("$569.00")).toBeInTheDocument();
    expect(screen.getByText("$216.00", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Cheapest at this volume")).toBeInTheDocument();
    expect(
      screen.getByText("wraps email plan --region us-east-1 --set NONE")
    ).toBeInTheDocument();
    expect(
      screen.getByText(/If AWS put this account on Essentials by default/)
    ).toBeInTheDocument();
  });

  it("does not render a --set NONE command when the account is already on à la carte", () => {
    render(
      <SesPlanCard
        account={{
          region: "us-east-1",
          healthDetail: healthDetail({
            sentLast24Hours: 10_000,
            sesPricingPlan: { current: "NONE", next: null },
          }),
          features: null,
        }}
      />
    );

    expect(screen.queryByText(/--set NONE/)).not.toBeInTheDocument();
  });

  it("shows per-1,000 rates with no dollar totals when there were no sends", () => {
    render(
      <SesPlanCard
        account={{
          region: "us-east-1",
          healthDetail: healthDetail({
            sentLast24Hours: 0,
            sesPricingPlan: { current: "ESSENTIALS", next: null },
          }),
          features: null,
        }}
      />
    );

    expect(screen.queryByText("$48.00")).not.toBeInTheDocument();
    expect(
      screen.getByText(/No sends in the last 24 hours/)
    ).toBeInTheDocument();
    expect(screen.getByText("$0.16")).toBeInTheDocument();
  });

  it("shows the next-cycle change only when next differs from current", () => {
    const { rerender } = render(
      <SesPlanCard
        account={{
          region: "us-east-1",
          healthDetail: healthDetail({
            sesPricingPlan: { current: "ESSENTIALS", next: "NONE" },
          }),
          features: null,
        }}
      />
    );

    expect(
      screen.getByText(
        /Changes to À la carte at the start of the next billing cycle/
      )
    ).toBeInTheDocument();

    rerender(
      <SesPlanCard
        account={{
          region: "us-east-1",
          healthDetail: healthDetail({
            sesPricingPlan: { current: "PRO", next: "PRO" },
          }),
          features: null,
        }}
      />
    );

    expect(screen.queryByText(/Changes to/)).not.toBeInTheDocument();
  });

  it("lists included PRO features and the dedicated IP count", () => {
    render(
      <SesPlanCard
        account={{
          region: "us-east-1",
          healthDetail: healthDetail({
            sesPricingPlan: { current: "PRO", next: null },
          }),
          features: { email: { dedicatedIpCount: 0 } },
        }}
      />
    );

    expect(screen.getByText(/Managed dedicated IPs/)).toBeInTheDocument();
    expect(screen.getByText(/2,500 validations per month/)).toBeInTheDocument();
    expect(
      screen.getByText("Dedicated IPs in this Region: 0")
    ).toBeInTheDocument();
    expect(screen.getByText(/AWS turns none of these on/)).toBeInTheDocument();
  });

  it('never renders a bare "Pro plan"', () => {
    render(
      <SesPlanCard
        account={{
          region: "us-east-1",
          healthDetail: healthDetail({
            sentLast24Hours: 10_000,
            sesPricingPlan: { current: "PRO", next: null },
          }),
          features: { email: { dedicatedIpCount: 1 } },
        }}
      />
    );

    expect(document.body.textContent).not.toMatch(/Pro plan\b/);
  });
});
