"use client";

import { mergeForm, useForm } from "@tanstack/react-form";
import { initialFormState, useTransform } from "@tanstack/react-form-nextjs";
import { useStore } from "@tanstack/react-store";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Label } from "@wraps/ui/components/ui/label";
import { Switch } from "@wraps/ui/components/ui/switch";
import { Smartphone } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import {
  getSecuritySettingsAction,
  updateSecuritySettingsAction,
} from "@/actions/account";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { securitySettingsFormOpts } from "@/lib/forms/update-account";

export function LoginAlerts() {
  const [isLoading, setIsLoading] = useState(true);

  // Security settings form
  const [securityState, securityAction, isSecurityPending] = useActionState<
    any,
    FormData
  >(updateSecuritySettingsAction, initialFormState);

  const securityForm = useForm({
    ...securitySettingsFormOpts,
    transform: useTransform(
      (baseForm) => {
        if (
          securityState &&
          typeof securityState === "object" &&
          "values" in securityState
        ) {
          return mergeForm(baseForm, securityState);
        }
        return baseForm;
      },
      [securityState]
    ),
  });

  // Load current settings on mount
  useEffect(() => {
    async function loadSettings() {
      const settings = await getSecuritySettingsAction();
      if (settings) {
        securityForm.setFieldValue("phoneNumber", settings.phoneNumber);
        securityForm.setFieldValue(
          "loginAlertsEnabled",
          settings.loginAlertsEnabled
        );
      }
      setIsLoading(false);
    }
    loadSettings();
  }, [securityForm.setFieldValue, securityForm]);

  const securityFormErrors = useStore(
    securityForm.store,
    (formState) => formState.errors
  );

  const isSecuritySuccess =
    securityState &&
    typeof securityState === "object" &&
    "success" in securityState &&
    securityState.success === true;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Security Settings</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <form
      action={securityAction as never}
      className="space-y-6"
      onSubmit={() => securityForm.handleSubmit()}
    >
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="size-5" />
            Security Settings
          </CardTitle>
          <CardDescription>
            Configure SMS login alerts to get notified when someone logs into
            your account from a new device or location.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Form-level errors */}
          {securityFormErrors.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/15 p-4">
              {securityFormErrors.map((error) => (
                <p className="text-destructive text-sm" key={String(error)}>
                  {String(error)}
                </p>
              ))}
            </div>
          )}

          {/* Success message */}
          {isSecuritySuccess && (
            <div className="rounded-lg border border-success/30 bg-success/15 p-4">
              <p className="text-success text-sm">
                {securityState &&
                typeof securityState === "object" &&
                "message" in securityState
                  ? String(securityState.message)
                  : "Security settings updated successfully"}
              </p>
            </div>
          )}

          {/* Error message */}
          {securityState &&
            typeof securityState === "object" &&
            "error" in securityState &&
            securityState.error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/15 p-4">
                <p className="font-medium text-destructive text-sm">
                  {String(securityState.error)}
                </p>
              </div>
            )}

          {/* Phone Number Field */}
          <securityForm.Field name="phoneNumber">
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>Phone Number</FieldLabel>
                  <FieldContent>
                    <Input
                      aria-invalid={isInvalid}
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="+14155551234"
                      type="tel"
                      value={field.state.value ?? ""}
                    />
                    <p className="text-muted-foreground text-xs">
                      Enter your phone number in E.164 format (e.g.,
                      +14155551234)
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
          </securityForm.Field>

          {/* Login Alerts Toggle */}
          <securityForm.Field name="loginAlertsEnabled">
            {(field) => (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label className="font-medium text-base" htmlFor={field.name}>
                    Login Alerts
                  </Label>
                  <p className="text-muted-foreground text-sm">
                    Receive an SMS when someone logs into your account from a
                    new device or IP address.
                  </p>
                </div>
                <Switch
                  checked={field.state.value}
                  id={field.name}
                  name={field.name}
                  onCheckedChange={(checked) => field.handleChange(checked)}
                  value={field.state.value ? "true" : "false"}
                />
                {/* Hidden input to ensure boolean is sent in FormData */}
                <input
                  name={field.name}
                  type="hidden"
                  value={field.state.value ? "true" : "false"}
                />
              </div>
            )}
          </securityForm.Field>
        </CardContent>
      </Card>

      <securityForm.Subscribe selector={(formState) => [formState.canSubmit]}>
        {([canSubmit]) => (
          <div className="flex space-x-2">
            <Button
              className="cursor-pointer"
              disabled={!canSubmit || isSecurityPending}
              loading={isSecurityPending}
              type="submit"
            >
              {isSecurityPending ? "Saving..." : "Save Security Settings"}
            </Button>
            <Button
              className="cursor-pointer"
              onClick={() => securityForm.reset()}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        )}
      </securityForm.Subscribe>
    </form>
  );
}
