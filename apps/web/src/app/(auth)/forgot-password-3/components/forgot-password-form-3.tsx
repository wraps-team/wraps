"use client";

import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function ForgotPasswordForm3({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <form className="p-6 md:p-8">
            <div className="flex flex-col gap-6">
              <div className="mb-2 flex justify-center">
                <Link className="flex items-center gap-2 font-medium" href="/">
                  <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <Logo size={24} />
                  </div>
                  <span className="text-xl">ShadcnStore</span>
                </Link>
              </div>
              <div className="flex flex-col items-center text-center">
                <h1 className="font-bold text-2xl">Forgot your password?</h1>
                <p className="text-balance text-muted-foreground">
                  Enter your email to reset your ShadcnStore account password
                </p>
              </div>
              <div className="grid gap-3">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  placeholder="m@example.com"
                  required
                  type="email"
                />
              </div>
              <Button className="w-full cursor-pointer" type="submit">
                Send Reset Link
              </Button>
              <div className="text-center text-sm">
                Remember your password?{" "}
                <a
                  className="underline underline-offset-4"
                  href="/auth/sign-in-3"
                >
                  Back to sign in
                </a>
              </div>
            </div>
          </form>
          <div className="relative hidden bg-muted md:block">
            <Image
              alt="Image"
              className="object-cover dark:brightness-[0.95] dark:invert"
              fill
              src="https://ui.shadcn.com/placeholder.svg"
            />
          </div>
        </CardContent>
      </Card>
      <div className="text-balance text-center text-muted-foreground text-xs *:[a]:underline *:[a]:underline-offset-4 *:[a]:hover:text-primary">
        By clicking continue, you agree to our <a href="#">Terms of Service</a>{" "}
        and <a href="#">Privacy Policy</a>.
      </div>
    </div>
  );
}
