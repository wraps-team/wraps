"use client";

import { Lock, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  type ContactStatus,
  type ContactWithMeta,
  EMAIL_STATUS_LABELS,
  EMAIL_STATUSES,
  type EmailStatus,
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

type ContactFormDialogProps = {
  contact?: ContactWithMeta | null;
  isPending: boolean;
  mode: "create" | "edit";
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
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
};

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
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("active");
  const [smsStatus, setSmsStatus] = useState<SmsStatus>("pending_consent");
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [properties, setProperties] = useState<PropertyEntry[]>([]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (mode === "edit" && contact) {
        setEmail(contact.email || "");
        setPhone(contact.phone || "");
        setEmailStatus(contact.emailStatus || "active");
        setSmsStatus(contact.smsStatus || "pending_consent");
        setSelectedTopicIds(
          contact.topics
            ?.filter((t) => t.status === "subscribed")
            .map((t) => t.topicId) || []
        );
        // Convert properties object to array
        setProperties(
          Object.entries(contact.properties || {}).map(([key, value]) => ({
            id: crypto.randomUUID(),
            key,
            value: String(value),
          }))
        );
      } else {
        setEmail("");
        setPhone("");
        setEmailStatus("active");
        setSmsStatus("pending_consent");
        setSelectedTopicIds([]);
        setProperties([]);
      }
    }
  }, [open, mode, contact]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Convert properties array back to object
    const propertiesObj = properties.reduce(
      (acc, { key, value }) => {
        if (key.trim()) {
          acc[key.trim()] = value;
        }
        return acc;
      },
      {} as Record<string, string>
    );

    if (mode === "create") {
      onSubmit({
        email: email || undefined,
        phone: phone || undefined,
        emailStatus: email ? emailStatus : undefined,
        smsStatus: phone ? smsStatus : undefined,
        properties:
          Object.keys(propertiesObj).length > 0 ? propertiesObj : undefined,
        topicIds: selectedTopicIds,
      });
    } else {
      // For edit, only include properties if they've changed
      const oldPropertiesStr = JSON.stringify(contact?.properties || {});
      const newPropertiesStr = JSON.stringify(propertiesObj);
      const propertiesChanged = oldPropertiesStr !== newPropertiesStr;

      // Check if topic subscriptions changed
      const currentTopicIds = new Set(
        contact?.topics
          ?.filter((t) => t.status === "subscribed")
          .map((t) => t.topicId) || []
      );
      const newTopicIds = new Set(selectedTopicIds);
      const topicsChanged =
        currentTopicIds.size !== newTopicIds.size ||
        [...currentTopicIds].some((id) => !newTopicIds.has(id));

      onSubmit({
        email: email !== (contact?.email || "") ? email : undefined,
        phone: phone !== (contact?.phone || "") ? phone : undefined,
        emailStatus:
          emailStatus !== contact?.emailStatus ? emailStatus : undefined,
        smsStatus: smsStatus !== contact?.smsStatus ? smsStatus : undefined,
        properties: propertiesChanged ? propertiesObj : undefined,
        topicIds: topicsChanged ? selectedTopicIds : undefined,
      });
    }
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

  const isValid = email || phone;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
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
            <div className="grid gap-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@example.com"
                type="email"
                value={email}
              />
              {email && (
                <div className="flex items-center gap-2">
                  <Label
                    className="text-muted-foreground text-xs"
                    htmlFor="emailStatus"
                  >
                    Email status:
                  </Label>
                  <Select
                    onValueChange={(value) =>
                      setEmailStatus(value as EmailStatus)
                    }
                    value={emailStatus}
                  >
                    <SelectTrigger className="h-7 w-[140px]" id="emailStatus">
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
            </div>

            {/* Phone */}
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone number</Label>
              <Input
                id="phone"
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 123 4567"
                type="tel"
                value={phone}
              />
              {phone && (
                <div className="flex items-center gap-2">
                  <Label
                    className="text-muted-foreground text-xs"
                    htmlFor="smsStatus"
                  >
                    SMS status:
                  </Label>
                  <Select
                    onValueChange={(value) => setSmsStatus(value as SmsStatus)}
                    value={smsStatus}
                  >
                    <SelectTrigger className="h-7 w-[160px]" id="smsStatus">
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
              <p className="text-muted-foreground text-xs">
                Use E.164 format (e.g., +15551234567)
              </p>
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
                  <span>Topics &amp; custom properties require</span>
                  <Link
                    className="font-medium text-primary hover:underline"
                    href={`/${orgSlug}/settings/billing`}
                  >
                    Pro plan
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
            <Button disabled={isPending || !isValid} type="submit">
              {isPending
                ? mode === "create"
                  ? "Creating..."
                  : "Saving..."
                : mode === "create"
                  ? "Add Contact"
                  : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
