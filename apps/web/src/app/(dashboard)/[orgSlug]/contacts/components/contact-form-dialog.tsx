"use client";

import { useForm } from "@tanstack/react-form";
import { useStore } from "@tanstack/react-store";
import { Checkbox } from "@wraps/ui/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wraps/ui/components/ui/dialog";
import { Label } from "@wraps/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import { Lock, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  type ContactStatus,
  type ContactWithMeta,
  EMAIL_STATUS_LABELS,
  EMAIL_STATUSES,
  type EmailStatus,
  SMS_STATUS_LABELS,
  SMS_STATUSES,
  type SmsStatus,
} from "@/lib/contacts";
import {
  type ContactFormInput,
  contactFormOpts,
  contactFormSchema,
  emptyContactFormValues,
} from "@/lib/forms/contact-form";
import type { TopicWithMeta } from "@/lib/topics";

type PropertyEntry = {
  id: string;
  key: string;
  value: string;
};

const SUBMIT_LABELS = {
  create: { idle: "Add Contact", pending: "Creating..." },
  edit: { idle: "Save Changes", pending: "Saving..." },
} as const;

/**
 * What the parents receive. In `edit` mode `undefined` means "this field did
 * not change" and the parent's update action skips it; `null` means "clear
 * this column". That three-way distinction is load-bearing — collapsing it
 * silently drops edits — so `buildEditPayload` below is the only place that
 * decides it, and `__tests__/contact-form-dialog.test.tsx` pins it.
 */
type ContactSubmitPayload = {
  email?: string;
  phone?: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  emailStatus?: EmailStatus;
  smsStatus?: SmsStatus;
  status?: ContactStatus;
  properties?: Record<string, unknown>;
  topicIds?: string[];
};

type ContactFormDialogProps = {
  contact?: ContactWithMeta | null;
  isPending: boolean;
  mode: "create" | "edit";
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ContactSubmitPayload) => void;
  open: boolean;
  orgSlug: string;
  proFeaturesEnabled?: boolean;
  topics: TopicWithMeta[];
};

/** Key/value rows collapse to an object, dropping rows with a blank key. */
function toPropertiesObject(entries: PropertyEntry[]): Record<string, string> {
  return entries.reduce(
    (acc, { key, value }) => {
      if (key.trim()) {
        acc[key.trim()] = value;
      }
      return acc;
    },
    {} as Record<string, string>
  );
}

function subscribedTopicIds(contact?: ContactWithMeta | null): string[] {
  return (
    contact?.topics
      ?.filter((t) => t.status === "subscribed")
      .map((t) => t.topicId) || []
  );
}

/**
 * A text field that changed: the new string, or `null` when it was cleared.
 * Unchanged fields are `undefined` so the update action leaves them alone.
 */
function changedTextOrNull(
  next: string,
  previous: string | null | undefined
): string | null | undefined {
  if (next === (previous || "")) {
    return;
  }
  return next || null;
}

/** Create sends everything the user filled in; there is nothing to diff against. */
function buildCreatePayload({
  properties,
  topicIds,
  values,
}: {
  properties: PropertyEntry[];
  topicIds: string[];
  values: ContactFormInput;
}): ContactSubmitPayload {
  const propertiesObj = toPropertiesObject(properties);

  return {
    email: values.email || undefined,
    phone: values.phone || undefined,
    firstName: values.firstName || undefined,
    lastName: values.lastName || undefined,
    company: values.company || undefined,
    jobTitle: values.jobTitle || undefined,
    emailStatus: values.email ? values.emailStatus : undefined,
    smsStatus: values.phone ? values.smsStatus : undefined,
    properties:
      Object.keys(propertiesObj).length > 0 ? propertiesObj : undefined,
    topicIds,
  };
}

/** Edit sends only what moved — see the note on `ContactSubmitPayload`. */
function buildEditPayload({
  contact,
  properties,
  topicIds,
  values,
}: {
  contact?: ContactWithMeta | null;
  properties: PropertyEntry[];
  topicIds: string[];
  values: ContactFormInput;
}): ContactSubmitPayload {
  const propertiesObj = toPropertiesObject(properties);

  // JSON comparison is enough here because both sides are flat string maps
  // built the same way, in the same insertion order.
  const propertiesChanged =
    JSON.stringify(contact?.properties || {}) !== JSON.stringify(propertiesObj);

  const currentTopicIds = new Set(subscribedTopicIds(contact));
  const nextTopicIds = new Set(topicIds);
  const topicsChanged =
    currentTopicIds.size !== nextTopicIds.size ||
    [...currentTopicIds].some((id) => !nextTopicIds.has(id));

  return {
    email: values.email !== (contact?.email || "") ? values.email : undefined,
    phone: values.phone !== (contact?.phone || "") ? values.phone : undefined,
    firstName: changedTextOrNull(values.firstName, contact?.firstName),
    lastName: changedTextOrNull(values.lastName, contact?.lastName),
    company: changedTextOrNull(values.company, contact?.company),
    jobTitle: changedTextOrNull(values.jobTitle, contact?.jobTitle),
    emailStatus:
      values.emailStatus !== contact?.emailStatus
        ? values.emailStatus
        : undefined,
    smsStatus:
      values.smsStatus !== contact?.smsStatus ? values.smsStatus : undefined,
    properties: propertiesChanged ? propertiesObj : undefined,
    topicIds: topicsChanged ? topicIds : undefined,
  };
}

