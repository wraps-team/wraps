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
import { cn } from "@wraps/ui/lib/utils";
import { Pause, Play, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function KillSwitch() {
  const [sendingEnabled, setSendingEnabled] = useState(true);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between",
        sendingEnabled
          ? "border-border bg-card"
          : "border-destructive/40 bg-destructive/5"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
            sendingEnabled
              ? "bg-success/10 text-success"
              : "bg-destructive/10 text-destructive"
          )}
        >
          <ShieldAlert aria-hidden="true" className="size-5" />
        </span>
        <div>
          <p className="font-medium text-sm">
            {sendingEnabled
              ? "Sending is enabled account-wide"
              : "Sending is paused — no mail is leaving SES"}
          </p>
          <p className="max-w-prose text-muted-foreground text-sm">
            The kill switch is your seatbelt. Pausing halts all outbound SES
            immediately across every pool; it is fully reversible and takes
            effect in seconds.
          </p>
        </div>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          {sendingEnabled ? (
            <Button
              className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              variant="outline"
            >
              <Pause className="size-4" />
              Pause sending
            </Button>
          ) : (
            <Button className="shrink-0 bg-brand text-brand-foreground hover:bg-brand/90">
              <Play className="size-4" />
              Resume sending
            </Button>
          )}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {sendingEnabled ? "Pause all sending?" : "Resume all sending?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {sendingEnabled
                ? "This immediately stops all outbound email from SES across every IP pool and configuration set. Queued and in-flight sends will halt. You can resume at any time."
                : "This re-enables outbound email across every IP pool. Sending will resume at your current daily quota and send rate."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(
                sendingEnabled &&
                  "bg-destructive text-white hover:bg-destructive/90"
              )}
              onClick={() => setSendingEnabled((v) => !v)}
            >
              {sendingEnabled ? "Pause sending" : "Resume sending"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
