"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard");
  }, [router]);

  // Show a loading state while redirecting
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-primary border-b-2" />
        <p className="mt-2 text-muted-foreground">
          Redirecting to dashboard...
        </p>
      </div>
    </div>
  );
}
