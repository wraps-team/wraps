/**
 * AddDomainForm — the AWS-account selector rule (243/244/245's read/create
 * gap this plan closes).
 *
 * With one AWS account the selector must not render at all — a single-option
 * select is noise, and the form must still submit against that one account
 * implicitly. With more than one, the selector must render and the chosen
 * account id must reach `addSendingDomain`.
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
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockListAWSAccounts = vi.fn();
vi.mock("@/actions/aws-accounts", () => ({
  listAWSAccounts: (...args: unknown[]) => mockListAWSAccounts(...args),
}));

const mockAddSendingDomain = vi.fn();
vi.mock("@/actions/domains", () => ({
  addSendingDomain: (...args: unknown[]) => mockAddSendingDomain(...args),
}));

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

// Renders the real Select as a plain <select> so choosing an option is a
// single fireEvent.change instead of driving Radix's popover/pointer-capture
// machinery in jsdom — the same trade the segment-builder tests make.
vi.mock("@wraps/ui/components/ui/select", () => ({
  Select: ({
    children,
    onValueChange,
    value,
  }: {
    children: ReactNode;
    onValueChange: (value: string) => void;
    value?: string;
  }) => (
    <select
      aria-label="AWS account"
      onChange={(e) => onValueChange(e.target.value)}
      value={value}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}));

import { AddDomainForm } from "../add-domain-form";

const oneAccount = [{ id: "aws-account-1", name: "Production" }];
const twoAccounts = [
  { id: "aws-account-1", name: "Production" },
  { id: "aws-account-2", name: "Staging" },
];

describe("AddDomainForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders no account selector when the org has exactly one AWS account", async () => {
    mockListAWSAccounts.mockResolvedValue({
      success: true,
      accounts: oneAccount,
    });

    render(<AddDomainForm organizationId="org-1" />);

    await waitFor(() => {
      expect(mockListAWSAccounts).toHaveBeenCalledWith("org-1");
    });

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Domain")).toBeInTheDocument();
  });

  it("submits the sole account implicitly when there is no selector", async () => {
    mockListAWSAccounts.mockResolvedValue({
      success: true,
      accounts: oneAccount,
    });
    mockAddSendingDomain.mockResolvedValue({
      success: true,
      domain: "example.com",
      alreadyExisted: false,
    });

    render(<AddDomainForm organizationId="org-1" />);

    await waitFor(() => {
      expect(mockListAWSAccounts).toHaveBeenCalled();
    });

    fireEvent.change(screen.getByLabelText("Domain"), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add domain/i }));

    await waitFor(() => {
      expect(mockAddSendingDomain).toHaveBeenCalledWith(
        "org-1",
        "aws-account-1",
        "example.com"
      );
    });
  });

  it("renders an account selector when the org has more than one AWS account, and submits the chosen id", async () => {
    mockListAWSAccounts.mockResolvedValue({
      success: true,
      accounts: twoAccounts,
    });
    mockAddSendingDomain.mockResolvedValue({
      success: true,
      domain: "example.com",
      alreadyExisted: false,
    });

    render(<AddDomainForm organizationId="org-1" />);

    await waitFor(() => {
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("combobox", { name: /aws account/i }), {
      target: { value: "aws-account-2" },
    });
    fireEvent.change(screen.getByLabelText("Domain"), {
      target: { value: "example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add domain/i }));

    await waitFor(() => {
      expect(mockAddSendingDomain).toHaveBeenCalledWith(
        "org-1",
        "aws-account-2",
        "example.com"
      );
    });
  });
});
