"use client";

import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundError() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto flex min-h-dvh flex-col items-center justify-center gap-8 p-8 md:gap-12 md:p-16">
      <img
        alt="placeholder image"
        className="aspect-video w-240 rounded-xl object-cover dark:brightness-[0.95] dark:invert"
        src="https://ui.shadcn.com/placeholder.svg"
      />
      <div className="text-center">
        <h1 className="mb-4 font-bold text-3xl">404</h1>
        <h2 className="mb-3 font-semibold text-2xl">Page Not Found</h2>
        <p>
          The page you are looking for doesn't exist or has been moved to
          another location.
        </p>
        <div className="mt-6 flex items-center justify-center gap-4 md:mt-8">
          <Button
            className="cursor-pointer"
            onClick={() => navigate("/dashboard")}
          >
            Go Back Home
          </Button>
          <Button
            className="flex cursor-pointer items-center gap-1"
            onClick={() => navigate("#")}
            variant="outline"
          >
            Contact Us
          </Button>
        </div>
      </div>
    </div>
  );
}
