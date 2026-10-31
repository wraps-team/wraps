/**
 * The step after a hard bounce reads the SES suppression list live, so it says
 * what SES did with the address rather than what it was configured to do.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hubHref } from "@/lib/emails-hub";

const getSuppressedAddressMock = vi.fn();
vi.mock("@/lib/aws/ses-suppression", () => ({
  getSuppressedAddress: (...args: unknown[]) =>
    getSuppressedAddressMock(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../suppress-address-button", () => ({
  SuppressAddressButton: ({
    address,
    account,
  }: {
    address: string;
    account: { id: string };
  }) => (
    <button data-account={account.id} type="button">
      Suppress {address}
    </button>
  ),
}));

const ACCOUNT = {
  id: "acc-1",
  name: "Production",
  region: "us-east-1",
} as Parameters<
  typeof import("../suppression-step").SuppressionStep
>[0]["account"];
const BOUNCED_AT = Date.parse("2026-10-31T07:00:46.000Z");
const ADDRESS = "customer@example.com";

async function renderStep(addresses: string[] = [ADDRESS]) {
  const { SuppressionStep } = await import("../suppression-step");
  const element = await SuppressionStep({
    account: ACCOUNT,
    hardBounce: { addresses, bouncedAt: BOUNCED_AT },
    organizationId: "org-1",
    orgSlug: "acme",
  });
  return render(<>{element}</>);
}

function found(reason: "BOUNCE" | "COMPLAINT", lastUpdated: number) {
  return {
    status: "found",
    address: {
      email: ADDRESS,
      reason,
      lastUpdated: new Date(lastUpdated).toISOString(),
      awsAccountId: ACCOUNT.id,
      region: ACCOUNT.region,
    },
  };
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

describe("SuppressionStep", () => {
  it("shows the automatic suppression this bounce caused", async () => {
    getSuppressedAddressMock.mockResolvedValue(
      found("BOUNCE", BOUNCED_AT + 2000)
    );

    await renderStep();

    expect(getSuppressedAddressMock).toHaveBeenCalledWith({
      account: ACCOUNT,
      email: ADDRESS,
    });
    expect(screen.getByText("Suppressed")).toBeInTheDocument();
    expect(
      screen.getByText(/added it to your suppression list automatically/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /view suppression list/i })
    ).toHaveAttribute(
      "href",
      hubHref("acme", { tab: "deliverability", extra: { list: "suppressed" } })
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("does not credit this bounce for an entry that predates it", async () => {
    getSuppressedAddressMock.mockResolvedValue(
      found("BOUNCE", BOUNCED_AT - 86_400_000)
    );

    await renderStep();

    expect(screen.getByText("Suppressed")).toBeInTheDocument();
    expect(
      screen.getByText(/already on your SES suppression list/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/automatically/i)).toBeNull();
  });

  it("names a complaint suppression as one", async () => {
    getSuppressedAddressMock.mockResolvedValue(
      found("COMPLAINT", BOUNCED_AT + 2000)
    );

    await renderStep();

    expect(screen.getByText(/after a complaint/i)).toBeInTheDocument();
    expect(screen.queryByText(/automatically/i)).toBeNull();
  });

  it("offers to suppress an address SES did not list", async () => {
    getSuppressedAddressMock.mockResolvedValue({ status: "not_found" });

    await renderStep();

    expect(screen.getByText("Not suppressed")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: `Suppress ${ADDRESS}` })
    ).toHaveAttribute("data-account", ACCOUNT.id);
  });

  it("renders nothing when the list cannot be read", async () => {
    getSuppressedAddressMock.mockResolvedValue({ status: "denied" });

    const { container } = await renderStep();

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing, and does not throw, when the lookup fails", async () => {
    getSuppressedAddressMock.mockRejectedValue(new Error("throttled"));

    const { container } = await renderStep();

    expect(container).toBeEmptyDOMElement();
  });
});
