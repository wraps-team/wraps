"use client";

import { CloudUpload, Lock, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useProductsStore } from "@/stores/products-store";

const PRODUCTION_ACCESS_DOCS =
  "https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html";

type GoLiveBannerProps = {
  orgSlug: string;
};

type BannerStep = "connect" | "sandbox";

/**
 * Going live is two steps, not one (audit finding F6).
 *
 * The banner used to be rendered only when an organization had no AWS account
 * at all, so it vanished on connection. But 7 of the 14 external organizations
 * with an AWS account are still in the SES sandbox, where AWS rejects mail to
 * any address they have not verified - they are not live, and every zero we
 * show them is explained by that one fact. The banner now persists through the
 * sandbox with its own copy, and each step is dismissed separately so
 * dismissing "connect AWS" does not silently hide "you are still sandboxed".
 */
function resolveStep(
  hasAwsAccounts: boolean | undefined,
  sandboxStatus: boolean | null | undefined
): BannerStep | null {
  if (hasAwsAccounts === undefined) {
    return null;
  }
  if (!hasAwsAccounts) {
    return "connect";
  }
  return sandboxStatus === true ? "sandbox" : null;
}

export function GoLiveBanner({ orgSlug }: GoLiveBannerProps) {
  const hasAwsAccounts = useProductsStore((s) => s.status?.hasAwsAccounts);
  const sandboxStatus = useProductsStore((s) => s.status?.sandboxStatus);
  const step = resolveStep(hasAwsAccounts, sandboxStatus);

  const [dismissed, setDismissed] = useState<Record<BannerStep, boolean>>(
    () => ({
      connect:
        typeof window !== "undefined" &&
        sessionStorage.getItem(`go-live-banner-dismissed-${orgSlug}`) ===
          "true",
      sandbox:
        typeof window !== "undefined" &&
        sessionStorage.getItem(`go-live-sandbox-dismissed-${orgSlug}`) ===
          "true",
    })
  );

  if (!step || dismissed[step]) {
    return null;
  }

  const dismiss = () => {
    const key =
      step === "connect"
        ? `go-live-banner-dismissed-${orgSlug}`
        : `go-live-sandbox-dismissed-${orgSlug}`;
    sessionStorage.setItem(key, "true");
    setDismissed((prev) => ({ ...prev, [step]: true }));
  };

  return (
    <div
      className="-mt-4 md:-mt-6 flex items-center justify-between gap-4 border-b bg-blue-50 border-blue-200 dark:bg-blue-950/50 dark:border-blue-800 px-4 py-2"
      role="status"
    >
      <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
        {step === "connect" ? (
          <CloudUpload className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
        ) : (
          <Lock className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
        )}
        <p className="text-sm">
          {step === "connect"
            ? "Connect your AWS account to start sending emails."
            : "Your AWS account is in the SES sandbox, so AWS only accepts mail to addresses you have verified."}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {step === "connect" ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/${orgSlug}/setup`}>Get Started</Link>
          </Button>
        ) : (
          <Button asChild size="sm" variant="outline">
            <a
              href={PRODUCTION_ACCESS_DOCS}
              rel="noopener noreferrer"
              target="_blank"
            >
              Request production access
            </a>
          </Button>
        )}
        <Button
          aria-label="Dismiss banner"
          className="h-8 w-8 p-0"
          onClick={dismiss}
          size="sm"
          variant="ghost"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
