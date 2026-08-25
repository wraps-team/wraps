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
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

// The marker echoes the props it was handed: the one line that joins the
// status query to the step — `selfHosted={isSelfHosted}` — is only observable
// here, because the real step is behind next/dynamic.
vi.mock("next/dynamic", () => ({
  default: () => (props: { selfHosted?: boolean }) => (
    <div
      data-self-hosted={String(props.selfHosted)}
      data-testid="deploy-connect-step"
    />
  ),
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

  it("shows a recoverable error instead of a forever-spinner when the onboarding status fetch fails", async () => {
    mockFetch.mockResolvedValue({ ok: false });

    renderWithQueryClient(
      <OnboardingPage params={Promise.resolve({ orgSlug: "test-org" })} />
    );
    await settle();

    // Fail CLOSED is still the requirement: the step must never render
    // without a resolved status.
    expect(screen.queryByTestId("deploy-connect-step")).not.toBeInTheDocument();

    // ...but the terminal state has to be visible and escapable. The query is
    // settled (retry: false, refetchOnWindowFocus: false), so a bare spinner
    // here spins forever, announces nothing, and offers no way out.
    expect(screen.queryByTestId("loader")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /couldn't check your workspace settings/i
    );
    expect(
      screen.getByRole("button", { name: /try again/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  });

  it("recovers the step when the user retries and the status succeeds", async () => {
    mockFetch.mockResolvedValue({ ok: false });

    renderWithQueryClient(
      <OnboardingPage params={Promise.resolve({ orgSlug: "test-org" })} />
    );
    await settle();

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ hasActiveSubscription: true, selfHosted: true }),
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    await waitFor(() => {
      expect(screen.getByTestId("deploy-connect-step")).toHaveAttribute(
        "data-self-hosted",
        "true"
      );
    });
  });
});

describe("OnboardingPage — step 4 hands the real status down", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("passes selfHosted=true down when the status says the org is self-hosted", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ hasActiveSubscription: true, selfHosted: true }),
    });

    renderWithQueryClient(
      <OnboardingPage params={Promise.resolve({ orgSlug: "test-org" })} />
    );
    await settle();

    // A hardcoded or mis-wired `selfHosted` here offers a self-hosted org the
    // platform CloudFormation card, whose stack trusts platform account
    // 905130073023 and posts to api.wraps.dev — an account their own control
    // plane never sees.
    expect(screen.getByTestId("deploy-connect-step")).toHaveAttribute(
      "data-self-hosted",
      "true"
    );
  });

  it("passes selfHosted=false down when the status says the org is hosted", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ hasActiveSubscription: true, selfHosted: false }),
    });

    renderWithQueryClient(
      <OnboardingPage params={Promise.resolve({ orgSlug: "test-org" })} />
    );
    await settle();

    expect(screen.getByTestId("deploy-connect-step")).toHaveAttribute(
      "data-self-hosted",
      "false"
    );
  });
});

describe("OnboardingPage — step 4 gate after the step has mounted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps Deploy & Connect mounted when a later status refetch fails", async () => {
    // First resolve: status is good, so the step renders and starts building
    // its local state (webhook secret, selected method, typed ARN).
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ hasActiveSubscription: true, selfHosted: false }),
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <OnboardingPage params={Promise.resolve({ orgSlug: "test-org" })} />
      </QueryClientProvider>
    );
    await settle();

    expect(screen.getByTestId("deploy-connect-step")).toBeInTheDocument();

    // Mid-flow refetch fails (laptop sleep + reconnect, or a 500 from the
    // status route). The step must not be torn down: unmounting it destroys
    // the webhook secret already baked into the deployed CloudFormation stack.
    mockFetch.mockResolvedValue({ ok: false });

    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ["onboarding-status", "test-org"],
      });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(screen.getByTestId("deploy-connect-step")).toBeInTheDocument();
  });
});
