"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createOrganizationAction } from "@/actions/organizations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { generateSlug } from "@/lib/utils/slug";

type CreateOrganizationFormProps = {
  onSuccess?: (orgSlug: string) => void;
  onCancel?: () => void;
};

export function CreateOrganizationForm({
  onSuccess,
  onCancel,
}: CreateOrganizationFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [autoGenerateSlug, setAutoGenerateSlug] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleNameChange = (value: string) => {
    setName(value);
    if (autoGenerateSlug) {
      setSlug(generateSlug(value));
    }
  };

  const handleSlugChange = (value: string) => {
    setSlug(value);
    setAutoGenerateSlug(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const result = await createOrganizationAction({
        name,
        slug: slug || undefined,
      });

      if (result.success) {
        // Success! Redirect to the new organization
        if (onSuccess) {
          onSuccess(result.organization.slug);
        } else {
          router.push(`/${result.organization.slug}`);
          router.refresh();
        }
      } else {
        // Handle error
        if (result.field) {
          setFieldErrors({ [result.field]: result.error });
        } else {
          setError(result.error);
        }
      }
    } catch (_err) {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Organization Name</Label>
        <Input
          autoFocus
          id="name"
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Acme Inc."
          required
          type="text"
          value={name}
        />
        {fieldErrors.name && (
          <p className="text-red-600 text-sm">{fieldErrors.name}</p>
        )}
        <p className="text-muted-foreground text-xs">
          The name of your organization or company
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">URL Slug</Label>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">wraps.dev/</span>
          <Input
            id="slug"
            onChange={(e) => handleSlugChange(e.target.value)}
            placeholder="acme-inc"
            type="text"
            value={slug}
          />
        </div>
        {fieldErrors.slug && (
          <p className="text-red-600 text-sm">{fieldErrors.slug}</p>
        )}
        <p className="text-muted-foreground text-xs">
          A unique identifier for your organization's dashboard URL
        </p>
      </div>

      <div className="flex gap-2 pt-4">
        <Button className="flex-1" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Creating..." : "Create Organization"}
        </Button>
        {onCancel && (
          <Button
            disabled={isSubmitting}
            onClick={onCancel}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
