"use client";

import { useForm } from "@tanstack/react-form";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateOrganizationAction } from "@/actions/organizations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ImageUpload } from "@/components/ui/image-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  type UpdateOrganizationInput,
  updateOrganizationSchema,
} from "@/lib/forms/update-organization";

type OrganizationSettingsFormProps = {
  organization: {
    id: string;
    name: string;
    slug: string | null;
    logo: string | null;
  };
  userRole: "owner" | "admin" | "member";
};

export function OrganizationSettingsForm({
  organization,
  userRole,
}: OrganizationSettingsFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      name: organization.name,
      slug: organization.slug || "",
      logo: organization.logo || "",
    } as UpdateOrganizationInput,
    validators: {
      onChange: updateOrganizationSchema,
    },
    onSubmit: async ({ value }) => {
      if (!organization.slug) {
        setError("Organization not found");
        return;
      }

      setIsSubmitting(true);
      setError(null);
      setSuccess(null);

      try {
        const result = await updateOrganizationAction(organization.slug, value);

        if (result.success) {
          setSuccess("Organization settings updated successfully");

          // If slug changed, redirect to new URL
          if (value.slug && value.slug !== organization.slug) {
            setTimeout(() => {
              router.push(`/${result.organization.slug}/settings`);
              router.refresh();
            }, 1500);
          }
        } else {
          setError(result.error);
          if (result.field) {
            form.setFieldMeta(result.field as any, (meta) => ({
              ...meta,
              errorMap: {
                onChange: result.error,
              },
            }));
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "An unexpected error occurred"
        );
      } finally {
        setIsSubmitting(false);
      }
    },
  });

  // Check if user has permission to edit settings
  const canEdit = userRole === "owner" || userRole === "admin";

  return (
    <>
      {!canEdit && (
        <Alert>
          <AlertDescription>
            You do not have permission to edit organization settings. Only
            owners and admins can make changes.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>General Information</CardTitle>
            <CardDescription>
              Update your organization's basic information.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form.Field name="name">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Organization Name</Label>
                  <Input
                    disabled={!canEdit || isSubmitting}
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Enter organization name"
                    value={field.state.value}
                  />
                  <p className="text-muted-foreground text-sm">
                    This is your organization's display name.
                  </p>
                  {field.state.meta.errors ? (
                    <p className="text-destructive text-sm">
                      {field.state.meta.errors.join(", ")}
                    </p>
                  ) : null}
                </div>
              )}
            </form.Field>

            <form.Field name="slug">
              {(field) => (
                <div className="space-y-2">
                  <Label htmlFor={field.name}>Organization Slug</Label>
                  <Input
                    disabled={!canEdit || isSubmitting}
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="organization-slug"
                    value={field.state.value}
                  />
                  <p className="text-muted-foreground text-sm">
                    This is your organization's unique URL identifier. Must be
                    lowercase letters, numbers, and hyphens only.
                  </p>
                  {field.state.meta.errors ? (
                    <p className="text-destructive text-sm">
                      {field.state.meta.errors.join(", ")}
                    </p>
                  ) : null}
                </div>
              )}
            </form.Field>

            <form.Field name="logo">
              {(field) => (
                <div className="space-y-2">
                  <Label>Organization Logo</Label>
                  <ImageUpload
                    disabled={!canEdit || isSubmitting}
                    onChange={field.handleChange}
                    orgSlug={organization.slug || ""}
                    value={field.state.value || ""}
                  />
                  <p className="text-muted-foreground text-sm">
                    Upload your organization's logo. PNG, JPEG, or WebP. Max
                    5MB.
                  </p>
                  {field.state.meta.errors ? (
                    <p className="text-destructive text-sm">
                      {field.state.meta.errors.join(", ")}
                    </p>
                  ) : null}
                </div>
              )}
            </form.Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Danger Zone</CardTitle>
            <CardDescription>
              Irreversible and destructive actions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Separator />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-semibold">Delete Organization</h4>
                <p className="text-muted-foreground text-sm">
                  Permanently delete this organization and all associated data.
                </p>
              </div>
              <Button
                className="cursor-pointer"
                disabled={userRole !== "owner"}
                type="button"
                variant="destructive"
              >
                Delete Organization
              </Button>
            </div>
          </CardContent>
        </Card>

        {canEdit && (
          <div className="flex space-x-2">
            <Button
              className="cursor-pointer"
              disabled={isSubmitting}
              type="submit"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
            <Button
              className="cursor-pointer"
              disabled={isSubmitting}
              onClick={() => form.reset()}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        )}
      </form>
    </>
  );
}
