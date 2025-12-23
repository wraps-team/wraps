"use client";

import { Lock, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  type ContactStatus,
  type ContactWithMeta,
  EMAIL_STATUS_COLORS,
  EMAIL_STATUS_LABELS,
  EMAIL_STATUSES,
  type EmailStatus,
  SMS_STATUS_COLORS,
  SMS_STATUS_LABELS,
  SMS_STATUSES,
  type SmsStatus,
} from "@/lib/contacts";
import type { TopicWithMeta } from "@/lib/topics";

type PropertyEntry = {
  id: string;
  key: string;
  value: string;
};

type ContactDetailsSheetProps = {
  contact: ContactWithMeta | null;
  isPending: boolean;
  onClose: () => void;
  onSave: (data: {
    email?: string;
    phone?: string;
    emailStatus?: EmailStatus;
    smsStatus?: SmsStatus;
    status?: ContactStatus;
    properties?: Record<string, unknown>;
    topicIds?: string[];
  }) => void;
  open: boolean;
  orgSlug: string;
  proFeaturesEnabled?: boolean;
  topics: TopicWithMeta[];
  userRole: "owner" | "admin" | "member";
};

export function ContactDetailsSheet({
  contact,
  isPending,
  onClose,
  onSave,
  open,
  orgSlug,
  proFeaturesEnabled = true,
  topics,
  userRole,
}: ContactDetailsSheetProps) {
  const [isEditing, setIsEditing] = useState(false);

  // Form state
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("active");
  const [smsStatus, setSmsStatus] = useState<SmsStatus>("pending_consent");
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [properties, setProperties] = useState<PropertyEntry[]>([]);

  // Reset form and exit edit mode when contact changes or sheet opens
  useEffect(() => {
    if (open && contact) {
      setEmail(contact.email || "");
      setPhone(contact.phone || "");
      setEmailStatus(contact.emailStatus || "active");
      setSmsStatus(contact.smsStatus || "pending_consent");
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
  }, [open, contact]);

  if (!contact) return null;

  const canEdit = userRole === "owner" || userRole === "admin";
  const subscribedTopics =
    contact.topics?.filter((t) => t.status === "subscribed") || [];

  // Calculate engagement rates
  const emailOpenRate =
    contact.emailsSent > 0
      ? ((contact.emailsOpened / contact.emailsSent) * 100).toFixed(0)
      : "0";
  const emailClickRate =
    contact.emailsSent > 0
      ? ((contact.emailsClicked / contact.emailsSent) * 100).toFixed(0)
      : "0";
  const smsClickRate =
    contact.smsSent > 0
      ? ((contact.smsClicked / contact.smsSent) * 100).toFixed(0)
      : "0";

  const handleSave = () => {
    const propertiesObj = properties.reduce(
      (acc, { key, value }) => {
        if (key.trim()) {
          acc[key.trim()] = value;
        }
        return acc;
      },
      {} as Record<string, string>
    );

    const oldPropertiesStr = JSON.stringify(contact?.properties || {});
    const newPropertiesStr = JSON.stringify(propertiesObj);
    const propertiesChanged = oldPropertiesStr !== newPropertiesStr;

    const currentTopicIds = new Set(
      contact?.topics
        ?.filter((t) => t.status === "subscribed")
        .map((t) => t.topicId) || []
    );
    const newTopicIds = new Set(selectedTopicIds);
    const topicsChanged =
      currentTopicIds.size !== newTopicIds.size ||
      [...currentTopicIds].some((id) => !newTopicIds.has(id));

    onSave({
      email: email !== (contact?.email || "") ? email : undefined,
      phone: phone !== (contact?.phone || "") ? phone : undefined,
      emailStatus:
        emailStatus !== contact?.emailStatus ? emailStatus : undefined,
      smsStatus: smsStatus !== contact?.smsStatus ? smsStatus : undefined,
      properties: propertiesChanged ? propertiesObj : undefined,
      topicIds: topicsChanged ? selectedTopicIds : undefined,
    });

    setIsEditing(false);
  };

  const handleCancel = () => {
    // Reset form to original values
    setEmail(contact.email || "");
    setPhone(contact.phone || "");
    setEmailStatus(contact.emailStatus || "active");
    setSmsStatus(contact.smsStatus || "pending_consent");
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
  };

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
                    disabled={isPending || !(email || phone)}
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
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email address</Label>
                  <Input
                    id="edit-email"
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contact@example.com"
                    type="email"
                    value={email}
                  />
                  {email && (
                    <div className="flex items-center gap-2">
                      <Label className="text-muted-foreground text-xs">
                        Status:
                      </Label>
                      <Select
                        onValueChange={(v) => setEmailStatus(v as EmailStatus)}
                        value={emailStatus}
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
                </div>

                {/* Phone */}
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Phone number</Label>
                  <Input
                    id="edit-phone"
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 555 123 4567"
                    type="tel"
                    value={phone}
                  />
                  {phone && (
                    <div className="flex items-center gap-2">
                      <Label className="text-muted-foreground text-xs">
                        Status:
                      </Label>
                      <Select
                        onValueChange={(v) => setSmsStatus(v as SmsStatus)}
                        value={smsStatus}
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
                  <p className="text-muted-foreground text-xs">
                    E.164 format (e.g., +15551234567)
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {contact.email && (
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{contact.email}</span>
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
                      Opens ({emailOpenRate}%)
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 text-center">
                    <div className="font-semibold text-2xl">
                      {contact.emailsClicked}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      Clicks ({emailClickRate}%)
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
                      Clicks ({smsClickRate}%)
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
                  <span>Topics &amp; custom properties require</span>
                  <Link
                    className="font-medium text-primary hover:underline"
                    href={`/${orgSlug}/settings/billing`}
                  >
                    Pro plan
                  </Link>
                </div>
              </div>
            ) : null}

            {/* Activity - only show in view mode */}
            {!isEditing && (
              <div className="space-y-3">
                <h3 className="font-medium text-sm">Activity</h3>
                <div className="space-y-2 text-sm">
                  {contact.lastEmailClickedAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Last email clicked
                      </span>
                      <span>
                        {new Date(
                          contact.lastEmailClickedAt
                        ).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {contact.lastEmailOpenedAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Last email opened
                      </span>
                      <span>
                        {new Date(
                          contact.lastEmailOpenedAt
                        ).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {contact.lastEmailSentAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Last email sent
                      </span>
                      <span>
                        {new Date(contact.lastEmailSentAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {contact.lastSmsClickedAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Last SMS clicked
                      </span>
                      <span>
                        {new Date(
                          contact.lastSmsClickedAt
                        ).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {contact.lastSmsSentAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Last SMS sent
                      </span>
                      <span>
                        {new Date(contact.lastSmsSentAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span>
                      {new Date(contact.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {contact.createdBy && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Created by</span>
                      <span>
                        {contact.createdBy.name || contact.createdBy.email}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
