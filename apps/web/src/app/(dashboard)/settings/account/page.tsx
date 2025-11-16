"use client";

import { mergeForm, useForm, useTransform } from "@tanstack/react-form";
import { initialFormState } from "@tanstack/react-form/nextjs";
import { useStore } from "@tanstack/react-store";
import { useActionState, useEffect } from "react";
import { z } from "zod";
import { changePasswordAction, updateAccountAction } from "@/actions/account";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";
import {
  changePasswordFormOpts,
  updateAccountFormOpts,
} from "@/lib/forms/update-account";

export default function AccountSettings() {
  const { data: session } = authClient.useSession();

  // Account update form
  const [accountState, accountAction, isAccountPending] = useActionState<
    any,
    FormData
  >(updateAccountAction, initialFormState);

  const accountForm = useForm({
    ...updateAccountFormOpts,
    transform: useTransform(
      (baseForm) => {
        if (
          accountState &&
          typeof accountState === "object" &&
          "values" in accountState
        ) {
          return mergeForm(baseForm, accountState);
        }
        return baseForm;
      },
      [accountState]
    ),
  });

  // Set default values from session
  useEffect(() => {
    if (session?.user) {
      const [firstName = "", lastName = ""] = (session.user.name || "").split(
        " ",
        2
      );
      accountForm.setFieldValue("firstName", firstName);
      accountForm.setFieldValue("lastName", lastName);
      accountForm.setFieldValue("email", session.user.email || "");
    }
  }, [session, accountForm.setFieldValue]);

  const accountFormErrors = useStore(
    accountForm.store,
    (formState) => formState.errors
  );

  const isAccountSuccess =
    accountState &&
    typeof accountState === "object" &&
    "success" in accountState &&
    accountState.success === true;

  // Password change form
  const [passwordState, passwordAction, isPasswordPending] = useActionState<
    any,
    FormData
  >(changePasswordAction, initialFormState);

  const passwordForm = useForm({
    ...changePasswordFormOpts,
    transform: useTransform(
      (baseForm) => {
        if (
          passwordState &&
          typeof passwordState === "object" &&
          "values" in passwordState
        ) {
          return mergeForm(baseForm, passwordState);
        }
        return baseForm;
      },
      [passwordState]
    ),
  });

  const passwordFormErrors = useStore(
    passwordForm.store,
    (formState) => formState.errors
  );

  const isPasswordSuccess =
    passwordState &&
    typeof passwordState === "object" &&
    "success" in passwordState &&
    passwordState.success === true;

  // Reset password form on success
  useEffect(() => {
    if (isPasswordSuccess) {
      passwordForm.reset();
    }
  }, [isPasswordSuccess, passwordForm.reset]);

  return (
    <div className="space-y-6 px-4 lg:px-6">
      <div>
        <h1 className="font-bold text-3xl">Account Settings</h1>
        <p className="text-muted-foreground">
          Manage your account settings and preferences.
        </p>
      </div>

      {/* Account Information Form */}
      <form
        action={accountAction as never}
        className="space-y-6"
        onSubmit={() => accountForm.handleSubmit()}
      >
        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>
              Update your personal information that will be displayed on your
              profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Form-level errors */}
            {accountFormErrors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                {accountFormErrors.map((error, i) => (
                  <p className="text-red-600 text-sm" key={i}>
                    {String(error)}
                  </p>
                ))}
              </div>
            )}

            {/* Success message */}
            {isAccountSuccess && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <p className="text-green-600 text-sm">
                  ✓{" "}
                  {accountState &&
                  typeof accountState === "object" &&
                  "message" in accountState
                    ? String(accountState.message)
                    : "Account updated successfully"}
                </p>
              </div>
            )}

            {/* Error message */}
            {accountState &&
              typeof accountState === "object" &&
              "error" in accountState &&
              accountState.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="font-medium text-red-600 text-sm">
                    {String(accountState.error)}
                  </p>
                </div>
              )}

            <div className="grid grid-cols-2 gap-4">
              <accountForm.Field
                name="firstName"
                validators={{
                  onChange: ({ value }) =>
                    value.length < 1 ? "First name is required" : undefined,
                }}
              >
                {(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>First Name</FieldLabel>
                      <FieldContent>
                        <Input
                          aria-invalid={isInvalid}
                          id={field.name}
                          name={field.name}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="Enter your first name"
                          value={field.state.value}
                        />
                        {isInvalid && field.state.meta.errors.length > 0 && (
                          <p className="text-destructive text-sm">
                            {String(field.state.meta.errors[0])}
                          </p>
                        )}
                      </FieldContent>
                    </Field>
                  );
                }}
              </accountForm.Field>

              <accountForm.Field
                name="lastName"
                validators={{
                  onChange: ({ value }) =>
                    value.length < 1 ? "Last name is required" : undefined,
                }}
              >
                {(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Last Name</FieldLabel>
                      <FieldContent>
                        <Input
                          aria-invalid={isInvalid}
                          id={field.name}
                          name={field.name}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="Enter your last name"
                          value={field.state.value}
                        />
                        {isInvalid && field.state.meta.errors.length > 0 && (
                          <p className="text-destructive text-sm">
                            {String(field.state.meta.errors[0])}
                          </p>
                        )}
                      </FieldContent>
                    </Field>
                  );
                }}
              </accountForm.Field>
            </div>

            <accountForm.Field
              name="email"
              validators={{
                onChange: ({ value }) => {
                  const result = z.string().email().safeParse(value);
                  if (!result.success) {
                    return result.error.issues[0]?.message ?? "Invalid email address";
                  }
                  return;
                },
              }}
            >
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Email Address</FieldLabel>
                    <FieldContent>
                      <Input
                        aria-invalid={isInvalid}
                        id={field.name}
                        name={field.name}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Enter your email"
                        type="email"
                        value={field.state.value}
                      />
                      {isInvalid && field.state.meta.errors.length > 0 && (
                        <p className="text-destructive text-sm">
                          {String(field.state.meta.errors[0])}
                        </p>
                      )}
                    </FieldContent>
                  </Field>
                );
              }}
            </accountForm.Field>
          </CardContent>
        </Card>

        <accountForm.Subscribe selector={(formState) => [formState.canSubmit]}>
          {([canSubmit]) => (
            <div className="flex space-x-2">
              <Button
                className="cursor-pointer"
                disabled={!canSubmit || isAccountPending}
                loading={isAccountPending}
                type="submit"
              >
                {isAccountPending ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                className="cursor-pointer"
                onClick={() => accountForm.reset()}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          )}
        </accountForm.Subscribe>
      </form>

      {/* Password Change Form */}
      <form
        action={passwordAction as never}
        className="space-y-6"
        onSubmit={() => passwordForm.handleSubmit()}
      >
        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>
              Update your password to keep your account secure.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Form-level errors */}
            {passwordFormErrors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                {passwordFormErrors.map((error, i) => (
                  <p className="text-red-600 text-sm" key={i}>
                    {String(error)}
                  </p>
                ))}
              </div>
            )}

            {/* Success message */}
            {isPasswordSuccess && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                <p className="text-green-600 text-sm">
                  ✓{" "}
                  {passwordState &&
                  typeof passwordState === "object" &&
                  "message" in passwordState
                    ? String(passwordState.message)
                    : "Password changed successfully"}
                </p>
              </div>
            )}

            {/* Error message */}
            {passwordState &&
              typeof passwordState === "object" &&
              "error" in passwordState &&
              passwordState.error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="font-medium text-red-600 text-sm">
                    {String(passwordState.error)}
                  </p>
                </div>
              )}

            <passwordForm.Field
              name="currentPassword"
              validators={{
                onChange: ({ value }) =>
                  value.length < 1 ? "Current password is required" : undefined,
              }}
            >
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      Current Password
                    </FieldLabel>
                    <FieldContent>
                      <Input
                        aria-invalid={isInvalid}
                        id={field.name}
                        name={field.name}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Enter current password"
                        type="password"
                        value={field.state.value}
                      />
                      {isInvalid && field.state.meta.errors.length > 0 && (
                        <p className="text-destructive text-sm">
                          {String(field.state.meta.errors[0])}
                        </p>
                      )}
                    </FieldContent>
                  </Field>
                );
              }}
            </passwordForm.Field>

            <passwordForm.Field
              name="newPassword"
              validators={{
                onChange: ({ value }) =>
                  value.length < 8
                    ? "Password must be at least 8 characters"
                    : undefined,
              }}
            >
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>New Password</FieldLabel>
                    <FieldContent>
                      <Input
                        aria-invalid={isInvalid}
                        id={field.name}
                        name={field.name}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Enter new password"
                        type="password"
                        value={field.state.value}
                      />
                      {isInvalid && field.state.meta.errors.length > 0 && (
                        <p className="text-destructive text-sm">
                          {String(field.state.meta.errors[0])}
                        </p>
                      )}
                    </FieldContent>
                  </Field>
                );
              }}
            </passwordForm.Field>

            <passwordForm.Field
              name="confirmPassword"
              validators={{
                onChangeListenTo: ["newPassword"],
                onChange: ({ value, fieldApi }) => {
                  const newPassword =
                    fieldApi.form.getFieldValue("newPassword");
                  if (value !== newPassword) {
                    return "Passwords do not match";
                  }
                  return;
                },
              }}
            >
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      Confirm New Password
                    </FieldLabel>
                    <FieldContent>
                      <Input
                        aria-invalid={isInvalid}
                        id={field.name}
                        name={field.name}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Confirm new password"
                        type="password"
                        value={field.state.value}
                      />
                      {isInvalid && field.state.meta.errors.length > 0 && (
                        <p className="text-destructive text-sm">
                          {String(field.state.meta.errors[0])}
                        </p>
                      )}
                    </FieldContent>
                  </Field>
                );
              }}
            </passwordForm.Field>
          </CardContent>
        </Card>

        <passwordForm.Subscribe selector={(formState) => [formState.canSubmit]}>
          {([canSubmit]) => (
            <div className="flex space-x-2">
              <Button
                className="cursor-pointer"
                disabled={!canSubmit || isPasswordPending}
                loading={isPasswordPending}
                type="submit"
              >
                {isPasswordPending ? "Changing Password..." : "Change Password"}
              </Button>
              <Button
                className="cursor-pointer"
                onClick={() => passwordForm.reset()}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
            </div>
          )}
        </passwordForm.Subscribe>
      </form>

      {/* Danger Zone */}
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
              <h4 className="font-semibold">Delete Account</h4>
              <p className="text-muted-foreground text-sm">
                Permanently delete your account and all associated data.
              </p>
            </div>
            <Button
              className="cursor-pointer"
              type="button"
              variant="destructive"
            >
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
