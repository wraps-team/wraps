"use client";

import { mergeForm, useForm, useTransform } from "@tanstack/react-form";
import { initialFormState } from "@tanstack/react-form/nextjs";
import { useStore } from "@tanstack/react-store";
import { AlertCircle, CheckCircle, Copy, ExternalLink } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { connectAWSAccountAction } from "@/actions/aws-accounts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { connectAWSAccountFormOpts } from "@/lib/forms/connect-aws-account";

const AWS_REGIONS = [
  { value: "us-east-1", label: "US East 1 (N. Virginia)" },
  { value: "us-east-2", label: "US East 2 (Ohio)" },
  { value: "us-west-1", label: "US West 1 (N. California)" },
  { value: "us-west-2", label: "US West 2 (Oregon)" },
  { value: "eu-west-1", label: "EU West 1 (Ireland)" },
  { value: "eu-central-1", label: "EU Central 1 (Frankfurt)" },
  { value: "ap-southeast-1", label: "Asia Pacific Southeast 1 (Singapore)" },
  { value: "ap-southeast-2", label: "Asia Pacific Southeast 2 (Sydney)" },
  { value: "ap-northeast-1", label: "Asia Pacific Northeast 1 (Tokyo)" },
];

type ConnectAWSAccountFormProps = {
  organizationId: string;
  onSuccess?: () => void;
};

