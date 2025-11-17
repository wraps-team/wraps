"use client";

import { mergeForm, useForm, useTransform } from "@tanstack/react-form";
import { initialFormState } from "@tanstack/react-form/nextjs";
import { useStore } from "@tanstack/react-store";
import type { member, user } from "@wraps/db";
import type { InferSelectModel } from "drizzle-orm";
import { useActionState } from "react";
import { grantAccessAction } from "@/actions/permissions";
import { Button } from "@/components/ui/button";
import { grantAccessFormOpts } from "@/lib/forms/grant-access";

type MemberWithUser = InferSelectModel<typeof member> & {
  user: InferSelectModel<typeof user>;
};

type GrantAccessFormProps = {
  awsAccountId: string;
  members: MemberWithUser[];
  organizationId: string;
};

export function GrantAccessForm({
  awsAccountId,
  members,
  organizationId,
}: GrantAccessFormProps) {
  const [state, action] = useActionState(grantAccessAction, initialFormState);

  const form = useForm({
    ...grantAccessFormOpts,
    defaultValues: {
      ...grantAccessFormOpts.defaultValues,
      awsAccountId,
    },
    transform: useTransform(
      (baseForm) => {
        // Only merge if state is a form state (not our custom result)
        if (state && typeof state === "object" && "values" in state) {
          return mergeForm(baseForm, state);
        }
        return baseForm;
      },
      [state]
    ),
  });

  const formErrors = useStore(form.store, (formState) => formState.errors);

  // Check if submission was successful
  const isSuccess =
    state &&
    typeof state === "object" &&
    "success" in state &&
    state.success === true;

  // Handle success
  if (isSuccess) {
    // Refresh page to show new permissions
    setTimeout(() => window.location.reload(), 1000);
  }

  return (
    <form
      action={action as never}
      className="space-y-6"
      onSubmit={() => form.handleSubmit()}
    >
      {/* Form-level errors */}
      {formErrors.length > 0 ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          {formErrors.map((error) => (
            <p className="text-red-600 text-sm" key={String(error)}>
              {String(error)}
            </p>
          ))}
        </div>
      ) : null}

      {/* Success message */}
      {isSuccess ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-green-600 text-sm">
            ✓ Access granted successfully!
          </p>
        </div>
      ) : null}

      {/* Error message */}
      {state && typeof state === "object" && "error" in state && state.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="font-medium text-red-600 text-sm">
            {String(state.error) as string}
          </p>
          {"details" in state && state.details ? (
            <p className="mt-1 text-red-500 text-xs">
              {String(state.details) as string}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Hidden AWS account ID */}
      <input name="awsAccountId" type="hidden" value={awsAccountId} />

      {/* User Selection */}
      <form.Field
        name="userId"
        validators={{
          onChange: ({ value }) => (value ? undefined : "User is required"),
        }}
      >
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;
          return (
            <div className="space-y-2">
              <label className="font-medium text-sm" htmlFor={field.name}>
                User
              </label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:font-medium file:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                id={field.name}
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                value={field.state.value}
              >
                <option value="">Select a user...</option>
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.user.name} ({member.user.email}) - {member.role}
                  </option>
                ))}
              </select>
              {isInvalid && field.state.meta.errors.length > 0 && (
                <p className="text-destructive text-sm">
                  {String(field.state.meta.errors[0])}
                </p>
              )}
            </div>
          );
        }}
      </form.Field>

      {/* Permission Level */}
      <form.Field
        name="permissions"
        validators={{
          onChange: ({ value }) =>
            value ? undefined : "Permission level is required",
        }}
      >
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;
          return (
            <div className="space-y-2">
              <label className="font-medium text-sm" htmlFor={field.name}>
                Permission Level
              </label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:font-medium file:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                id={field.name}
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(e) =>
                  field.handleChange(
                    e.target.value as "READ_ONLY" | "FULL_ACCESS" | "ADMIN"
                  )
                }
                value={field.state.value}
              >
                <option value="">Select permission level...</option>
                <option value="READ_ONLY">
                  Read Only - View metrics and logs
                </option>
                <option value="FULL_ACCESS">
                  Full Access - View and send emails
                </option>
                <option value="ADMIN">
                  Admin - Full control including management
                </option>
              </select>
              {isInvalid && field.state.meta.errors.length > 0 && (
                <p className="text-destructive text-sm">
                  {String(field.state.meta.errors[0])}
                </p>
              )}
            </div>
          );
        }}
      </form.Field>

      {/* Optional: Expiration Date */}
      <form.Field name="expiresAt">
        {(field) => {
          const isInvalid =
            field.state.meta.isTouched && !field.state.meta.isValid;
          return (
            <div className="space-y-2">
              <label className="font-medium text-sm" htmlFor={field.name}>
                Expires At (Optional)
              </label>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:font-medium file:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                id={field.name}
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                type="datetime-local"
                value={field.state.value}
              />
              <p className="text-muted-foreground text-xs">
                Leave empty for permanent access
              </p>
              {isInvalid && field.state.meta.errors.length > 0 && (
                <p className="text-destructive text-sm">
                  {String(field.state.meta.errors[0])}
                </p>
              )}
            </div>
          );
        }}
      </form.Field>

      {/* Submit button */}
      <form.Subscribe
        selector={(formState) => [formState.canSubmit, formState.isSubmitting]}
      >
        {([canSubmit, isSubmitting]) => (
          <Button
            className="w-full"
            disabled={!canSubmit || isSubmitting}
            loading={isSubmitting}
            type="submit"
          >
            Grant Access
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
