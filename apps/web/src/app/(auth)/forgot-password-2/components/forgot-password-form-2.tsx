"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function ForgotPasswordForm2({
  className,
  ...props
}: React.ComponentProps<"form">) {
  return (
    <form className={cn("flex flex-col gap-6", className)} {...props}>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-bold text-2xl">Forgot your password?</h1>
        <p className="text-balance text-muted-foreground text-sm">
          Enter your email address and we&apos;ll send you a link to reset your
          password
        </p>
      </div>
      <div className="grid gap-6">
        <div className="grid gap-3">
          <Label htmlFor="email">Email</Label>
          <Input id="email" placeholder="m@example.com" required type="email" />
        </div>
        <Button className="w-full cursor-pointer" type="submit">
          Send Reset Link
        </Button>
      </div>
      <div className="text-center text-sm">
        Remember your password?{" "}
        <a className="underline underline-offset-4" href="/auth/sign-in-2">
          Back to sign in
        </a>
      </div>
    </form>
  );
}
