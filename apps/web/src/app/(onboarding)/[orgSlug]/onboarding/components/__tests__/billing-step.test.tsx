/**
 * BillingStep tracking tests — verifies canonical step/step_name keys and
 * that onboarding_step_completed fires correctly for both free and paid paths.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks — must use vi.hoisted so they're initialized before vi.mock factories run
const { mockCapture, mockCreateFreeSubscription, mockToastError } = vi.hoisted(
  () => ({
    mockCapture: vi.fn(),
    mockCreateFreeSubscription: vi.fn(),
    mockToastError: vi.fn(),
  })
);

vi.mock("posthog-js", () => ({
  default: { capture: mockCapture },
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ orgSlug: "test-org" }),
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock("@/actions/subscriptions", () => ({
  createFreeSubscription: mockCreateFreeSubscription,
}));

vi.mock("sonner", () => ({
  toast: {
    error: mockToastError,
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    subscription: {
      upgrade: vi.fn(() => Promise.resolve({ data: {}, error: null })),
    },
  },
}));

// Stub heavy sub-components to keep tests focused
vi.mock("@/components/billing-toggle", () => ({
  BillingToggle: ({
    onChange,
    value,
  }: {
    onChange: (v: string) => void;
    value: string;
  }) => (
    <button
      data-testid="billing-toggle"
      onClick={() => onChange("annual")}
      type="button"
    >
      interval:{value}
    </button>
  ),
}));

vi.mock("@/components/plan-selector", () => ({
  PlanSelector: ({
    onSelectPlan,
    selectedPlan,
  }: {
    onSelectPlan: (p: string) => void;
    selectedPlan: string;
  }) => (
    <div data-testid="plan-selector">
      <span data-testid="selected-plan">{selectedPlan}</span>
      <button
        data-testid="select-starter"
        onClick={() => onSelectPlan("starter")}
        type="button"
      >
        Select Starter
      </button>
    </div>
  ),
}));

vi.mock("@wraps/ui/components/ui/panel", () => ({
  Panel: ({
    label,
    description,
    children,
  }: {
    label: React.ReactNode;
    description?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <section>
      <div>{label}</div>
      {description ? <p>{description}</p> : null}
      {children}
    </section>
  ),
  PanelTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    loading,
    type,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
    type?: string;
    [key: string]: unknown;
  }) => (
    <button
      disabled={disabled || loading}
      onClick={onClick}
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      type={(type as any) || "button"}
      {...props}
    >
      {children}
    </button>
  ),
}));

vi.mock("lucide-react", () => ({
  CreditCardIcon: () => <svg data-testid="credit-card-icon" />,
  ZapIcon: () => <svg data-testid="zap-icon" />,
}));

import { BillingStep } from "../billing-step";

describe("BillingStep — tracking", () => {
  const defaultProps = {
    onNext: vi.fn(),
    onBack: vi.fn(),
    organizationId: "org-123",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateFreeSubscription.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    cleanup();
  });

  it("fires onboarding_step_completed with canonical keys after free-tier subscription succeeds", async () => {
    render(<BillingStep {...defaultProps} />);

    // Default plan is "free" — click the continue button
    const continueBtn = screen.getByText("Continue with Free");
    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(mockCapture).toHaveBeenCalledWith(
        "onboarding_step_completed",
        expect.objectContaining({
          step: 1,
          step_name: "Choose Plan",
          plan: "free",
        })
      );
    });
  });

  it("calls onNext after free-tier step_completed fires", async () => {
    const onNext = vi.fn();
    render(<BillingStep {...defaultProps} onNext={onNext} />);

    fireEvent.click(screen.getByText("Continue with Free"));

    await waitFor(() => {
      expect(onNext).toHaveBeenCalledTimes(1);
    });
  });

  it("does not fire onboarding_step_completed when createFreeSubscription fails", async () => {
    mockCreateFreeSubscription.mockResolvedValue({
      success: false,
      error: "Payment failed",
    });

    render(<BillingStep {...defaultProps} />);
    fireEvent.click(screen.getByText("Continue with Free"));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith("Payment failed");
    });

    const completedCalls = mockCapture.mock.calls.filter(
      ([event]) => event === "onboarding_step_completed"
    );
    expect(completedCalls).toHaveLength(0);
  });

  it("never uses the old step_name Billing on any captured event", async () => {
    render(<BillingStep {...defaultProps} />);

    // Trigger free tier continue
    fireEvent.click(screen.getByText("Continue with Free"));

    await waitFor(() => {
      expect(mockCapture).toHaveBeenCalled();
    });

    for (const [, props] of mockCapture.mock.calls) {
      expect(props?.step_name).not.toBe("Billing");
    }
  });

  it("fires onboarding_plan_selected with canonical step/step_name when plan changes", () => {
    render(<BillingStep {...defaultProps} />);

    fireEvent.click(screen.getByTestId("select-starter"));

    expect(mockCapture).toHaveBeenCalledWith(
      "onboarding_plan_selected",
      expect.objectContaining({
        step: 1,
        step_name: "Choose Plan",
      })
    );
  });

  it("fires onboarding_step_completed before Stripe redirect on paid plan", async () => {
    render(<BillingStep {...defaultProps} />);

    // Switch to a paid plan
    fireEvent.click(screen.getByTestId("select-starter"));

    // Find the "Subscribe to …" button and click it
    const subscribeBtn = await screen.findByText(/^Subscribe to/);
    fireEvent.click(subscribeBtn);

    await waitFor(() => {
      expect(mockCapture).toHaveBeenCalledWith(
        "onboarding_step_completed",
        expect.objectContaining({
          step: 1,
          step_name: "Choose Plan",
          plan: "starter",
        })
      );
    });
  });
});
