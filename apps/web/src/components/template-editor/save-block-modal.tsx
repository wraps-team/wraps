"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { JSONContent } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { Loader2, Package, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateBlock } from "@/hooks/use-block-queries";

type SaveBlockModalProps = {
  editor: Editor | null;
  orgSlug: string;
  isOpen: boolean;
  onClose: () => void;
};

const blockCategories = [
  { value: "header", label: "Header" },
  { value: "footer", label: "Footer" },
  { value: "cta", label: "Call to Action" },
  { value: "content", label: "Content" },
  { value: "social", label: "Social" },
  { value: "custom", label: "Custom" },
];

const formSchema = z.object({
  name: z.string().min(1, "Block name is required").max(100),
  description: z.string().max(500).optional(),
  category: z.string().min(1, "Category is required"),
});

type FormValues = z.infer<typeof formSchema>;

export function SaveBlockModal({
  editor,
  orgSlug,
  isOpen,
  onClose,
}: SaveBlockModalProps) {
  const createBlock = useCreateBlock(orgSlug);
  const [selectedContent, setSelectedContent] = useState<JSONContent | null>(
    null
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "custom",
    },
  });

  // Get selected content when modal opens
  useEffect(() => {
    if (isOpen && editor) {
      const { from, to } = editor.state.selection;

      if (from !== to) {
        // Get selected content as JSON
        const slice = editor.state.doc.slice(from, to);
        const content: JSONContent = {
          type: "doc",
          content: slice.content.toJSON(),
        };
        setSelectedContent(content);
      } else {
        // If nothing selected, get the whole document
        setSelectedContent(editor.getJSON());
      }

      form.reset({
        name: "",
        description: "",
        category: "custom",
      });
    }
  }, [isOpen, editor, form]);

  const onSubmit = async (values: FormValues) => {
    if (!selectedContent) {
      toast.error("No content selected to save");
      return;
    }

    try {
      await createBlock.mutateAsync({
        name: values.name,
        description: values.description,
        category: values.category,
        content: selectedContent,
      });

      toast.success("Block saved!", {
        description: `"${values.name}" has been added to your block library`,
      });
      onClose();
    } catch (error) {
      toast.error("Failed to save block", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const hasSelection = editor
    ? editor.state.selection.from !== editor.state.selection.to
    : false;

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Save as Block
          </DialogTitle>
          <DialogDescription>
            {hasSelection
              ? "Save the selected content as a reusable block."
              : "Save the entire template as a reusable block."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Block Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Welcome Header" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select
                    defaultValue={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {blockCategories.map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe what this block contains..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button onClick={onClose} type="button" variant="outline">
                Cancel
              </Button>
              <Button disabled={createBlock.isPending} type="submit">
                {createBlock.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Block
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
