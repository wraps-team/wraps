"use client";

import { useForm } from "@tanstack/react-form";
import { Alert, AlertDescription } from "@wraps/ui/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  Loader2Icon,
  PlusIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  type AWSAccountWithCreator,
  listAWSAccounts,
} from "@/actions/aws-accounts";
import { addSendingDomain } from "@/actions/domains";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type AddDomainFormProps = {
  organizationId: string;
};

const WHITESPACE_RE = /\s/;

/**
 * Reject a value that is clearly not a domain, mirroring the server-side
 * check in `addSendingDomain` — this is UX feedback only; the server is the
 * real gate.
 */
function invalidDomainReason(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Enter a domain.";
  }
  if (trimmed.includes("@")) {
    return "Enter a domain, not an email address.";
  }
  if (WHITESPACE_RE.test(trimmed)) {
    return "A domain cannot contain spaces.";
  }
  if (trimmed.includes("://")) {
    return "Enter a domain, not a URL — leave off the https://.";
  }
  if (trimmed.includes("/")) {
    return "Enter a domain, not a path.";
  }
  return;
}

export function AddDomainForm({ organizationId }: AddDomainFormProps) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<AWSAccountWithCreator[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [resultMessage, setResultMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setAccountsLoading(true);
      const result = await listAWSAccounts(organizationId);
      if (cancelled) {
        return;
      }
      if (result.success) {
        setAccounts(result.accounts);
      }
      setAccountsLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const form = useForm({
    defaultValues: {
      domain: "",
      awsAccountId: "",
    },
    onSubmit: async ({ value, formApi }) => {
      setResultMessage(null);
      const result = await addSendingDomain(
        organizationId,
        value.awsAccountId,
        value.domain
      );
      if (result.success) {
        setResultMessage({
          kind: "success",
          text: result.alreadyExisted
            ? `${result.domain} was already added. Publish its DKIM CNAME records below to finish verification.`
            : `${result.domain} added. Publish its DKIM CNAME records below to verify it for sending.`,
        });
        formApi.setFieldValue("domain", "");
        // The action already revalidated the route; refresh re-fetches the
        // server component so the new identity's DKIM records show up here
        // without a manual reload.
        router.refresh();
      } else {
        setResultMessage({ kind: "error", text: result.error });
      }
    },
  });

  // Auto-select the only AWS account once accounts load — a single-option
  // selector is noise, and most orgs have exactly one account.
  useEffect(() => {
    if (accounts.length === 1 && !form.getFieldValue("awsAccountId")) {
      form.setFieldValue("awsAccountId", accounts[0].id);
    }
  }, [accounts, form]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a sending domain</CardTitle>
        <CardDescription>
          Creates the identity in SES with SES-managed Easy DKIM — no MAIL FROM
          subdomain is configured here. Run{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            wraps email domains add
          </code>{" "}
          from the CLI if you need one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          {accounts.length > 1 && (
            <form.Field name="awsAccountId">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>AWS account</FieldLabel>
                  <Select
                    name={field.name}
                    onValueChange={(value) => field.handleChange(value)}
                    value={field.state.value}
                  >
                    <SelectTrigger id={field.name} onBlur={field.handleBlur}>
                      <SelectValue placeholder="Select an AWS account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </form.Field>
          )}

          <form.Field
            name="domain"
            validators={{
              onChange: ({ value }) => invalidDomainReason(value),
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
                  <FieldLabel htmlFor={field.name}>Domain</FieldLabel>
                  <Input
                    aria-invalid={isInvalid}
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="example.com"
                    type="text"
                    value={field.state.value}
                  />
                  {isInvalid && <FieldError errors={errors} />}
                </Field>
              );
            }}
          </form.Field>

          {resultMessage && (
            <Alert
              variant={
                resultMessage.kind === "error" ? "destructive" : "default"
              }
            >
              {resultMessage.kind === "error" ? (
                <AlertCircleIcon className="size-4" />
              ) : (
                <CheckCircle2Icon className="size-4" />
              )}
              <AlertDescription>{resultMessage.text}</AlertDescription>
            </Alert>
          )}

          <form.Subscribe
            selector={(state) => [state.isSubmitting, state.canSubmit] as const}
          >
            {([isSubmitting, canSubmit]) => (
              <Button
                disabled={
                  isSubmitting ||
                  !canSubmit ||
                  accountsLoading ||
                  accounts.length === 0
                }
                type="submit"
              >
                {isSubmitting ? (
                  <>
                    <Loader2Icon className="mr-2 size-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <PlusIcon className="mr-2 size-4" />
                    Add domain
                  </>
                )}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  );
}
