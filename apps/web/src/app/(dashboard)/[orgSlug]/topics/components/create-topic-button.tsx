"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQueryState } from "nuqs";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createTopic } from "@/actions/topics";
import { Button } from "@/components/ui/button";
import { captureTopicCreated } from "./lib/analytics";
import { topicsTabParser } from "./lib/tabs";
import { TopicFormDialog } from "./topic-form-dialog";

type CreateTopicButtonProps = {
  organizationId: string;
  label?: string;
  variant?: "default" | "outline";
};

/**
 * A Create Topic button that owns its dialog, so the page heading and the
 * table's empty state can each place one. Callers gate it on role.
 */
export function CreateTopicButton({
  organizationId,
  label = "Create Topic",
  variant = "default",
}: CreateTopicButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [, setTab] = useQueryState("tab", topicsTabParser);

  const handleCreate = (data: {
    name?: string;
    slug?: string;
    description?: string | null;
    public?: boolean;
    doubleOptIn?: boolean;
  }) => {
    if (!data.name) {
      toast.error("Error", { description: "Name is required" });
      return;
    }
    const name = data.name;
    startTransition(async () => {
      const result = await createTopic(organizationId, {
        name,
        slug: data.slug,
        description: data.description || undefined,
        public: data.public,
        doubleOptIn: data.doubleOptIn,
      });
      if (result.success) {
        captureTopicCreated({
          double_opt_in: Boolean(data.doubleOptIn),
          public: data.public ?? true,
        });
        toast.success("Topic created", {
          description: `${name} has been created.`,
        });
        setOpen(false);
        // The heading's button works from any tab; land on the list so the
        // new topic is in view.
        setTab("list");
        router.refresh();
      } else {
        toast.error("Error", {
          description: result.error,
        });
      }
    });
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} variant={variant}>
        <Plus className="size-4" />
        {label}
      </Button>
      <TopicFormDialog
        isPending={isPending}
        mode="create"
        onOpenChange={setOpen}
        onSubmit={handleCreate}
        open={open}
      />
    </>
  );
}
