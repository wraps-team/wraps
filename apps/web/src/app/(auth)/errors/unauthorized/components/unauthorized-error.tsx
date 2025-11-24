"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function UnauthorizedError() {
  const router = useRouter();

  return (
    <div className="mx-auto flex min-h-dvh flex-col items-center justify-center gap-8 p-8 md:gap-12 md:p-16">
      <Image
        alt="placeholder image"
        className="aspect-video w-240 rounded-xl object-cover dark:brightness-[0.95] dark:invert"
        height={540}
        src="https://ui.shadcn.com/placeholder.svg"
        width={960}
      />
      <div className="text-center">
        <h1 className="mb-4 font-bold text-3xl">401</h1>
        <h2 className="mb-3 font-semibold text-2xl">Unauthorized</h2>
        <p>
          You don&apos;t have permission to access this resource. Please sign in
          or contact your administrator.
        </p>
        <div className="mt-6 flex items-center justify-center gap-4 md:mt-8">
          <Button className="cursor-pointer" onClick={() => router.push("/")}>
            Go Back Home
          </Button>
          <Button
            className="flex cursor-pointer items-center gap-1"
            onClick={() => router.push("#")}
            variant="outline"
          >
            Contact Us
          </Button>
        </div>
      </div>
    </div>
  );
}
