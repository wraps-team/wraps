"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@wraps/ui/components/ui/alert-dialog";
import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { CreateOrganizationForm } from "@/components/forms/create-organization-form";
import Loader from "@/components/loader";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export default function OnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan = searchParams.get("plan");
  const interval = searchParams.get("interval");
  const { data: session, isPending } = authClient.useSession();
  const [isDeleting, setIsDeleting] = useState(false);

  // Redirect to auth if not logged in
  if (!(isPending || session)) {
    router.push("/auth");
    return null;
  }

  if (isPending) {
    return <Loader fullScreen />;
  }

  // Handle successful org creation - pass plan and interval params to org onboarding
  const handleSuccess = (orgSlug: string) => {
    const params = new URLSearchParams();
    if (plan) {
      params.set("plan", plan);
    }
    if (interval) {
      params.set("interval", interval);
    }
    const url =
      params.toString() !== ""
        ? `/${orgSlug}/onboarding?${params.toString()}`
        : `/${orgSlug}/onboarding`;
    router.push(url);
  };

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Panel
        className="w-full max-w-md"
        description="Let's set up your workspace to get started with Wraps"
        label={<PanelTitle>Create Your Organization</PanelTitle>}
      >
        <CreateOrganizationForm onSuccess={handleSuccess} />

        <div className="mt-4 flex flex-col items-center gap-3 border-t pt-4">
          <Button
            onClick={async () => {
              await authClient.signOut();
              router.push("/");
            }}
            size="sm"
            variant="ghost"
          >
            Sign out
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                className="text-muted-foreground text-xs hover:text-destructive"
                type="button"
              >
                Delete account
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete
                  your account and remove all associated data from our servers.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={isDeleting}
                  onClick={async () => {
                    setIsDeleting(true);
                    try {
                      const { error } = await authClient.deleteUser();
                      if (error) {
                        toast.error(
                          error.message || "Failed to delete account"
                        );
                        return;
                      }
                      window.location.href = "/";
                    } catch {
                      toast.error(
                        "Failed to delete account. Please try again."
                      );
                    } finally {
                      setIsDeleting(false);
                    }
                  }}
                  variant="destructive"
                >
                  {isDeleting ? "Deleting..." : "Delete Account"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Panel>
    </div>
  );
}
