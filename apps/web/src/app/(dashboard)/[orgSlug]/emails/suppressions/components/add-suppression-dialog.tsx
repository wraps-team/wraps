"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@wraps/ui/components/ui/dialog";
import { Label } from "@wraps/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addSuppression } from "@/actions/suppressions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SuppressionReason = "BOUNCE" | "COMPLAINT";

const REASON_OPTIONS: {
  value: SuppressionReason;
  label: string;
  description: string;
}[] = [
  {
    value: "BOUNCE",
    label: "Bounce",
    description: "Address is invalid or unreachable",
  },
  {
    value: "COMPLAINT",
    label: "Complaint",
    description: "Person asked not to be emailed",
  },
];

type AddSuppressionDialogProps = {
  organizationId: string;
  accounts: { id: string; name: string; region: string }[];
  /** Called once after a successful add, after the page has refreshed. */
  onAdded?: () => void;
};

export function AddSuppressionDialog({
  organizationId,
  accounts,
  onAdded,
}: AddSuppressionDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState<SuppressionReason>("BOUNCE");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");

  const resetForm = () => {
    setEmail("");
    setReason("BOUNCE");
    setAccountId(accounts[0]?.id ?? "");
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      resetForm();
    }
  };

  const trimmedEmail = email.trim();
  const canSubmit = !isPending && trimmedEmail.includes("@");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      return;
    }

    startTransition(async () => {
      const result = await addSuppression(
        organizationId,
        accountId,
        trimmedEmail,
        reason
      );

      if (result.success) {
        toast.success(
          result.alreadyPresent
            ? `${result.email} is already on the suppression list`
            : `${result.email} added to the suppression list`
        );
        router.refresh();
        handleOpenChange(false);
        onAdded?.();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          Add address
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add to suppression list</DialogTitle>
            <DialogDescription>
              SES will stop sending to this address from your AWS account.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="suppression-email">Email address</Label>
              <Input
                autoComplete="off"
                disabled={isPending}
                id="suppression-email"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                type="email"
                value={email}
              />
            </div>

            <div className="space-y-2">
              <Label>Reason</Label>
              <div className="grid grid-cols-2 gap-2">
                {REASON_OPTIONS.map((option) => {
                  const pressed = reason === option.value;
                  return (
                    <button
                      aria-pressed={pressed}
                      className={`rounded-md border p-3 text-left text-sm transition-colors ${
                        pressed
                          ? "border-foreground bg-accent"
                          : "border-border hover:bg-muted"
                      }`}
                      disabled={isPending}
                      key={option.value}
                      onClick={() => setReason(option.value)}
                      type="button"
                    >
                      <span className="block font-medium">{option.label}</span>
                      <span className="block text-muted-foreground text-xs">
                        {option.description}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-muted-foreground text-xs">
                SES only supports these two reasons. Bounce fits most manual
                adds.
              </p>
            </div>

            {accounts.length > 1 && (
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
            )}
          </div>

          <DialogFooter className="mt-6">
            <Button disabled={!canSubmit} type="submit" variant="brand">
              Add to suppression list
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
