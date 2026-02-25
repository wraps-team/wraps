"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type UnsavedChangesGuardProps = {
  href: string;
  isDirty: boolean;
};

export function UnsavedChangesGuard({
  href,
  isDirty,
}: UnsavedChangesGuardProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleBack = () => {
    if (isDirty) {
      setDialogOpen(true);
    } else {
      router.push(href);
    }
  };

  const handleLeave = () => {
    setDialogOpen(false);
    router.push(href);
  };

  return (
    <>
      <Button
        aria-label="back"
        onClick={handleBack}
        size="icon"
        variant="ghost"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <AlertDialog onOpenChange={setDialogOpen} open={dialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              Your changes will be lost if you leave without saving.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLeave} variant="destructive">
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