export function ConnectAWSAccountForm({
  organizationId,
  onSuccess,
}: ConnectAWSAccountFormProps) {
  const [state, action] = useActionState(
    connectAWSAccountAction,
    initialFormState
  );

  // Generate External ID once and persist in localStorage to survive page reloads
  // Use useEffect to avoid hydration mismatch
  const [externalId, setExternalId] = useState<string>("");
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);

    const storageKey = `wraps-external-id-${organizationId}`;
    const saved = localStorage.getItem(storageKey);

    if (saved) {
      setExternalId(saved);
    } else {
      const newId = crypto.randomUUID();
      localStorage.setItem(storageKey, newId);
      setExternalId(newId);
    }
  }, [organizationId]);

  const form = useForm({
    ...connectAWSAccountFormOpts,
    defaultValues: {
      ...connectAWSAccountFormOpts.defaultValues,
      organizationId,
      externalId,
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

  // Handle success callback
  if (isSuccess) {
    // Clear the saved External ID from localStorage on success
    const storageKey = `wraps-external-id-${organizationId}`;
    if (typeof window !== "undefined") {
      localStorage.removeItem(storageKey);
    }

    if (onSuccess) {
      onSuccess();
    }
  }

  // Use S3-hosted CloudFormation template (CloudFormation requires S3 or approved HTTPS sources)
  const templateUrl =
    "https://wraps-assets.s3.amazonaws.com/cloudformation/wraps-console-access-role.yaml";

  const cloudFormationUrl = `https://console.aws.amazon.com/cloudformation/home#/stacks/create/review?stackName=wraps-console-access&templateURL=${encodeURIComponent(templateUrl)}&param_ExternalId=${externalId}`;

  // Show loading state while External ID is being loaded
  if (!(isClient && externalId)) {
    return (
      <div className="mx-auto max-w-2xl space-y-8">
        <Card>
          <CardContent className="animate-pulse">
            <div className="mb-4 h-6 w-64 rounded bg-muted" />
            <div className="h-20 rounded bg-muted/50" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Step 1: Deploy CloudFormation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Step 1: Deploy IAM Role to Your AWS Account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel>Your External ID</FieldLabel>
            <InputGroup>
              <InputGroupInput
                className="font-mono"
                readOnly
                value={externalId}
              />
              <InputGroupAddon align="inline-end">
                <Button
                  onClick={() => {
                    navigator.clipboard.writeText(externalId);
                  }}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Copy className="size-4" />
                </Button>
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription>
              This ID is saved in your browser and will be used in
              CloudFormation. Don't worry if you refresh the page - it won't
              change.
            </FieldDescription>
          </Field>

          <div className="space-y-2">
            <Button asChild>
              <a
                href={cloudFormationUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLink className="size-4" />
                Deploy to AWS
              </a>
            </Button>

            <p className="text-muted-foreground text-sm">
              This will open AWS CloudFormation in a new tab. Review the stack
              and click "Create stack" to deploy the IAM role.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Connect Account */}
      <Card>
        <form
          action={action as never}
          className="space-y-6"
          onSubmit={() => form.handleSubmit()}
        >
          <CardHeader>
            <CardTitle className="text-lg">
              Step 2: Connect Your AWS Account
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Form-level errors */}
            {formErrors.length > 0 ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertDescription>
                  {formErrors.map((error) => (
                    <p key={String(error)}>{String(error)}</p>
                  ))}
                </AlertDescription>
              </Alert>
            ) : null}

            {/* Success message */}
            {isSuccess ? (
              <Alert>
                <CheckCircle className="size-4" />
                <AlertDescription>
                  AWS account connected successfully!
                </AlertDescription>
              </Alert>
            ) : null}

            {/* Error message */}
            {state &&
            typeof state === "object" &&
            "error" in state &&
            state.error ? (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>{String(state.error) as string}</AlertTitle>
                {"details" in state && state.details ? (
                  <AlertDescription className="text-xs">
                    {String(state.details) as string}
                  </AlertDescription>
                ) : null}
              </Alert>
            ) : null}

            {/* Hidden fields */}
            <input name="organizationId" type="hidden" value={organizationId} />
            <input name="externalId" type="hidden" value={externalId} />

            {/* Account Name */}
            <form.Field
              name="name"
              validators={{
                onChange: ({ value }) =>
                  value ? undefined : "Account name is required",
              }}
            >
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                const errors = field.state.meta.errors.map((error) => ({
                  message: String(error),
                }));
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Account Name</FieldLabel>
                    <Input
                      aria-invalid={isInvalid}
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Production"
                      type="text"
                      value={field.state.value}
                    />
                    {isInvalid && <FieldError errors={errors} />}
                  </Field>
                );
              }}
            </form.Field>

            {/* AWS Account ID */}
            <form.Field
              name="accountId"
              validators={{
                onChange: ({ value }) => {
                  if (!value) {
                    return "AWS Account ID is required";
                  }
                  if (!/^\d{12}$/.test(value)) {
                    return "AWS Account ID must be exactly 12 digits";
                  }
                  return;
                },
              }}
            >
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                const errors = field.state.meta.errors.map((error) => ({
                  message: String(error),
                }));
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>AWS Account ID</FieldLabel>
                    <Input
                      aria-invalid={isInvalid}
                      className="font-mono"
                      id={field.name}
                      maxLength={12}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="123456789012"
                      type="text"
                      value={field.state.value}
                    />
                    {isInvalid && <FieldError errors={errors} />}
                  </Field>
                );
              }}
            </form.Field>

            {/* Region */}
            <form.Field
              name="region"
              validators={{
                onChange: ({ value }) =>
                  value ? undefined : "Region is required",
              }}
            >
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                const errors = field.state.meta.errors.map((error) => ({
                  message: String(error),
                }));
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Region</FieldLabel>
                    <Select
                      defaultValue="us-east-1"
                      name={field.name}
                      onValueChange={(value) => field.handleChange(value)}
                      value={field.state.value}
                    >
                      <SelectTrigger
                        aria-invalid={isInvalid}
                        className="w-full"
                        id={field.name}
                        onBlur={field.handleBlur}
                      >
                        <SelectValue placeholder="Select a region" />
                      </SelectTrigger>
                      <SelectContent>
                        {AWS_REGIONS.map((region) => (
                          <SelectItem key={region.value} value={region.value}>
                            {region.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isInvalid && <FieldError errors={errors} />}
                  </Field>
                );
              }}
            </form.Field>

            {/* Role ARN */}
            <form.Field
              name="roleArn"
              validators={{
                onChange: ({ value }) => {
                  if (!value) {
                    return "Role ARN is required";
                  }
                  if (!value.startsWith("arn:aws:iam::")) {
                    return "Must be a valid IAM role ARN";
                  }
                  return;
                },
              }}
            >
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                const errors = field.state.meta.errors.map((error) => ({
                  message: String(error),
                }));
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Role ARN</FieldLabel>
                    <Input
                      aria-invalid={isInvalid}
                      className="font-mono text-sm"
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="arn:aws:iam::123456789012:role/wraps-console-access-role"
                      type="text"
                      value={field.state.value}
                    />
                    <FieldDescription>
                      Find this in the CloudFormation stack outputs after
                      deployment.
                    </FieldDescription>
                    {isInvalid && <FieldError errors={errors} />}
                  </Field>
                );
              }}
            </form.Field>

            {/* Submit button */}
            <form.Subscribe
              selector={(formState) => [
                formState.canSubmit,
                formState.isSubmitting,
              ]}
            >
              {([canSubmit, isSubmitting]) => (
                <Button
                  className="w-full"
                  disabled={!canSubmit}
                  loading={isSubmitting}
                  type="submit"
                >
                  {isSubmitting ? "Connecting..." : "Connect Account"}
                </Button>
              )}
            </form.Subscribe>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