function valuesForContact(contact?: ContactWithMeta | null): ContactFormInput {
  if (!contact) {
    return emptyContactFormValues;
  }
  return {
    email: contact.email || "",
    phone: contact.phone || "",
    firstName: contact.firstName || "",
    lastName: contact.lastName || "",
    company: contact.company || "",
    jobTitle: contact.jobTitle || "",
    emailStatus: contact.emailStatus || "active",
    smsStatus: contact.smsStatus || "pending_consent",
  };
}

export function ContactFormDialog({
  contact,
  isPending,
  mode,
  onOpenChange,
  onSubmit,
  open,
  orgSlug,
  proFeaturesEnabled = true,
  topics,
}: ContactFormDialogProps) {
  // Topics and custom properties stay outside the form store, matching
  // contact-details-sheet.tsx — they are list editors, not scalar fields.
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [properties, setProperties] = useState<PropertyEntry[]>([]);

  const form = useForm({
    ...contactFormOpts,
    defaultValues:
      mode === "edit" ? valuesForContact(contact) : emptyContactFormValues,
    validators: { onChange: contactFormSchema },
    onSubmit: ({ value }) => {
      // Belt and braces with the disabled submit button: a contact with
      // neither email nor phone is unreachable and must never be created.
      if (!(value.email || value.phone)) {
        return;
      }
      const args = {
        properties,
        topicIds: selectedTopicIds,
        values: value,
      };
      onSubmit(
        mode === "create"
          ? buildCreatePayload(args)
          : buildEditPayload({ ...args, contact })
      );
    },
  });

  // Reload the form whenever the dialog opens on a (possibly different) contact.
  useEffect(() => {
    if (!open) {
      return;
    }
    const source = mode === "edit" ? contact : null;
    form.reset(valuesForContact(source));
    setSelectedTopicIds(subscribedTopicIds(source));
    setProperties(
      Object.entries(source?.properties || {}).map(([key, value]) => ({
        id: crypto.randomUUID(),
        key,
        value: String(value),
      }))
    );
  }, [open, mode, contact, form]);

  const emailValue = useStore(form.store, (state) => state.values.email);
  const phoneValue = useStore(form.store, (state) => state.values.phone);

  const toggleTopic = (topicId: string) => {
    setSelectedTopicIds((prev) =>
      prev.includes(topicId)
        ? prev.filter((id) => id !== topicId)
        : [...prev, topicId]
    );
  };

  const addProperty = () => {
    setProperties((prev) => [
      ...prev,
      { id: crypto.randomUUID(), key: "", value: "" },
    ]);
  };

  const removeProperty = (index: number) => {
    setProperties((prev) => prev.filter((_, i) => i !== index));
  };

  const updateProperty = (
    index: number,
    field: "key" | "value",
    newValue: string
  ) => {
    setProperties((prev) =>
      prev.map((prop, i) =>
        i === index ? { ...prop, [field]: newValue } : prop
      )
    );
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-[500px]">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {mode === "create" ? "Add Contact" : "Edit Contact"}
            </DialogTitle>
            <DialogDescription>
              {mode === "create"
                ? "Add a new contact to your audience. Email or phone is required."
                : "Update the contact's information."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Email */}
            <form.Field name="email">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Email address</FieldLabel>
                    <FieldContent>
                      <Input
                        aria-invalid={isInvalid}
                        id={field.name}
                        name={field.name}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="contact@example.com"
                        type="email"
                        value={field.state.value}
                      />
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </FieldContent>
                  </Field>
                );
              }}
            </form.Field>

            {emailValue && (
              <form.Field name="emailStatus">
                {(field) => (
                  <div className="flex items-center gap-2">
                    <Label
                      className="text-muted-foreground text-xs"
                      htmlFor={field.name}
                    >
                      Email status:
                    </Label>
                    <Select
                      onValueChange={(value) =>
                        field.handleChange(value as EmailStatus)
                      }
                      value={field.state.value}
                    >
                      <SelectTrigger
                        className="w-[140px]"
                        id={field.name}
                        size="touch"
                      >
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        {EMAIL_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {EMAIL_STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>
            )}

            {/* Phone */}
            <form.Field name="phone">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Phone number</FieldLabel>
                  <FieldContent>
                    <Input
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="+1 555 123 4567"
                      type="tel"
                      value={field.state.value}
                    />
                    <p className="text-muted-foreground text-xs">
                      Use E.164 format (e.g., +15551234567)
                    </p>
                  </FieldContent>
                </Field>
              )}
            </form.Field>

            {phoneValue && (
              <form.Field name="smsStatus">
                {(field) => (
                  <div className="flex items-center gap-2">
                    <Label
                      className="text-muted-foreground text-xs"
                      htmlFor={field.name}
                    >
                      SMS status:
                    </Label>
                    <Select
                      onValueChange={(value) =>
                        field.handleChange(value as SmsStatus)
                      }
                      value={field.state.value}
                    >
                      <SelectTrigger
                        className="w-[160px]"
                        id={field.name}
                        size="touch"
                      >
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        {SMS_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {SMS_STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>
            )}

            {/* Contact Details */}
            <div className="grid grid-cols-2 gap-4">
              <form.Field name="firstName">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>First name</FieldLabel>
                    <FieldContent>
                      <Input
                        id={field.name}
                        name={field.name}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="John"
                        value={field.state.value}
                      />
                    </FieldContent>
                  </Field>
                )}
              </form.Field>

              <form.Field name="lastName">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Last name</FieldLabel>
                    <FieldContent>
                      <Input
                        id={field.name}
                        name={field.name}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Doe"
                        value={field.state.value}
                      />
                    </FieldContent>
                  </Field>
                )}
              </form.Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <form.Field name="company">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Company</FieldLabel>
                    <FieldContent>
                      <Input
                        id={field.name}
                        name={field.name}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Acme Inc."
                        value={field.state.value}
                      />
                    </FieldContent>
                  </Field>
                )}
              </form.Field>

              <form.Field name="jobTitle">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Job title</FieldLabel>
                    <FieldContent>
                      <Input
                        id={field.name}
                        name={field.name}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Software Engineer"
                        value={field.state.value}
                      />
                    </FieldContent>
                  </Field>
                )}
              </form.Field>
            </div>

            {/* Topics */}
            {proFeaturesEnabled && topics.length > 0 && (
              <div className="grid gap-2">
                <Label>
                  {mode === "create"
                    ? "Subscribe to topics"
                    : "Topic subscriptions"}
                </Label>
                <div className="max-h-[150px] space-y-2 overflow-y-auto rounded-md border p-3">
                  {topics.map((topic) => (
                    <div className="flex items-center space-x-2" key={topic.id}>
                      <Checkbox
                        checked={selectedTopicIds.includes(topic.id)}
                        id={`topic-${topic.id}`}
                        onCheckedChange={() => toggleTopic(topic.id)}
                      />
                      <Label
                        className="cursor-pointer font-normal"
                        htmlFor={`topic-${topic.id}`}
                      >
                        {topic.name}
                        {topic.description && (
                          <span className="ml-1 text-muted-foreground text-xs">
                            - {topic.description}
                          </span>
                        )}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Properties */}
            {proFeaturesEnabled ? (
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label>Custom properties</Label>
                  <Button
                    className="h-7 text-xs"
                    onClick={addProperty}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add
                  </Button>
                </div>
                {properties.length > 0 ? (
                  <div className="max-h-[150px] space-y-2 overflow-y-auto rounded-md border p-3">
                    {properties.map((prop, index) => (
                      <div className="flex items-center gap-2" key={prop.id}>
                        <Input
                          className="h-8 flex-1"
                          onChange={(e) =>
                            updateProperty(index, "key", e.target.value)
                          }
                          placeholder="key"
                          value={prop.key}
                        />
                        <Input
                          className="h-8 flex-1"
                          onChange={(e) =>
                            updateProperty(index, "value", e.target.value)
                          }
                          placeholder="value"
                          value={prop.value}
                        />
                        <Button
                          aria-label="Remove property"
                          className="h-8 w-8 shrink-0 p-0"
                          onClick={() => removeProperty(index)}
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    No custom properties. Add key-value pairs like firstName,
                    company, plan, etc.
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-dashed p-3">
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Lock className="h-4 w-4" />
                  <span>Topics &amp; custom properties require a</span>
                  <Link
                    className="font-medium text-primary hover:underline"
                    href={`/${orgSlug}/settings/billing`}
                  >
                    paid plan
                  </Link>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <form.Subscribe
              selector={(state) => ({
                canSubmit: state.canSubmit,
                hasContactMethod: Boolean(
                  state.values.email || state.values.phone
                ),
              })}
            >
              {({ canSubmit, hasContactMethod }) => (
                <Button
                  disabled={isPending || !canSubmit || !hasContactMethod}
                  type="submit"
                >
                  {SUBMIT_LABELS[mode][isPending ? "pending" : "idle"]}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
