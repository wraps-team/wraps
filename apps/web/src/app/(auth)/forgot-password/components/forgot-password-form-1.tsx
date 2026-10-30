"use client";

import { useForm } from "@tanstack/react-form";
import { Label } from "@wraps/ui/components/ui/label";
import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";
import Loader from "@/components/loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const emailSchema = z.string().email("Please enter a valid email address");

export function ForgotPasswordForm1({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [isSubmitted, setIsSubmitted] = useState(false);

  const form = useForm({
    defaultValues: {
      email: "",
    },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.requestPasswordReset({
        email: value.email,
        redirectTo: "/reset-password",
      });

      if (error) {
        toast.error(error.message || "Failed to send reset link");
        return;
      }

      setIsSubmitted(true);
      toast.success("Reset link sent! Check your email.");
    },
  });

  if (isSubmitted) {
    return (
      <div className={cn("flex flex-col gap-6", className)} {...props}>
        <Panel
          description="We&apos;ve sent a password reset link to your email address. Click the link in the email to reset your password."
          label={<PanelTitle>Check your email</PanelTitle>}
        >
          <div className="grid gap-4">
            <p className="text-center text-muted-foreground text-sm">
              Didn&apos;t receive the email? Check your spam folder or{" "}
              <button
                className="underline underline-offset-4 hover:text-primary"
                onClick={() => setIsSubmitted(false)}
                type="button"
              >
                try again
              </button>
            </p>
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

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Panel
        description="Enter your email address and we&apos;ll send you a link to reset your password"
        label={<PanelTitle>Forgot your password?</PanelTitle>}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
        >
          <div className="grid gap-6">
            <form.Field
              name="email"
              validators={{
                onBlur: ({ value }) => {
                  const result = emailSchema.safeParse(value);
                  return result.success
                    ? undefined
                    : result.error.issues[0]?.message;
                },
              }}
            >
              {(field) => (
                <div className="grid gap-3">
                  <Label htmlFor={field.name}>Email</Label>
                  <Input
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="m@example.com"
                    required
                    type="email"
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
                  {isSubmitting ? <Loader /> : "Send Reset Link"}
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
