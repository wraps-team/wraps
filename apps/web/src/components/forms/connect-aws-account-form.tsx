"use client";

import { mergeForm, useForm, useTransform } from "@tanstack/react-form";
import { initialFormState } from "@tanstack/react-form/nextjs";
import { useStore } from "@tanstack/react-store";
import { useActionState, useEffect, useState } from "react";
import { connectAWSAccountAction } from "@/actions/aws-accounts";
import { connectAWSAccountFormOpts } from "@/lib/forms/connect-aws-account";

const AWS_REGIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-east-2", label: "US East (Ohio)" },
  { value: "us-west-1", label: "US West (N. California)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "eu-west-1", label: "EU (Ireland)" },
  { value: "eu-central-1", label: "EU (Frankfurt)" },
  { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" },
  { value: "ap-southeast-2", label: "Asia Pacific (Sydney)" },
  { value: "ap-northeast-1", label: "Asia Pacific (Tokyo)" },
];

interface ConnectAWSAccountFormProps {
  organizationId: string;
  onSuccess?: () => void;
}

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
        <div className="rounded-lg border bg-white p-6 shadow-sm">
          <div className="animate-pulse">
            <div className="mb-4 h-6 w-64 rounded bg-gray-200" />
            <div className="h-20 rounded bg-gray-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Step 1: Deploy CloudFormation */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <h3 className="mb-4 font-semibold text-lg">
          Step 1: Deploy IAM Role to Your AWS Account
        </h3>

        <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-4">
          <p className="mb-2 font-medium text-blue-900 text-sm">
            Your External ID (saved - safe to reload page):
          </p>
          <div className="flex items-center gap-2">
            <code className="block flex-1 rounded border border-blue-300 bg-white p-2 font-mono text-sm">
              {externalId}
            </code>
            <button
              className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
              onClick={() => {
                navigator.clipboard.writeText(externalId);
              }}
              type="button"
            >
              Copy
            </button>
          </div>
          <p className="mt-2 text-blue-700 text-xs">
            ⓘ This ID is saved in your browser and will be used in
            CloudFormation. Don't worry if you refresh the page - it won't
            change.
          </p>
        </div>

        <a
          className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-white transition-colors hover:bg-blue-700"
          href={cloudFormationUrl}
          rel="noopener noreferrer"
          target="_blank"
        >
          Deploy to AWS →
        </a>

        <p className="mt-4 text-gray-600 text-sm">
          This will open AWS CloudFormation in a new tab. Review the stack and
          click "Create stack" to deploy the IAM role.
        </p>
      </div>

      {/* Step 2: Connect Account */}
      <form
        action={action as never}
        className="space-y-6 rounded-lg border bg-white p-6 shadow-sm"
        onSubmit={() => form.handleSubmit()}
      >
        <h3 className="mb-4 font-semibold text-lg">
          Step 2: Connect Your AWS Account
        </h3>

        {/* Form-level errors */}
        {formErrors.length > 0 ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            {formErrors.map((error, i) => (
              <p className="text-red-600 text-sm" key={i}>
                {String(error)}
              </p>
            ))}
          </div>
        ) : null}

        {/* Success message */}
        {isSuccess ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <p className="text-green-600 text-sm">
              ✓ AWS account connected successfully!
            </p>
          </div>
        ) : null}

        {/* Error message */}
        {state &&
        typeof state === "object" &&
        "error" in state &&
        state.error ? (
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
          {(field) => (
            <div>
              <label
                className="mb-2 block font-medium text-gray-700 text-sm"
                htmlFor={field.name}
              >
                Account Name
              </label>
              <input
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                id={field.name}
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Production"
                type="text"
                value={field.state.value}
              />
              {field.state.meta.errors.length > 0 && (
                <div className="mt-1 space-y-1">
                  {field.state.meta.errors.map((error) => (
                    <p className="text-red-600 text-sm" key={error as string}>
                      {error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </form.Field>

        {/* AWS Account ID */}
        <form.Field
          name="accountId"
          validators={{
            onChange: ({ value }) => {
              if (!value) return "AWS Account ID is required";
              if (!/^\d{12}$/.test(value))
                return "AWS Account ID must be exactly 12 digits";
              return;
            },
          }}
        >
          {(field) => (
            <div>
              <label
                className="mb-2 block font-medium text-gray-700 text-sm"
                htmlFor={field.name}
              >
                AWS Account ID
              </label>
              <input
                className="w-full rounded-lg border border-gray-300 px-4 py-2 font-mono focus:border-transparent focus:ring-2 focus:ring-blue-500"
                id={field.name}
                maxLength={12}
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="123456789012"
                type="text"
                value={field.state.value}
              />
              {field.state.meta.errors.length > 0 && (
                <div className="mt-1 space-y-1">
                  {field.state.meta.errors.map((error) => (
                    <p className="text-red-600 text-sm" key={error as string}>
                      {error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </form.Field>

        {/* Region */}
        <form.Field
          name="region"
          validators={{
            onChange: ({ value }) => (value ? undefined : "Region is required"),
          }}
        >
          {(field) => (
            <div>
              <label
                className="mb-2 block font-medium text-gray-700 text-sm"
                htmlFor={field.name}
              >
                Region
              </label>
              <select
                className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                id={field.name}
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                value={field.state.value}
              >
                {AWS_REGIONS.map((region) => (
                  <option key={region.value} value={region.value}>
                    {region.label}
                  </option>
                ))}
              </select>
              {field.state.meta.errors.length > 0 && (
                <div className="mt-1 space-y-1">
                  {field.state.meta.errors.map((error) => (
                    <p className="text-red-600 text-sm" key={error as string}>
                      {error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </form.Field>

        {/* Role ARN */}
        <form.Field
          name="roleArn"
          validators={{
            onChange: ({ value }) => {
              if (!value) return "Role ARN is required";
              if (!value.startsWith("arn:aws:iam::"))
                return "Must be a valid IAM role ARN";
              return;
            },
          }}
        >
          {(field) => (
            <div>
              <label
                className="mb-2 block font-medium text-gray-700 text-sm"
                htmlFor={field.name}
              >
                Role ARN
              </label>
              <input
                className="w-full rounded-lg border border-gray-300 px-4 py-2 font-mono text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                id={field.name}
                name={field.name}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="arn:aws:iam::123456789012:role/wraps-console-access-role"
                type="text"
                value={field.state.value}
              />
              <p className="mt-1 text-gray-500 text-xs">
                Find this in the CloudFormation stack outputs after deployment.
              </p>
              {field.state.meta.errors.length > 0 && (
                <div className="mt-1 space-y-1">
                  {field.state.meta.errors.map((error) => (
                    <p className="text-red-600 text-sm" key={error as string}>
                      {error}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </form.Field>

        {/* Submit button */}
        <form.Subscribe
          selector={(formState) => [
            formState.canSubmit,
            formState.isSubmitting,
          ]}
        >
          {([canSubmit, isSubmitting]) => (
            <button
              className="w-full rounded-lg bg-blue-600 px-6 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canSubmit || isSubmitting}
              type="submit"
            >
              {isSubmitting ? "Connecting..." : "Connect Account"}
            </button>
          )}
        </form.Subscribe>
      </form>
    </div>
  );
}
