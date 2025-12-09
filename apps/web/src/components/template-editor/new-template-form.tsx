"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCreateTemplate } from "@/hooks/use-template-queries";

const formSchema = z.object({
  name: z.string().min(1, "Template name is required").max(100),
  description: z.string().max(500).optional(),
});

type FormValues = z.infer<typeof formSchema>;

type NewTemplateFormProps = {
  orgSlug: string;
};

export function NewTemplateForm({ orgSlug }: NewTemplateFormProps) {
  const router = useRouter();
  const createTemplate = useCreateTemplate(orgSlug);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    const template = await createTemplate.mutateAsync({
      name: values.name,
      description: values.description,
    });

    router.push(`/${orgSlug}/templates/${template.id}`);
  };

  return (
    <Form {...form}>
      <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Template Name</FormLabel>
              <FormControl>
                <Input placeholder="Welcome Email" {...field} />
              </FormControl>
              <FormDescription>
                A descriptive name for your email template.
              </FormDescription>
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
                  className="resize-none"
                  placeholder="Sent to new users after they sign up..."
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Help your team understand when this template should be used.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3">
          <Button disabled={createTemplate.isPending} type="submit">
            {createTemplate.isPending ? "Creating..." : "Create Template"}
          </Button>
          <Button onClick={() => router.back()} type="button" variant="outline">
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
