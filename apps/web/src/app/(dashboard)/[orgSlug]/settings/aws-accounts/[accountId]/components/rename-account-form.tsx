"use client";

import { useForm } from "@tanstack/react-form";
import { Label } from "@wraps/ui/components/ui/label";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { renameAWSAccountAction } from "@/actions/aws-accounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { renameAwsAccountSchema } from "@/lib/forms/aws-account";

type RenameAccountFormProps = {
  awsAccountId: string;
  organizationId: string;
  initialName: string;
};

export function RenameAccountForm({
  awsAccountId,
  organizationId,
  initialName,
}: RenameAccountFormProps) {
  const router = useRouter();

  const form = useForm({
    defaultValues: { name: initialName },
    validators: { onChange: renameAwsAccountSchema },
    onSubmit: async ({ value }) => {
      const result = await renameAWSAccountAction(
        awsAccountId,
        value.name,
        organizationId
      );

      if (result.success) {
        toast.success(
          "unchanged" in result && result.unchanged
            ? "Name is already up to date"
            : "AWS account renamed"
        );
        router.refresh();
      } else {
        toast.error(result.error);
      }
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <form.Field name="name">
        {(field) => (
          <div className="space-y-2">
            <Label htmlFor={field.name}>Name</Label>
            <Input
              id={field.name}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              placeholder="e.g. production"
              value={field.state.value}
            />
            {field.state.meta.errors.length > 0 ? (
              <p className="text-destructive text-sm">
                {field.state.meta.errors
                  .map((e) => (typeof e === "string" ? e : e?.message))
                  .join(", ")}
              </p>
            ) : null}
          </div>
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button disabled={isSubmitting} size="sm" type="submit">
            {isSubmitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Save
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
