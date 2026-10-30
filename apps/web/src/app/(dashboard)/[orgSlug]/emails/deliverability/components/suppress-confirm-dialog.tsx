"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wraps/ui/components/ui/alert-dialog";
import { Label } from "@wraps/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type AddSuppressionsItem,
  addSuppressions,
} from "@/actions/suppressions";
import { Button } from "@/components/ui/button";

export type SuppressTarget = {
  address: string;
  reason: "BOUNCE" | "COMPLAINT";
  awsAccountId: string | null;
};

/** How many addresses the confirmation names before "and N more". */
const NAMED_LIMIT = 5;

type SuppressConfirmDialogProps = {
  organizationId: string;
  targets: SuppressTarget[];
  accounts: { id: string; name: string; region: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after every run. The parent closes the dialog when failed is 0. */
  onDone: (result: { added: number; failed: number }) => void;
};

function confirmButtonLabel(hasFailed: boolean, count: number): string {
  if (hasFailed) {
    return "Try again";
  }
  return count > 1 ? `Suppress all ${count}` : "Suppress";
}

/**
 * Pairs each target with its answer by position. A target with no answer
 * counts as failed, so a short response can never read as success.
 */
function tally(batch: SuppressTarget[], results: AddSuppressionsItem[]) {
  let added = 0;
  const failed: SuppressTarget[] = [];
  let firstError: string | null = null;
  let single: { email: string; alreadyPresent: boolean } | null = null;

  for (const [index, target] of batch.entries()) {
    const result = results[index];
    if (result?.success) {
      added += 1;
      single = { email: result.email, alreadyPresent: result.alreadyPresent };
    } else {
      failed.push(target);
      firstError ??= result?.error ?? "Failed to add suppression";
    }
  }

  return { added, failed, firstError, single };
}

/**
 * Confirms a suppression before SES is told to stop sending. The whole batch
 * goes in one server call that answers per address, so a failure leaves a
 * clear count; failed targets stay in the dialog for a retry. The confirm
 * action is a plain button, so Radix does not close the dialog on click.
 */
export function SuppressConfirmDialog({
  organizationId,
  targets,
  accounts,
  open,
  onOpenChange,
  onDone,
}: SuppressConfirmDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [remaining, setRemaining] = useState<SuppressTarget[]>(targets);
  const [succeeded, setSucceeded] = useState(0);
  const [accountId, setAccountId] = useState(
    accounts.length === 1 ? accounts[0].id : ""
  );
  const [hasFailed, setHasFailed] = useState(false);

  const many = targets.length > 1;
  const needsAccount =
    accounts.length > 1 && targets.some((t) => t.awsAccountId === null);
  const blocked = needsAccount && accountId === "";
  const accountFor = (target: SuppressTarget) =>
    target.awsAccountId ?? accountId;

  /** One server call for the whole batch; anything it can't answer is a failure. */
  const suppressBatch = async (
    batch: SuppressTarget[]
  ): Promise<AddSuppressionsItem[]> => {
    const failAll = (error: string): AddSuppressionsItem[] =>
      batch.map((target) => ({
        email: target.address,
        success: false,
        error,
      }));
    try {
      const response = await addSuppressions(
        organizationId,
        batch.map((target) => ({
          awsAccountId: accountFor(target),
          email: target.address,
          reason: target.reason,
        }))
      );
      return response.success ? response.results : failAll(response.error);
    } catch {
      return failAll("Could not reach Wraps. Try again.");
    }
  };

  const run = (batch: SuppressTarget[]) => {
    startTransition(async () => {
      const outcome = tally(batch, await suppressBatch(batch));
      const { added, failed, firstError, single } = outcome;

      setRemaining(failed);
      setSucceeded((count) => count + added);
      setHasFailed(failed.length > 0);

      if (failed.length > 0) {
        toast.error(`${failed.length} failed. ${firstError ?? ""}`.trim());
      } else if (!many && single) {
        toast.success(
          single.alreadyPresent
            ? `${single.email} is already on the suppression list`
            : `${single.email} added to the suppression list`
        );
      } else {
        toast.success(`${added} added to the suppression list`);
      }

      onDone({ added, failed: failed.length });
    });
  };

  const named = targets.slice(0, NAMED_LIMIT);
  const extra = targets.length - named.length;
  const confirmLabel = confirmButtonLabel(hasFailed, targets.length);

  return (
    <AlertDialog
      onOpenChange={(next) => {
        if (!isPending) {
          onOpenChange(next);
        }
      }}
      open={open}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {many
              ? `Suppress ${targets.length} addresses?`
              : `Suppress ${targets[0]?.address ?? "this address"}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {`SES will stop sending to ${many ? "these addresses" : "this address"}. You can remove ${many ? "them" : "it"} later from the Suppressed tab.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {many ? (
          <div className="flex flex-col gap-1">
            {named.map((target) => (
              <span
                className="font-mono text-sm"
                key={`${target.address}:${target.reason}`}
              >
                {target.address}
              </span>
            ))}
            {extra > 0 ? (
              <span className="text-muted-foreground text-sm">
                and {extra} more
              </span>
            ) : null}
          </div>
        ) : null}

        {needsAccount ? (
          <div className="space-y-2">
            <Label>AWS account</Label>
            <Select
              disabled={isPending}
              onValueChange={setAccountId}
              value={accountId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choose an account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name} ({account.region})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {hasFailed && !isPending ? (
          <p className="text-destructive text-sm">
            {`Suppressed ${succeeded} of ${targets.length}. ${remaining.length} failed.`}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <Button
            disabled={isPending || blocked || remaining.length === 0}
            onClick={() => run(remaining)}
            variant="brand"
          >
            {isPending ? "Suppressing..." : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
