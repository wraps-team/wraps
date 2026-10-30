/**
 * SignInForm SSO Tests
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
const {
  mockSignInSso,
  mockUseSession,
  mockPush,
  mockReplace,
  mockToastError,
  mockToastPromise,
} = vi.hoisted(() => ({
  mockSignInSso: vi.fn(),
  mockUseSession: vi.fn(),
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockToastError: vi.fn(),
  mockToastPromise: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: mockUseSession,
    getLastUsedLoginMethod: () => null,
    signIn: {
      sso: mockSignInSso,
      email: vi.fn(),
      social: vi.fn(),
      passkey: vi.fn(),
    },
    twoFactor: { verifyTotp: vi.fn() },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => ({
    get: (key: string) => (key === "redirect" ? null : null),
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn(), identify: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: {
    error: mockToastError,
    success: vi.fn(),
    info: vi.fn(),
    promise: mockToastPromise,
  },
}));

vi.mock("@wraps/ui/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
vi.mock("@wraps/ui/components/ui/label", () => ({
  Label: ({
    children,
    htmlFor,
  }: {
    children: React.ReactNode;
    htmlFor?: string;
  }) => <label htmlFor={htmlFor}>{children}</label>,
}));
vi.mock("@/components/loader", () => ({
  default: () => <div>Loading...</div>,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type,
    loading,
    ...props
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    type?: string;
    loading?: boolean;
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
vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} />
  ),
}));
vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
  toSafeRedirectPath: (_path: unknown, fallback: string) => fallback,
}));

import SignInForm from "../sign-in-form";

describe("SignInForm - SSO", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ isPending: false, data: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Sign in with SSO button", () => {
    render(<SignInForm onSwitchToSignUp={() => {}} />);
    expect(screen.getByText(/sign in with sso/i)).toBeInTheDocument();
  });

  it("calls authClient.signIn.sso with email and callbackURL when SSO button is clicked", async () => {
    mockSignInSso.mockResolvedValue({ data: {}, error: null });
    render(<SignInForm onSwitchToSignUp={() => {}} />);

    const emailInput = screen.getByPlaceholderText(/m@example\.com/i);
    fireEvent.change(emailInput, { target: { value: "user@company.com" } });

    const ssoButton = screen.getByText(/sign in with sso/i);
    fireEvent.click(ssoButton);

    await waitFor(() => {
      expect(mockSignInSso).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "user@company.com",
          callbackURL: expect.any(String),
        })
      );
    });
  });

  it("shows error toast when signIn.sso returns an error with a message", async () => {
    mockSignInSso.mockResolvedValue({
      error: { message: "No SSO provider configured for that email domain." },
    });
    render(<SignInForm onSwitchToSignUp={() => {}} />);

    const emailInput = screen.getByPlaceholderText(/m@example\.com/i);
    fireEvent.change(emailInput, { target: { value: "user@company.com" } });

    const ssoButton = screen.getByText(/sign in with sso/i);
    fireEvent.click(ssoButton);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "No SSO provider configured for that email domain."
      );
    });
  });

  it("shows fallback error toast when signIn.sso returns error with no message", async () => {
    mockSignInSso.mockResolvedValue({ error: {} });
    render(<SignInForm onSwitchToSignUp={() => {}} />);

    const emailInput = screen.getByPlaceholderText(/m@example\.com/i);
    fireEvent.change(emailInput, { target: { value: "user@company.com" } });

    const ssoButton = screen.getByText(/sign in with sso/i);
    fireEvent.click(ssoButton);

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "No SSO provider configured for that email domain."
      );
    });
  });
});
