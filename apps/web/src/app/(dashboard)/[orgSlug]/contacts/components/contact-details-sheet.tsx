"use client";

import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { Badge } from "@wraps/ui/components/ui/badge";
import { Checkbox } from "@wraps/ui/components/ui/checkbox";
import { Label } from "@wraps/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@wraps/ui/components/ui/sheet";
import { Loader2, Lock, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getContact } from "@/actions/contacts";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/ui/shadcn-io/copy-button";
import {
  type ContactStatus,
  type ContactWithMeta,
  EMAIL_STATUS_COLORS,
  EMAIL_STATUS_LABELS,
  EMAIL_STATUSES,
  type EmailStatus,
  engagementRate,
  SMS_STATUS_COLORS,
  SMS_STATUS_LABELS,
  SMS_STATUSES,
  type SmsStatus,
} from "@/lib/contacts";
import {
  type ContactDetailsInput,
  contactDetailsFormOpts,
} from "@/lib/forms/contact-details";
import type { TopicWithMeta } from "@/lib/topics";
import { ContactTimeline } from "./contact-timeline";

type PropertyEntry = {
  id: string;
  key: string;
  value: string;
};

type ContactDetailsSheetProps = {
  contact: ContactWithMeta | null;
  contactId?: string | null;
  isPending: boolean;
  onClose: () => void;
  onSave: (data: {
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
  }) => void;
  open: boolean;
  organizationId: string;
  orgSlug: string;
  proFeaturesEnabled?: boolean;
  topics: TopicWithMeta[];
  userRole: string;
};

