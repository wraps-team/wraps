/**
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCapture,
  mockPush,
  mockSearchParams,
  mockToastError,
  mockUseListOrganizations,
  mockUseSession,
} = vi.hoisted(() => ({
  mockCapture: vi.fn(),
  mockPush: vi.fn(),
  mockSearchParams: {
    current: new URLSearchParams(),
  },
  mockToastError: vi.fn(),
  mockUseListOrganizations: vi.fn(),
  mockUseSession: vi.fn(),
}));

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockCliDeployConnectStep() {
      return <div data-testid="cli-deploy-connect-step">Deploy & Connect</div>;
    },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams.current,
}));

vi.mock("posthog-js", () => ({
  default: { capture: mockCapture },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: mockToastError,
  },
}));

vi.mock("@/components/loader", () => ({
  default: () => <div data-testid="loader">Loading</div>,
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => mockUseSession(),
    useListOrganizations: () => mockUseListOrganizations(),
  },
}));

vi.mock("./components/billing-step", () => ({
  BillingStep: () => <div data-testid="billing-step">Billing step</div>,
}));

vi.mock("./components/choose-path-step", () => ({
  ChoosePathStep: () => (
    <div data-testid="choose-path-step">Choose path step</div>
  ),
}));

vi.mock("./components/invite-members-step", () => ({
  InviteMembersStep: () => (
    <div data-testid="invite-members-step">Invite members step</div>
  ),
}));

vi.mock("./components/step-progress", () => ({
  StepProgress: () => <div data-testid="step-progress" />,
}));

vi.mock("./components/success-step", () => ({
  SuccessStep: () => <div data-testid="success-step">Success step</div>,
}));

import OnboardingPage from "./page";

const organization = {
  id: "org-1",
  name: "Acme",
  slug: "acme",
};

function createJsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status: 200,
    ...init,
  });
}

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <OnboardingPage
        params={Promise.resolve({ orgSlug: organization.slug })}
      />
    </QueryClientProvider>
  );
}

describe("OnboardingPage", () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockCapture.mockReset();
    mockToastError.mockReset();
    mockUseSession.mockReset();
    mockUseListOrganizations.mockReset();
    mockSearchParams.current = new URLSearchParams();
    localStorage.clear();

    mockUseSession.mockReturnValue({
      data: {
        user: {
          id: "user-1",
        },
      },
      isPending: false,
    });
    mockUseListOrganizations.mockReturnValue({
      data: [organization],
      isPending: false,
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("auto-completes the start_building path before deploy UI renders", async () => {
    localStorage.setItem(`onboarding_step_${organization.slug}`, "4");
    localStorage.setItem(
      `onboarding_path_${organization.slug}`,
      "start_building"
    );

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getRequestUrl(input);

        if (url === `/api/${organization.slug}/onboarding/status`) {
          return createJsonResponse({
            completed: false,
            hasActiveSubscription: false,
          });
        }

        if (
          url === `/api/${organization.slug}/onboarding/complete` &&
          init?.method === "POST"
        ) {
          return createJsonResponse({ success: true });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }
    );

    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    expect(screen.getByTestId("loader")).toBeInTheDocument();
    expect(
      screen.queryByTestId("cli-deploy-connect-step")
    ).not.toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/${organization.slug}/onboarding/complete`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ path: "start_building" }),
        })
      );
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(`/${organization.slug}`);
    });
  });

  it("shows an error toast and stays on the page when auto-complete fails", async () => {
    localStorage.setItem(`onboarding_step_${organization.slug}`, "4");
    localStorage.setItem(
      `onboarding_path_${organization.slug}`,
      "start_building"
    );

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = getRequestUrl(input);

        if (url === `/api/${organization.slug}/onboarding/status`) {
          return createJsonResponse({
            completed: false,
            hasActiveSubscription: false,
          });
        }

        if (
          url === `/api/${organization.slug}/onboarding/complete` &&
          init?.method === "POST"
        ) {
          return createJsonResponse(
            { error: "Failed to complete onboarding" },
            { status: 500 }
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }
    );

    vi.stubGlobal("fetch", fetchMock);

    renderPage();

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "Failed to complete onboarding. Please try again."
      );
    });

    expect(mockPush).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("cli-deploy-connect-step")
    ).not.toBeInTheDocument();
  });
});
