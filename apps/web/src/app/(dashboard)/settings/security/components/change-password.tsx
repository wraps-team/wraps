"use client";

import { mergeForm, useForm, useTransform } from "@tanstack/react-form";
import { initialFormState } from "@tanstack/react-form/nextjs";
import { useStore } from "@tanstack/react-store";
import { CheckCircle2, Key, Mail, XCircle } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { changePasswordAction } from "@/actions/account";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";
import { changePasswordFormOpts } from "@/lib/forms/update-account";

export function ChangePassword() {
  const { data: session } = authClient.useSession();
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
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

  // Check if error is from Have I Been Pwned
  const isPasswordCompromised =
    passwordState &&
    typeof passwordState === "object" &&
    "error" in passwordState &&
    typeof passwordState.error === "string" &&
    passwordState.error.toLowerCase().includes("data breach");

  // Reset password form and close dialog on success
  useEffect(() => {
    if (isPasswordSuccess) {
      passwordForm.reset();
      setShowPasswordDialog(false);
    }
  }, [isPasswordSuccess, passwordForm.reset]);

  const isEmailVerified = session?.user?.emailVerified;

  const handleVerifyEmail = async () => {
    if (!session?.user?.email) {
      toast.error("No email address found");
      return;
    }

    setIsVerifyingEmail(true);
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
      await authClient.sendVerificationEmail({
        email: session.user.email,
        callbackURL: `${appUrl}/dashboard`,
      });
      toast.success("Verification email sent! Check your inbox.");
    } catch (error: any) {
      toast.error(
        error.message || "Failed to send verification email. Please try again."
      );
    } finally {
      setIsVerifyingEmail(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password & Email</CardTitle>
        <CardDescription>
          Manage your password and email verification status.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Email Verification Status */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center rounded-full bg-muted p-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-sm">Email Verification</h4>
                {isEmailVerified ? (
                  <Badge className="gap-1" variant="default">
                    <CheckCircle2 className="h-3 w-3" />
                    Verified
                  </Badge>
                ) : (
                  <Badge className="gap-1" variant="secondary">
                    <XCircle className="h-3 w-3" />
                    Not Verified
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                {session?.user?.email}
              </p>
            </div>
          </div>
          {!isEmailVerified && (
            <Button
              loading={isVerifyingEmail}
              onClick={handleVerifyEmail}
              size="sm"
              type="button"
              variant="outline"
            >
              Verify Email
            </Button>
          )}
        </div>

        <Separator />

        {/* Change Password */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center rounded-full bg-muted p-2">
              <Key className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <h4 className="font-medium text-sm">Password</h4>
              <p className="text-muted-foreground text-xs">
                Update your password to keep your account secure
              </p>
            </div>
          </div>
          <Button
            onClick={() => setShowPasswordDialog(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            Change Password
          </Button>
        </div>

        {/* Password Change Dialog */}
        <Dialog onOpenChange={setShowPasswordDialog} open={showPasswordDialog}>
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Change Password</DialogTitle>
              <DialogDescription>
                Update your password to keep your account secure. We check
                passwords against known data breaches for your safety.
              </DialogDescription>
            </DialogHeader>

            <form
              action={passwordAction as never}
              className="space-y-4"
              onSubmit={() => passwordForm.handleSubmit()}
            >
              {/* Form-level errors */}
              {passwordFormErrors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  {passwordFormErrors.map((error) => (
                    <p className="text-red-600 text-sm" key={String(error)}>
                      {String(error)}
                    </p>
                  ))}
                </div>
              )}

              {/* Error message - with special styling for compromised password */}
              {passwordState &&
                typeof passwordState === "object" &&
                "error" in passwordState &&
                passwordState.error && (
                  <div
                    className={`rounded-lg border p-4 ${
                      isPasswordCompromised
                        ? "border-orange-200 bg-orange-50"
                        : "border-red-200 bg-red-50"
                    }`}
                  >
                    <p
                      className={`font-medium text-sm ${
                        isPasswordCompromised
                          ? "text-orange-700"
                          : "text-red-600"
                      }`}
                    >
                      {isPasswordCompromised && "⚠️ "}
                      {String(passwordState.error)}
                    </p>
                    {isPasswordCompromised && (
                      <p className="mt-2 text-orange-600 text-xs">
                        This password appears in a known data breach database.
                        Please choose a unique password you haven't used
                        elsewhere.
                      </p>
                    )}
                  </div>
                )}

              <passwordForm.Field
                name="currentPassword"
                validators={{
                  onChange: ({ value }) =>
                    value.length < 1
                      ? "Current password is required"
                      : undefined,
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
                          value={field.state.value ?? ""}
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
                          value={field.state.value ?? ""}
                        />
                        <p className="text-muted-foreground text-xs">
                          Minimum 8 characters. Choose a strong, unique
                          password.
                        </p>
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
                          value={field.state.value ?? ""}
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

              <passwordForm.Subscribe
                selector={(formState) => [formState.canSubmit]}
              >
                {([canSubmit]) => (
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      onClick={() => {
                        passwordForm.reset();
                        setShowPasswordDialog(false);
                      }}
                      type="button"
                      variant="outline"
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={!canSubmit}
                      loading={isPasswordPending}
                      type="submit"
                    >
                      Change Password
                    </Button>
                  </div>
                )}
              </passwordForm.Subscribe>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
