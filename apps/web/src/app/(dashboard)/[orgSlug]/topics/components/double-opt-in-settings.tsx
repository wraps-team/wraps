"use client";

import { useForm } from "@tanstack/react-form";
import type { topicSettings } from "@wraps/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Label } from "@wraps/ui/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@wraps/ui/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { TemplateSelector } from "@/components/template-editor/template-selector";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { updateTopicSettings } from "../actions";
import {
  captureDoubleOptInSettingsSaved,
  captureDoubleOptInTemplateChanged,
} from "./lib/analytics";

type TopicSettingsType = typeof topicSettings.$inferSelect;

type DoubleOptInSettingsProps = {
  organizationId: string;
  settings: TopicSettingsType | null;
  verifiedDomains: string[];
};

export function DoubleOptInSettings({
  organizationId,
  settings,
  verifiedDomains,
}: DoubleOptInSettingsProps) {
  const params = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Template state
  const [templateMode, setTemplateMode] = useState<"default" | "custom">(
    settings?.confirmationTemplateId ? "custom" : "default"
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<
    string | undefined
  >(settings?.confirmationTemplateId ?? undefined);

  const form = useForm({
    defaultValues: {
      confirmationFromName: settings?.confirmationFromName || "",
      confirmationFromEmail: settings?.confirmationFromEmail || "",
      confirmationReplyToEmail: settings?.confirmationReplyToEmail || "",
    },
    onSubmit: ({ value }) => {
      startTransition(async () => {
        const result = await updateTopicSettings(organizationId, {
          confirmationFromName: value.confirmationFromName || null,
          confirmationFromEmail: value.confirmationFromEmail || null,
          confirmationReplyToEmail: value.confirmationReplyToEmail || null,
          confirmationTemplateId:
            templateMode === "custom" ? selectedTemplateId : null,
        });

        if (result.success) {
          captureDoubleOptInSettingsSaved({ template_mode: templateMode });
          toast.success("Settings saved successfully");
          router.refresh();
        } else {
          toast.error(result.error || "Failed to save settings");
        }
      });
    },
  });

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    captureDoubleOptInTemplateChanged();
    startTransition(async () => {
      await updateTopicSettings(organizationId, {
        confirmationTemplateId: templateId,
      });
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirmation Email Settings</CardTitle>
        <CardDescription>
          Configure the sender details and email template for double opt-in
          confirmation emails. These settings apply to all topics that have
          double opt-in enabled. New sign-ups on those topics stay pending — and
          are skipped by every broadcast — until they click the confirmation
          link, so they show as Pending on the topics table until they do.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <form.Field name="confirmationFromName">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>From Name</FieldLabel>
                <FieldContent>
                  <Input
                    id={field.name}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="Acme Inc"
                    value={field.state.value}
                  />
                  <FieldDescription>
                    Display name shown in the email from field
                  </FieldDescription>
                </FieldContent>
              </Field>
            )}
          </form.Field>

          <form.Field
            name="confirmationFromEmail"
            validators={{
              onBlur: ({ value }) => {
                if (!value) {
                  return;
                }
                const result = z.string().email().safeParse(value);
                if (!result.success) {
                  return "Must be a valid email address";
                }
                const emailDomain = value.split("@")[1];
                if (
                  verifiedDomains.length > 0 &&
                  !verifiedDomains.includes(emailDomain)
                ) {
                  return `Email must be from a verified domain: ${verifiedDomains.join(", ")}`;
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
                  <FieldLabel htmlFor={field.name}>From Email</FieldLabel>
                  <FieldContent>
                    <Input
                      aria-invalid={isInvalid}
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="noreply@yourdomain.com"
                      type="email"
                      value={field.state.value}
                    />
                    <FieldDescription>
                      {verifiedDomains.length > 0 ? (
                        <>
                          Must be from a verified domain:{" "}
                          {verifiedDomains.join(", ")}
                        </>
                      ) : (
                        "Must be from a domain verified in your AWS SES"
                      )}
                    </FieldDescription>
                    {isInvalid && field.state.meta.errors.length > 0 && (
                      <p className="text-destructive text-sm">
                        {String(field.state.meta.errors[0])}
                      </p>
                    )}
                  </FieldContent>
                </Field>
              );
            }}
          </form.Field>

          <form.Field
            name="confirmationReplyToEmail"
            validators={{
              onBlur: ({ value }) => {
                if (!value) {
                  return;
                }
                const result = z.string().email().safeParse(value);
                if (!result.success) {
                  return "Must be a valid email address";
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
                    Reply-To Email (Optional)
                  </FieldLabel>
                  <FieldContent>
                    <Input
                      aria-invalid={isInvalid}
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="support@yourdomain.com"
                      type="email"
                      value={field.state.value}
                    />
                    <FieldDescription>
                      Where replies will be sent. Leave empty to use the from
                      email.
                    </FieldDescription>
                    {isInvalid && field.state.meta.errors.length > 0 && (
                      <p className="text-destructive text-sm">
                        {String(field.state.meta.errors[0])}
                      </p>
                    )}
                  </FieldContent>
                </Field>
              );
            }}
          </form.Field>

          {/* Email Template Section */}
          <div className="space-y-4 rounded-lg border p-4">
            <div>
              <Label className="font-semibold text-base">Email Template</Label>
              <p className="text-muted-foreground text-sm">
                Choose to use the default confirmation email or create a custom
                template.
              </p>
            </div>

            <RadioGroup
              className="space-y-2"
              onValueChange={(value) =>
                setTemplateMode(value as "default" | "custom")
              }
              value={templateMode}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem id="template-default" value="default" />
                <Label className="font-normal" htmlFor="template-default">
                  Use default template
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem id="template-custom" value="custom" />
                <Label className="font-normal" htmlFor="template-custom">
                  Use custom template
                </Label>
              </div>
            </RadioGroup>

            {templateMode === "custom" && (
              <div className="space-y-4 pt-2">
                <TemplateSelector
                  onTemplateChange={handleTemplateChange}
                  orgSlug={params.orgSlug}
                  selectedTemplateId={selectedTemplateId}
                />
                <p className="text-muted-foreground text-xs">
                  <strong>Tip:</strong> Your confirmation template should
                  include the{" "}
                  <code className="rounded bg-muted px-1">
                    {"{{confirmationUrl}}"}
                  </code>{" "}
                  variable for the confirmation link.
                </p>
              </div>
            )}
          </div>

          <Button disabled={isPending} type="submit">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
