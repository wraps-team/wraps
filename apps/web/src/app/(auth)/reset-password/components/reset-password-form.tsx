"use client";

import { useForm } from "@tanstack/react-form";
import { Label } from "@wraps/ui/components/ui/label";
import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";
import Loader from "@/components/loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters");

export function ResetPasswordForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [isSuccess, setIsSuccess] = useState(false);

  const form = useForm({
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      if (!token) {
        toast.error("Invalid or missing reset token");
        return;
      }

      if (value.password !== value.confirmPassword) {
        toast.error("Passwords do not match");
        return;
      }

      const { error } = await authClient.resetPassword({
        newPassword: value.password,
        token,
      });

      if (error) {
        toast.error(error.message || "Failed to reset password");
        return;
      }

      setIsSuccess(true);
      toast.success("Password reset successfully!");
    },
  });

  if (!token) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Panel
          description={
            <>
              This password reset link is invalid or has expired. Please request
              a new one.
            </>
          }
          label={<PanelTitle>Invalid Reset Link</PanelTitle>}
        >
          <div className="grid gap-4">
            <Link href="/forgot-password">
              <Button className="w-full cursor-pointer">
                Request New Reset Link
              </Button>
            </Link>
            <div className="text-center text-sm">
              <Link className="underline underline-offset-4" href="/auth">
                Back to sign in
              </Link>
            </div>
          </div>
        </Panel>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Panel
          description={
            <>
              Your password has been reset successfully. You can now sign in
              with your new password.
            </>
          }
          label={<PanelTitle>Password Reset Complete</PanelTitle>}
        >
          <div className="grid gap-4">
            <Button
              className="w-full cursor-pointer"
              onClick={() => router.push("/auth")}
            >
              Sign In
            </Button>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Panel
        description={<>Enter your new password below</>}
        label={<PanelTitle>Reset your password</PanelTitle>}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          <div className="grid gap-6">
            <form.Field
              name="password"
              validators={{
                onBlur: ({ value }) => {
                  const result = passwordSchema.safeParse(value);
                  return result.success
                    ? undefined
                    : result.error.issues[0]?.message;
                },
              }}
            >
              {(field) => (
                <div className="grid gap-3">
                  <Label htmlFor={field.name}>New Password</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Enter new password"
                    required
                    type="password"
                    value={field.state.value}
                  />
                  {field.state.meta.errors?.[0] && (
                    <p className="text-destructive text-sm">
                      {field.state.meta.errors[0]}
                    </p>
                  )}
                </div>
              )}
            </form.Field>
            <form.Field
              name="confirmPassword"
              validators={{
                onBlur: ({ value, fieldApi }) => {
                  const password = fieldApi.form.getFieldValue("password");
                  if (value && value !== password) {
                    return "Passwords do not match";
                  }
                  return;
                },
              }}
            >
              {(field) => (
                <div className="grid gap-3">
                  <Label htmlFor={field.name}>Confirm Password</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Confirm new password"
                    required
                    type="password"
                    value={field.state.value}
                  />
                  {field.state.meta.errors?.[0] && (
                    <p className="text-destructive text-sm">
                      {field.state.meta.errors[0]}
                    </p>
                  )}
                </div>
              )}
            </form.Field>
            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  className="w-full cursor-pointer"
                  disabled={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? <Loader /> : "Reset Password"}
                </Button>
              )}
            </form.Subscribe>
            <div className="text-center text-sm">
              Remember your password?{" "}
              <Link className="underline underline-offset-4" href="/auth">
                Back to sign in
              </Link>
            </div>
          </div>
        </form>
      </Panel>
    </div>
  );
}
