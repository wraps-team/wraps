/**
 * SignUpForm per-field validation tests
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
const { mockUseSession, mockPush, mockReplace } = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: mockUseSession,
    signUp: {
      email: vi.fn(),
    },
    signIn: {
      email: vi.fn(),
      social: vi.fn(),
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => ({
    get: (_key: string) => null,
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

vi.mock("next/script", () => ({
  default: () => null,
}));

vi.mock("posthog-js", () => ({
  default: { capture: vi.fn(), identify: vi.fn() },
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@wraps/ui/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <h1>{children}</h1>
  ),
  CardDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
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

import posthog from "posthog-js";
import { authClient } from "@/lib/auth-client";
import SignUpForm from "../sign-up-form";

describe("SignUpForm - per-field validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ isPending: false, data: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows password error on blur when too short", async () => {
    render(<SignUpForm onSwitchToSignIn={vi.fn()} />);

    const passwordInput = screen.getByLabelText(/password/i);
    fireEvent.change(passwordInput, { target: { value: "abc" } });
    fireEvent.blur(passwordInput);

    await waitFor(() => {
      expect(
        screen.getByText("Password must be at least 6 characters")
      ).toBeInTheDocument();
    });
  });

  it("clears password error when valid password entered and blurred", async () => {
    render(<SignUpForm onSwitchToSignIn={vi.fn()} />);

    const passwordInput = screen.getByLabelText(/password/i);

    // First trigger the error
    fireEvent.change(passwordInput, { target: { value: "abc" } });
    fireEvent.blur(passwordInput);

    await waitFor(() => {
      expect(
        screen.getByText("Password must be at least 6 characters")
      ).toBeInTheDocument();
    });

    // Now fix it
    fireEvent.change(passwordInput, { target: { value: "abcdef" } });
    fireEvent.blur(passwordInput);

    await waitFor(() => {
      expect(
        screen.queryByText("Password must be at least 6 characters")
      ).not.toBeInTheDocument();
    });
  });

  it("shows email error on blur when invalid email entered", async () => {
    render(<SignUpForm onSwitchToSignIn={vi.fn()} />);

    const emailInput = screen.getByPlaceholderText(/m@example\.com/i);
    fireEvent.change(emailInput, { target: { value: "notanemail" } });
    fireEvent.blur(emailInput);

    await waitFor(() => {
      expect(screen.getByText("Invalid email address")).toBeInTheDocument();
    });
  });

  it("renders the password error only once when both onBlur and onSubmit produce it", async () => {
    render(<SignUpForm onSwitchToSignIn={vi.fn()} />);

    const passwordInput = screen.getByLabelText(/password/i);
    fireEvent.change(passwordInput, { target: { value: "abc" } });
    fireEvent.blur(passwordInput);

    const submitButton = screen.getByRole("button", {
      name: /create account/i,
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(
        screen.getAllByText("Password must be at least 6 characters")
      ).toHaveLength(1);
    });
  });
});

describe("SignUpForm - analytics on successful signup", () => {
  // NEXT_PUBLIC_TURNSTILE_SITE_KEY is a module-level constant read once when
  // sign-up-form.tsx first loads. In this checkout it is not actually unset:
  // vitest.config.ts's `loadEnv("test", ...)` merges in apps/web/.env.local,
  // which sets a real site key, so the statically-imported SignUpForm above
  // has Turnstile "on" and its onSubmit bails before calling
  // authClient.signUp.email — there is no captcha widget in this test
  // environment to produce a token. Stub the var empty and re-import the
  // module fresh (with its dependencies) so this describe's component
  // matches the no-Turnstile behavior the rest of the suite assumes.
  let DynamicSignUpForm: typeof SignUpForm;
  let dynamicAuthClient: typeof authClient;
  let dynamicPosthog: typeof posthog;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ isPending: false, data: null });

    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "");
    vi.resetModules();

    ({ default: DynamicSignUpForm } = await import("../sign-up-form"));
    ({ authClient: dynamicAuthClient } = await import("@/lib/auth-client"));
    dynamicPosthog = (await import("posthog-js")).default;

    vi.mocked(dynamicAuthClient.signUp.email).mockResolvedValue({
      error: null,
    } as never);
    vi.mocked(dynamicAuthClient.signIn.email).mockResolvedValue({
      error: null,
    } as never);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it("signs up, signs in with the same credentials, then routes to onboarding", async () => {
    render(<DynamicSignUpForm onSwitchToSignIn={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Ada Lovelace" },
    });
    fireEvent.change(screen.getByPlaceholderText(/m@example\.com/i), {
      target: { value: "ada@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: "abcdef12" },
    });
    const submitButton = screen.getByRole("button", {
      name: /create account/i,
    });
    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });
    fireEvent.click(submitButton);

    // The payload signup-route-db.test.ts drives through the real route.
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/onboarding?interval=monthly");
    });
    expect(dynamicAuthClient.signUp.email).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ada@example.com",
        password: "abcdef12",
        name: "Ada Lovelace",
      })
    );
    expect(dynamicAuthClient.signIn.email).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: "abcdef12",
    });
  });

  it("fires sign_up_form_completed, never the server-side user_signed_up name", async () => {
    render(<DynamicSignUpForm onSwitchToSignIn={vi.fn()} />);

    const nameInput = screen.getByLabelText(/name/i);
    const emailInput = screen.getByPlaceholderText(/m@example\.com/i);
    const passwordInput = screen.getByLabelText(/password/i);

    fireEvent.change(nameInput, { target: { value: "Ada Lovelace" } });
    fireEvent.blur(nameInput);
    fireEvent.change(emailInput, { target: { value: "ada@example.com" } });
    fireEvent.blur(emailInput);
    fireEvent.change(passwordInput, { target: { value: "abcdef12" } });
    fireEvent.blur(passwordInput);

    const submitButton = screen.getByRole("button", {
      name: /create account/i,
    });
    await waitFor(() => {
      expect(submitButton).not.toBeDisabled();
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(dynamicPosthog.capture).toHaveBeenCalledWith(
        "sign_up_form_completed",
        expect.objectContaining({ email: "ada@example.com" })
      );
    });
    expect(dynamicPosthog.capture).not.toHaveBeenCalledWith(
      "user_signed_up",
      expect.anything()
    );
  });
});
