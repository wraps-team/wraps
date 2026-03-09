"use client";

import { useForm } from "@tanstack/react-form";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import Loader from "./loader";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export default function SignUpForm({
  onSwitchToSignIn,
  className,
  ...props
}: {
  onSwitchToSignIn: () => void;
} & React.ComponentProps<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const plan = searchParams.get("plan");
  const interval = searchParams.get("interval") || "monthly";
  const { isPending } = authClient.useSession();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isGitHubLoading, setIsGitHubLoading] = useState(false);

  const isSpecialRedirect =
    redirectTo?.startsWith("/invitations/") ||
    redirectTo?.startsWith("/device");

  // Compute callback URL for OAuth - use special redirect or onboarding
  const callbackUrl = useMemo(() => {
    if (isSpecialRedirect && redirectTo) {
      return redirectTo;
    }
    const params = new URLSearchParams();
    if (plan) {
      params.set("plan", plan);
    }
    if (interval) {
      params.set("interval", interval);
    }
    return params.toString() !== ""
      ? `/onboarding?${params.toString()}`
      : "/onboarding";
  }, [plan, interval, isSpecialRedirect, redirectTo]);

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      // Step 1: Sign up the user
      const signupResult = await authClient.signUp.email({
        email: value.email,
        password: value.password,
        name: value.name,
      });

      if (signupResult.error) {
        toast.error(signupResult.error.message || "Failed to create account");
        return;
      }

      // Step 2: Sign in immediately (since email verification is disabled)
      const signinResult = await authClient.signIn.email({
        email: value.email,
        password: value.password,
      });

      if (signinResult.error) {
        toast.error(
          "Account created but failed to sign in. Please try signing in manually."
        );
        router.push("/auth?mode=signin");
        return;
      }

      // Step 3: Identify user and capture signup event in PostHog
      // Read marketing attribution cookie for tracking
      let attribution: Record<string, string> = {};
      try {
        const match = document.cookie
          .split(";")
          .map((c) => c.trim())
          .find((c) => c.startsWith("wraps_attribution="));
        if (match) {
          attribution = JSON.parse(
            decodeURIComponent(match.split("=").slice(1).join("="))
          );
        }
      } catch {
        // Ignore malformed cookie
      }

      posthog.identify(value.email, {
        email: value.email,
        name: value.name,
        ...attribution,
      });
      posthog.capture("user_signed_up", {
        email: value.email,
        name: value.name,
        selected_plan: plan || null,
        billing_interval: interval,
        ...attribution,
      });

      // Step 4: Redirect to special page or onboarding
      toast.success("Account created successfully!");
      if (isSpecialRedirect && redirectTo) {
        router.push(redirectTo);
      } else {
        const onboardingParams = new URLSearchParams();
        if (plan) {
          onboardingParams.set("plan", plan);
        }
        if (interval) {
          onboardingParams.set("interval", interval);
        }
        const onboardingUrl =
          onboardingParams.toString() !== ""
            ? `/onboarding?${onboardingParams.toString()}`
            : "/onboarding";
        router.push(onboardingUrl);
      }
    },
    validators: {
      onSubmit: z.object({
        name: z.string().min(1, "Name is required"),
        email: z.string().email("Invalid email address"),
        password: z.string().min(6, "Password must be at least 6 characters"),
      }),
    },
  });

  // Only show loader on initial page load, not during/after form submission
  if (isPending && !form.state.isSubmitting && !form.state.isSubmitted) {
    return <Loader />;
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Create Account</CardTitle>
          <CardDescription>
            Enter your information to create a new account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
          >
            <div className="grid gap-6">
              <div className="grid gap-4">
                <form.Field name="name">
                  {(field) => (
                    <div className="grid gap-2">
                      <Label htmlFor={field.name}>Name</Label>
                      <Input
                        id={field.name}
                        name={field.name}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="John Doe"
                        value={field.state.value}
                      />
                      {field.state.meta.errors.map((error) => (
                        <p
                          className="text-destructive text-sm"
                          key={error?.message}
                        >
                          {error?.message}
                        </p>
                      ))}
                    </div>
                  )}
                </form.Field>

                <form.Field name="email">
                  {(field) => (
                    <div className="grid gap-2">
                      <Label htmlFor={field.name}>Email</Label>
                      <Input
                        id={field.name}
                        name={field.name}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="m@example.com"
                        type="email"
                        value={field.state.value}
                      />
                      {field.state.meta.errors.map((error) => (
                        <p
                          className="text-destructive text-sm"
                          key={error?.message}
                        >
                          {error?.message}
                        </p>
                      ))}
                    </div>
                  )}
                </form.Field>

                <form.Field name="password">
                  {(field) => (
                    <div className="grid gap-2">
                      <Label htmlFor={field.name}>Password</Label>
                      <Input
                        id={field.name}
                        name={field.name}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        type="password"
                        value={field.state.value}
                      />
                      <p className="text-muted-foreground text-xs">
                        Minimum 6 characters. Choose a strong, unique password.
                      </p>
                      {field.state.meta.errors.map((error) => (
                        <p
                          className="text-destructive text-sm"
                          key={error?.message}
                        >
                          {error?.message}
                        </p>
                      ))}
                    </div>
                  )}
                </form.Field>

                <form.Subscribe>
                  {(state) => (
                    <Button
                      className="w-full cursor-pointer"
                      disabled={!state.canSubmit}
                      loading={state.isSubmitting}
                      type="submit"
                    >
                      Create Account
                    </Button>
                  )}
                </form.Subscribe>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">
                    Or continue with
                  </span>
                </div>
              </div>

              <Button
                className="w-full"
                loading={isGoogleLoading}
                onClick={async () => {
                  setIsGoogleLoading(true);
                  try {
                    await authClient.signIn.social({
                      provider: "google",
                      callbackURL: callbackUrl,
                    });
                  } catch (error: any) {
                    console.error("Google sign-up error:", error);
                    toast.error(
                      error.message || "Failed to sign up with Google"
                    );
                    setIsGoogleLoading(false);
                  }
                }}
                type="button"
                variant="outline"
              >
                <svg
                  className="mr-2 h-4 w-4"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
                Sign up with Google
              </Button>

              <Button
                className="w-full"
                loading={isGitHubLoading}
                onClick={async () => {
                  setIsGitHubLoading(true);
                  try {
                    await authClient.signIn.social({
                      provider: "github",
                      callbackURL: callbackUrl,
                    });
                  } catch (error: any) {
                    console.error("GitHub sign-up error:", error);
                    toast.error(
                      error.message || "Failed to sign up with GitHub"
                    );
                    setIsGitHubLoading(false);
                  }
                }}
                type="button"
                variant="outline"
              >
                <svg
                  className="mr-2 h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                Sign up with GitHub
              </Button>

              <div className="text-center text-sm">
                Already have an account?{" "}
                <button
                  className="underline underline-offset-4 hover:text-primary"
                  onClick={onSwitchToSignIn}
                  type="button"
                >
                  Sign in
                </button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="text-balance text-center text-muted-foreground text-xs">
        By clicking continue, you agree to our{" "}
        <Link
          className="underline underline-offset-4 hover:text-primary"
          href="#"
        >
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link
          className="underline underline-offset-4 hover:text-primary"
          href="#"
        >
          Privacy Policy
        </Link>
        .
      </div>
    </div>
  );
}
