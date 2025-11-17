"use client";

import { useForm } from "@tanstack/react-form";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import Loader from "./loader";
import { Badge } from "./ui/badge";
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

export default function SignInForm({
  onSwitchToSignUp,
  className,
  ...props
}: {
  onSwitchToSignUp: () => void;
} & React.ComponentProps<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  const { isPending } = authClient.useSession();
  const [show2FA, setShow2FA] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [is2FALoading, setIs2FALoading] = useState(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState(false);

  // Get the last used login method
  const lastMethod = authClient.getLastUsedLoginMethod();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      const _result = await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: (ctx) => {
            // Check if 2FA is required
            if (ctx.data.twoFactorRedirect) {
              setShow2FA(true);
              toast.info("Please enter your 2FA code");
              return;
            }
            router.push(redirectTo);
            toast.success("Sign in successful");
          },
          onError: (error) => {
            toast.error(error.error.message || error.error.statusText);
          },
        }
      );
    },
    validators: {
      onSubmit: z.object({
        email: z.email("Invalid email address"),
        password: z.string().min(6, "Password must be at least 6 characters"),
      }),
    },
  });

  const handle2FAVerification = async () => {
    if (!twoFactorCode || twoFactorCode.length !== 6) {
      toast.error("Please enter a valid 6-digit code");
      return;
    }

    setIs2FALoading(true);
    try {
      const result = await authClient.twoFactor.verifyTotp({
        code: twoFactorCode,
      });

      if (result.error) {
        toast.error(result.error.message || "Invalid 2FA code");
        return;
      }

      router.push(redirectTo);
      toast.success("Sign in successful");
    } catch (_error) {
      toast.error("Failed to verify 2FA code");
    } finally {
      setIs2FALoading(false);
    }
  };

  if (isPending) {
    return <Loader />;
  }

  // Show 2FA verification if required
  if (show2FA) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Two-Factor Authentication</CardTitle>
            <CardDescription>
              Enter the 6-digit code from your authenticator app
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="2fa-code">Verification Code</Label>
                <Input
                  autoFocus
                  className="text-center font-mono text-lg tracking-widest"
                  id="2fa-code"
                  maxLength={6}
                  onChange={(e) =>
                    setTwoFactorCode(
                      e.target.value.replace(/\D/g, "").slice(0, 6)
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && twoFactorCode.length === 6) {
                      handle2FAVerification();
                    }
                  }}
                  placeholder="000000"
                  type="text"
                  value={twoFactorCode}
                />
              </div>
              <Button
                className="w-full cursor-pointer"
                disabled={twoFactorCode.length !== 6}
                loading={is2FALoading}
                onClick={handle2FAVerification}
              >
                Verify
              </Button>
              <Button
                className="w-full cursor-pointer"
                onClick={() => {
                  setShow2FA(false);
                  setTwoFactorCode("");
                }}
                type="button"
                variant="outline"
              >
                Back to Sign In
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>
            Enter your email below to login to your account
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
                      <div className="flex items-center">
                        <Label htmlFor={field.name}>Password</Label>
                        <Link
                          className="ml-auto text-sm underline-offset-4 hover:underline"
                          href="/auth/forgot-password"
                        >
                          Forgot your password?
                        </Link>
                      </div>
                      <Input
                        id={field.name}
                        name={field.name}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        type="password"
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

                <form.Subscribe>
                  {(state) => (
                    <Button
                      className="relative w-full cursor-pointer"
                      disabled={!state.canSubmit}
                      loading={state.isSubmitting}
                      type="submit"
                    >
                      Login
                      {lastMethod === "email" && (
                        <Badge
                          className="-translate-y-1/2 absolute top-1/2 right-2 ml-auto"
                          variant="secondary"
                        >
                          Last used
                        </Badge>
                      )}
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
                className="relative w-full"
                loading={isPasskeyLoading}
                onClick={async () => {
                  setIsPasskeyLoading(true);
                  try {
                    const result = await authClient.signIn.passkey();

                    if (result.error) {
                      toast.error(
                        result.error.message || "Failed to sign in with passkey"
                      );
                      return;
                    }

                    router.push(redirectTo);
                    toast.success("Signed in with passkey");
                  } catch (error: any) {
                    console.error("Passkey error:", error);
                    toast.error(
                      error.message || "Failed to authenticate with passkey"
                    );
                  } finally {
                    setIsPasskeyLoading(false);
                  }
                }}
                type="button"
                variant="outline"
              >
                <svg
                  className="mr-2 h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect height="11" rx="2" ry="2" width="18" x="3" y="11" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Sign in with Passkey
                {lastMethod === "passkey" && !isPasskeyLoading && (
                  <Badge
                    className="-translate-y-1/2 absolute top-1/2 right-2 ml-auto"
                    variant="secondary"
                  >
                    Last used
                  </Badge>
                )}
              </Button>

              <div className="text-center text-sm">
                Don&apos;t have an account?{" "}
                <button
                  className="underline underline-offset-4 hover:text-primary"
                  onClick={onSwitchToSignUp}
                  type="button"
                >
                  Sign up
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