export function ContactDetailsSheet({
  contact: contactProp,
  contactId,
  isPending,
  onClose,
  onSave,
  open,
  organizationId,
  orgSlug,
  proFeaturesEnabled = true,
  topics,
  userRole,
}: ContactDetailsSheetProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [properties, setProperties] = useState<PropertyEntry[]>([]);

  // Self-fetch when we have a contactId but no contact prop.
  // Uses React Query so the command palette can prefetchQuery with the same key
  // and the data is already cached when the sheet opens.
  const idToFetch = contactId && !contactProp ? contactId : null;
  const { data: fetchedContact, isLoading } = useQuery({
    queryKey: ["contact", "detail", idToFetch],
    queryFn: async () => {
      const result = await getContact(idToFetch!, organizationId);
      if (!result.success) {
        return null;
      }
      return result.contact;
    },
    enabled: open && !!idToFetch,
    staleTime: 30_000,
  });

  const contact = contactProp ?? fetchedContact ?? null;

  // TanStack Form for contact details
  const form = useForm({
    ...contactDetailsFormOpts,
    defaultValues: {
      email: contact?.email || "",
      phone: contact?.phone || "",
      firstName: contact?.firstName || "",
      lastName: contact?.lastName || "",
      company: contact?.company || "",
      jobTitle: contact?.jobTitle || "",
      emailStatus: (contact?.emailStatus ||
        "active") as ContactDetailsInput["emailStatus"],
      smsStatus: (contact?.smsStatus ||
        "pending_consent") as ContactDetailsInput["smsStatus"],
    },
  });

  // Reset form and exit edit mode when contact changes or sheet opens
  useEffect(() => {
    if (open && contact) {
      form.reset();
      form.setFieldValue("email", contact.email || "");
      form.setFieldValue("phone", contact.phone || "");
      form.setFieldValue("firstName", contact.firstName || "");
      form.setFieldValue("lastName", contact.lastName || "");
      form.setFieldValue("company", contact.company || "");
      form.setFieldValue("jobTitle", contact.jobTitle || "");
      form.setFieldValue(
        "emailStatus",
        (contact.emailStatus || "active") as ContactDetailsInput["emailStatus"]
      );
      form.setFieldValue(
        "smsStatus",
        (contact.smsStatus ||
          "pending_consent") as ContactDetailsInput["smsStatus"]
      );
      setSelectedTopicIds(
        contact.topics
          ?.filter((t) => t.status === "subscribed")
          .map((t) => t.topicId) || []
      );
      setProperties(
        Object.entries(contact.properties || {}).map(([key, value]) => ({
          id: crypto.randomUUID(),
          key,
          value: String(value),
        }))
      );
      setIsEditing(false);
    }
  }, [open, contact, form]);

  const handleSave = useCallback(() => {
    if (!contact) {
      return;
    }

    const values = form.state.values;
    const propertiesObj = properties.reduce(
      (acc, { key, value }) => {
        if (key.trim()) {
          acc[key.trim()] = value;
        }
        return acc;
      },
      {} as Record<string, string>
    );

    const oldPropertiesStr = JSON.stringify(contact.properties || {});
    const newPropertiesStr = JSON.stringify(propertiesObj);
    const propertiesChanged = oldPropertiesStr !== newPropertiesStr;

    const currentTopicIds = new Set(
      contact.topics
        ?.filter((t) => t.status === "subscribed")
        .map((t) => t.topicId) || []
    );
    const newTopicIds = new Set(selectedTopicIds);
    const topicsChanged =
      currentTopicIds.size !== newTopicIds.size ||
      [...currentTopicIds].some((id) => !newTopicIds.has(id));

    // Only send changed fields
    onSave({
      email: values.email !== (contact.email || "") ? values.email : undefined,
      phone: values.phone !== (contact.phone || "") ? values.phone : undefined,
      firstName:
        values.firstName !== (contact.firstName || "")
          ? values.firstName || null
          : undefined,
      lastName:
        values.lastName !== (contact.lastName || "")
          ? values.lastName || null
          : undefined,
      company:
        values.company !== (contact.company || "")
          ? values.company || null
          : undefined,
      jobTitle:
        values.jobTitle !== (contact.jobTitle || "")
          ? values.jobTitle || null
          : undefined,
      emailStatus:
        values.emailStatus !== contact.emailStatus
          ? values.emailStatus
          : undefined,
      smsStatus:
        values.smsStatus !== contact.smsStatus ? values.smsStatus : undefined,
      properties: propertiesChanged ? propertiesObj : undefined,
      topicIds: topicsChanged ? selectedTopicIds : undefined,
    });

    setIsEditing(false);
  }, [contact, form.state.values, properties, selectedTopicIds, onSave]);

  const handleCancel = useCallback(() => {
    if (!contact) {
      return;
    }

    // Reset form to original values
    form.setFieldValue("email", contact.email || "");
    form.setFieldValue("phone", contact.phone || "");
    form.setFieldValue("firstName", contact.firstName || "");
    form.setFieldValue("lastName", contact.lastName || "");
    form.setFieldValue("company", contact.company || "");
    form.setFieldValue("jobTitle", contact.jobTitle || "");
    form.setFieldValue(
      "emailStatus",
      (contact.emailStatus || "active") as ContactDetailsInput["emailStatus"]
    );
    form.setFieldValue(
      "smsStatus",
      (contact.smsStatus ||
        "pending_consent") as ContactDetailsInput["smsStatus"]
    );
    setSelectedTopicIds(
      contact.topics
        ?.filter((t) => t.status === "subscribed")
        .map((t) => t.topicId) || []
    );
    setProperties(
      Object.entries(contact.properties || {}).map(([key, value]) => ({
        id: crypto.randomUUID(),
        key,
        value: String(value),
      }))
    );
    setIsEditing(false);
  }, [contact, form]);

  // Get current form values for validation (must be before early return)
  const emailValue = useStore(form.store, (state) => state.values.email);
  const phoneValue = useStore(form.store, (state) => state.values.phone);
  const hasValidContact = !!(emailValue || phoneValue);

  if (!contact) {
    // Show loading skeleton when sheet is open but data is still loading
    if (open && isLoading) {
      return (
        <Sheet onOpenChange={(isOpen) => !isOpen && onClose()} open={open}>
          <SheetContent
            className="flex flex-col overflow-hidden p-0 sm:max-w-lg"
            hideCloseButton
          >
            <SheetHeader className="border-b px-6 py-4">
              <div className="flex items-center justify-between">
                <SheetTitle className="font-semibold text-lg">
                  Contact Details
                </SheetTitle>
                <Button
                  className="h-8 w-8"
                  onClick={onClose}
                  size="icon"
                  variant="ghost"
                >
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </Button>
              </div>
            </SheetHeader>
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          </SheetContent>
        </Sheet>
      );
    }
    return null;
  }

  const canEdit = userRole === "owner" || userRole === "admin";
  const subscribedTopics =
    contact.topics?.filter((t) => t.status === "subscribed") || [];

  // Engagement rates. engagementRate() returns null when the counters can't
  // produce an honest percentage — see the note on the helper — and the labels
  // below fall back to the raw count rather than printing an impossible rate.
  const emailOpenRate = engagementRate(
    contact.emailsOpened,
    contact.emailsSent
  );
  const emailClickRate = engagementRate(
    contact.emailsClicked,
    contact.emailsSent
  );
  const smsClickRate = engagementRate(contact.smsClicked, contact.smsSent);

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
    <Sheet onOpenChange={(isOpen) => !isOpen && onClose()} open={open}>
      <SheetContent
        className="flex flex-col overflow-hidden p-0 sm:max-w-lg"
        hideCloseButton
      >
        <SheetHeader className="border-b px-6 py-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="font-semibold text-lg">
              Contact Details
            </SheetTitle>
            <div className="flex items-center gap-1">
              {canEdit && !isEditing && (
                <Button
                  onClick={() => setIsEditing(true)}
                  size="sm"
                  variant="outline"
                >
                  Edit
                </Button>
              )}
              {isEditing && (
                <>
                  <Button onClick={handleCancel} size="sm" variant="ghost">
                    Cancel
                  </Button>
                  <Button
                    disabled={isPending || !hasValidContact}
                    onClick={handleSave}
                    size="sm"
                  >
                    {isPending ? "Saving..." : "Save"}
                  </Button>
                </>
              )}
              <Button
                className="h-8 w-8"
                onClick={onClose}
                size="icon"
                variant="ghost"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-6 p-6">
            {/* Contact Info */}
            {isEditing ? (
              <div className="space-y-4">
                {/* Email */}
                <form.Field name="email">
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>
                        Email address
                      </FieldLabel>
                      <FieldContent>
                        <Input
                          id={field.name}
                          name={field.name}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="contact@example.com"
                          type="email"
                          value={field.state.value}
                        />
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>

                {emailValue && (
                  <form.Field name="emailStatus">
                    {(field) => (
                      <div className="flex items-center gap-2">
                        <Label className="text-muted-foreground text-xs">
                          Status:
                        </Label>
                        <Select
                          onValueChange={(v) =>
                            field.handleChange(
                              v as ContactDetailsInput["emailStatus"]
                            )
                          }
                          value={field.state.value}
                        >
                          <SelectTrigger className="h-7 w-[140px]">
                            <SelectValue />
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
                          E.164 format (e.g., +15551234567)
                        </p>
                      </FieldContent>
                    </Field>
                  )}
                </form.Field>

                {phoneValue && (
                  <form.Field name="smsStatus">
                    {(field) => (
                      <div className="flex items-center gap-2">
                        <Label className="text-muted-foreground text-xs">
                          Status:
                        </Label>
                        <Select
                          onValueChange={(v) =>
                            field.handleChange(
                              v as ContactDetailsInput["smsStatus"]
                            )
                          }
                          value={field.state.value}
                        >
                          <SelectTrigger className="h-7 w-[160px]">
                            <SelectValue />
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
              </div>
            ) : (
              <div className="space-y-3">
                {contact.email && (
                  <div className="group flex items-center gap-2">
                    <span className="font-medium">{contact.email}</span>
                    <CopyButton
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      content={contact.email}
                      size="sm"
                      variant="ghost"
                    />
                    {contact.emailStatus && (
                      <Badge
                        className={EMAIL_STATUS_COLORS[contact.emailStatus]}
                        variant="secondary"
                      >
                        {EMAIL_STATUS_LABELS[contact.emailStatus]}
                      </Badge>
                    )}
                  </div>
                )}
                {contact.phone && (
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">
                      {contact.phone}
                    </span>
                    {contact.smsStatus && (
                      <Badge
                        className={SMS_STATUS_COLORS[contact.smsStatus]}
                        variant="secondary"
                      >
                        {SMS_STATUS_LABELS[contact.smsStatus]}
                      </Badge>
                    )}
                  </div>
                )}
                {/* Contact Details */}
                {(contact.firstName ||
                  contact.lastName ||
                  contact.company ||
                  contact.jobTitle) && (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    {(contact.firstName || contact.lastName) && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Name: </span>
                        <span>
                          {[contact.firstName, contact.lastName]
                            .filter(Boolean)
                            .join(" ")}
                        </span>
                      </div>
                    )}
                    {contact.company && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Company: </span>
                        <span>{contact.company}</span>
                      </div>
                    )}
                    {contact.jobTitle && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">
                          Job title:{" "}
                        </span>
                        <span>{contact.jobTitle}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Email Engagement */}
            {contact.email && !isEditing && (
              <div className="space-y-3">
                <h3 className="font-medium text-sm">Email Engagement</h3>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border bg-muted/30 p-3 text-center">
                    <div className="font-semibold text-2xl">
                      {contact.emailsSent}
                    </div>
                    <div className="text-muted-foreground text-xs">Sent</div>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 text-center">
                    <div className="font-semibold text-2xl">
                      {contact.emailsOpened}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {emailOpenRate === null
                        ? "Opens"
                        : `Opens (${emailOpenRate.toFixed(0)}%)`}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 text-center">
                    <div className="font-semibold text-2xl">
                      {contact.emailsClicked}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {emailClickRate === null
                        ? "Clicks"
                        : `Clicks (${emailClickRate.toFixed(0)}%)`}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SMS Engagement */}
            {contact.phone && !isEditing && (
              <div className="space-y-3">
                <h3 className="font-medium text-sm">SMS Engagement</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-muted/30 p-3 text-center">
                    <div className="font-semibold text-2xl">
                      {contact.smsSent}
                    </div>
                    <div className="text-muted-foreground text-xs">Sent</div>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 text-center">
                    <div className="font-semibold text-2xl">
                      {contact.smsClicked}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {smsClickRate === null
                        ? "Clicks"
                        : `Clicks (${smsClickRate.toFixed(0)}%)`}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Topics */}
            {proFeaturesEnabled ? (
              <div className="space-y-3">
                <h3 className="font-medium text-sm">Topics</h3>
                {isEditing ? (
                  topics.length > 0 ? (
                    <div className="max-h-[150px] space-y-2 overflow-y-auto rounded-lg border p-3">
                      {topics.map((topic) => (
                        <div
                          className="flex items-center space-x-2"
                          key={topic.id}
                        >
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
                          </Label>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      No topics available
                    </p>
                  )
                ) : subscribedTopics.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {subscribedTopics.map((t) => (
                      <Badge key={t.topicId} variant="outline">
                        {t.topicName}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No topic subscriptions
                  </p>
                )}
              </div>
            ) : null}

            {/* Properties */}
            {proFeaturesEnabled ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">Custom Properties</h3>
                  {isEditing && (
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
                  )}
                </div>
                {isEditing ? (
                  properties.length > 0 ? (
                    <div className="space-y-2">
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
                    <p className="text-muted-foreground text-sm">
                      No custom properties
                    </p>
                  )
                ) : Object.keys(contact.properties).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(contact.properties).map(([key, value]) => (
                      <div
                        className="flex items-center justify-between rounded-lg border px-3 py-2"
                        key={key}
                      >
                        <span className="text-muted-foreground text-sm">
                          {key}
                        </span>
                        <span className="text-sm">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    No custom properties
                  </p>
                )}
              </div>
            ) : isEditing ? (
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
            ) : null}

            {/* Activity Timeline - only show in view mode */}
            {!isEditing && (
              <ContactTimeline
                contactId={contact.id}
                organizationId={organizationId}
                orgSlug={orgSlug}
              />
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
