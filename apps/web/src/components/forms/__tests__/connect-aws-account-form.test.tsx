/**
 * Connect-success side effects fire once.
 *
 * Regression coverage for Sentry #7755732895: the form ran `onSuccess()` and
 * `posthog.capture()` during render whenever the action state was a success.
 * The settings page's `onSuccess` sets parent state (closing the dialog), the
 * form re-renders with the same success state, and it fires again — React
 * aborts with "Maximum update depth exceeded" after the account is connected.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import posthog from "posthog-js";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectAWSAccountAction } from "@/actions/aws-accounts";
import { ConnectAWSAccountForm } from "../connect-aws-account-form";

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn() },
}));

vi.mock("@/actions/aws-accounts", () => ({
  connectAWSAccountAction: vi.fn(),
}));

/**
 * Mirrors the settings page: success updates the parent's own state. The
 * update is capped so a regression fails on call counts instead of hanging
 * the worker in an unbounded render loop.
 */
function ParentThatSetsStateOnSuccess({
  onSuccess,
}: {
  onSuccess: () => void;
}) {
  const [successCount, setSuccessCount] = useState(0);
  return (
    <div>
      <span data-testid="success-count">{successCount}</span>
      <ConnectAWSAccountForm
        onSuccess={() => {
          onSuccess();
          setSuccessCount((n) => Math.min(n + 1, 5));
        }}
        organizationId="org-1"
        selfHosted={false}
      />
    </div>
  );
}

describe("ConnectAWSAccountForm success", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(connectAWSAccountAction).mockResolvedValue({
      success: true,
    } as never);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("calls onSuccess and captures the event exactly once when the parent re-renders", async () => {
    const onSuccess = vi.fn();
    render(<ParentThatSetsStateOnSuccess onSuccess={onSuccess} />);

    const submit = await screen.findByRole("button", {
      name: /connect account/i,
    });
    await userEvent.click(submit);

    await waitFor(() =>
      expect(screen.getByTestId("success-count")).toHaveTextContent("1")
    );
    // Give any runaway re-render loop a chance to show itself.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("success-count")).toHaveTextContent("1");
    expect(posthog.capture).toHaveBeenCalledTimes(1);
    expect(posthog.capture).toHaveBeenCalledWith(
      "aws_account_connected",
      expect.objectContaining({ organization_id: "org-1" })
    );
  });

  it("links to the existing account when it is already connected", async () => {
    vi.mocked(connectAWSAccountAction).mockResolvedValue({
      error: "This AWS account is already connected",
      existingAccountId: "acc-123",
      existingAccountHref: "/test-org/settings/aws-accounts/acc-123",
    } as never);
    render(<ConnectAWSAccountForm organizationId="org-1" selfHosted={false} />);

    const submit = await screen.findByRole("button", {
      name: /connect account/i,
    });
    await userEvent.click(submit);

    const link = await screen.findByRole("link", {
      name: /open the connected account/i,
    });
    expect(link.getAttribute("href")).toBe(
      "/test-org/settings/aws-accounts/acc-123"
    );
  });
});
