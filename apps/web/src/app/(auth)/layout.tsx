import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Authentication - ShadcnStore",
  description: "Sign in to your account or create a new one",
};

import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link
          className="flex items-center gap-2 self-center font-medium"
          href="/"
        >
          <Logo />
        </Link>
        {children}
      </div>
    </div>
  );
}
