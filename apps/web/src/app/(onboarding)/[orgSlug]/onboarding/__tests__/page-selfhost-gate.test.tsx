/**
 * Onboarding page — the step-4 self-hosted gate.
 *
 * `selfHosted` is derived from the onboarding-status query, so Deploy & Connect
 * must not render until that query has resolved: an undefined or null status
 * reads as "hosted" and renders the platform CloudFormation path, which a
 * self-hosted control plane can never read.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stable identities: the page's effects depend on `searchParams`, the session
// and the organization list, so a fresh object per render re-runs them forever.
const { stableRouter, stableSearchParams, stableSession, stableOrgs } =
  vi.hoisted(() => ({
    stableRouter: { push: vi.fn() },
    stableSearchParams: new URLSearchParams("step=4"),
    stableSession: { data: { user: { id: "u1" } }, isPending: false },
    stableOrgs: {
      data: [{ id: "org-123", slug: "test-org", name: "Test Org" }],
      isPending: false,
    },
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => stableRouter,
  useSearchParams: () => stableSearchParams,
}));

vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="deploy-connect-step" />,
}));

vi.mock("@/components/loader", () => ({
  default: () => <div data-testid="loader" />,
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => stableSession,
    useListOrganizations: () => stableOrgs,
  },
}));

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("../components/billing-step", () => ({
  BillingStep: () => <div data-testid="billing-step" />,
}));

vi.mock("../components/invite-members-step", () => ({
  InviteMembersStep: () => <div data-testid="invite-members-step" />,
}));

vi.mock("../components/choose-path-step", () => ({
  ChoosePathStep: () => <div data-testid="choose-path-step" />,
}));

vi.mock("../components/step-progress", () => ({
  StepProgress: () => <div data-testid="step-progress" />,
}));

vi.mock("../components/success-step", () => ({
  SuccessStep: () => <div data-testid="success-step" />,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import OnboardingPage from "../page";

function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

async function settle() {
  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalled();
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

describe("OnboardingPage — step 4 self-hosted gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("holds the loader while the onboarding status is still in flight", async () => {
    mockFetch.mockReturnValue(new Promise(() => undefined));

    renderWithQueryClient(
      <OnboardingPage params={Promise.resolve({ orgSlug: "test-org" })} />
    );
    await settle();

    expect(screen.getByTestId("loader")).toBeInTheDocument();
    expect(screen.queryByTestId("deploy-connect-step")).not.toBeInTheDocument();
  });

  it("holds the loader when the onboarding status fetch fails", async () => {
    mockFetch.mockResolvedValue({ ok: false });

    renderWithQueryClient(
      <OnboardingPage params={Promise.resolve({ orgSlug: "test-org" })} />
    );
    await settle();

    expect(screen.getByTestId("loader")).toBeInTheDocument();
    expect(screen.queryByTestId("deploy-connect-step")).not.toBeInTheDocument();
  });
});
