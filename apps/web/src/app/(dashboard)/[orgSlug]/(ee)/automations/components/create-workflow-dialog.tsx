"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createAutomation } from "@/actions/automations";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type CreateWorkflowDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  orgSlug: string;
};

export function CreateWorkflowDialog({
  open,
  onOpenChange,
  organizationId,
  orgSlug,
}: CreateWorkflowDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Please enter a name for the automation");
      return;
    }

    startTransition(async () => {
      const result = await createAutomation(organizationId, {
        name: name.trim(),
        description: description.trim() || undefined,
      });

      if (result.success) {
        toast.success("Automation created");
        onOpenChange(false);
        setName("");
        setDescription("");
        // Navigate to the workflow builder
        router.push(`/${orgSlug}/automations/${result.automation.id}`);
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setName("");
      setDescription("");
    }
    onOpenChange(open);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create automation</DialogTitle>
            <DialogDescription>
              Create a new automation workflow. You can configure the trigger
              and steps in the builder.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                disabled={isPending}
                id="name"
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Welcome Series"
                value={name}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                disabled={isPending}
                id="description"
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this automation do?"
                rows={3}
                value={description}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={isPending}
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={isPending || !name.trim()} type="submit">
              {isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
