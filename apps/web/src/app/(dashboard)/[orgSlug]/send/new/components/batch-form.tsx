"use client";

import { ArrowLeft, Send, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { createBatchSend, getRecipientCount } from "@/actions/batch";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type Template = {
  id: string;
  name: string;
  subject: string | null;
};

type AwsAccount = {
  id: string;
  name: string;
  region: string;
};

type BatchFormProps = {
  awsAccounts: AwsAccount[];
  organizationId: string;
  orgSlug: string;
  templates: Template[];
};

export function BatchForm({
  awsAccounts,
  organizationId,
  orgSlug,
  templates,
}: BatchFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Form state
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [from, setFrom] = useState("");
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [awsAccountId, setAwsAccountId] = useState<string>(
    awsAccounts[0]?.id || ""
  );

  // Recipient count
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);

  // Load recipient count on mount and when AWS account changes
  useEffect(() => {
    const loadCount = async () => {
      setLoadingCount(true);
      const result = await getRecipientCount(organizationId, "email");
      if (result.success) {
        setRecipientCount(result.count);
      }
      setLoadingCount(false);
    };
    loadCount();
  }, [organizationId]);

  // When template is selected, prefill subject
  useEffect(() => {
    if (templateId) {
      const template = templates.find((t) => t.id === templateId);
      if (template?.subject) {
        setSubject(template.subject);
      }
    }
  }, [templateId, templates]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!awsAccountId) {
      toast.error("Please select an AWS account");
      return;
    }

    if (!from) {
      toast.error("Please enter a from address");
      return;
    }

    if (!(subject || templateId)) {
      toast.error("Please enter a subject or select a template");
      return;
    }

    startTransition(async () => {
      const result = await createBatchSend(organizationId, {
        name: name || undefined,
        subject: subject || undefined,
        previewText: previewText || undefined,
        from,
        fromName: fromName || undefined,
        replyTo: replyTo || undefined,
        templateId: templateId || undefined,
        awsAccountId,
      });

      if (result.success) {
        toast.success("Batch send created", {
          description: `Sending to ${result.batch.totalRecipients} recipients`,
        });
        router.push(`/${orgSlug}/send/${result.batch.id}`);
      } else {
        toast.error("Failed to create batch send", {
          description: result.error,
        });
      }
    });
  };

  const isValid = awsAccountId && from && (subject || templateId);

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild size="icon" variant="ghost">
          <Link href={`/${orgSlug}/send`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="font-bold text-2xl tracking-tight">New Batch Send</h1>
          <p className="text-muted-foreground">
            Send an email to all your active contacts
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Form */}
        <div className="space-y-6 lg:col-span-2">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Email Details</CardTitle>
              <CardDescription>
                Configure the email content and sender information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Name (optional) */}
              <div className="space-y-2">
                <Label htmlFor="name">Campaign Name (optional)</Label>
                <Input
                  id="name"
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., December Newsletter"
                  value={name}
                />
              </div>

              {/* Template Selection */}
              {templates.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="template">Template</Label>
                  <Select
                    onValueChange={(value) =>
                      setTemplateId(value === "none" ? "" : value)
                    }
                    value={templateId || "none"}
                  >
                    <SelectTrigger id="template">
                      <SelectValue placeholder="Select a template or write custom content" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        No template (custom content)
                      </SelectItem>
                      {templates
                        .filter((template) => template.id)
                        .map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Separator />

              {/* Subject */}
              <div className="space-y-2">
                <Label htmlFor="subject">Subject Line *</Label>
                <Input
                  id="subject"
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Your email subject"
                  required={!templateId}
                  value={subject}
                />
              </div>

              {/* Preview Text */}
              <div className="space-y-2">
                <Label htmlFor="previewText">Preview Text (optional)</Label>
                <Textarea
                  className="resize-none"
                  id="previewText"
                  onChange={(e) => setPreviewText(e.target.value)}
                  placeholder="Text shown in email preview..."
                  rows={2}
                  value={previewText}
                />
                <p className="text-muted-foreground text-xs">
                  This text appears after the subject in most email clients
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Sender Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Sender Information</CardTitle>
              <CardDescription>
                Configure who the email appears to be from
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* From Email */}
                <div className="space-y-2">
                  <Label htmlFor="from">From Email *</Label>
                  <Input
                    id="from"
                    onChange={(e) => setFrom(e.target.value)}
                    placeholder="hello@yourcompany.com"
                    required
                    type="email"
                    value={from}
                  />
                </div>

                {/* From Name */}
                <div className="space-y-2">
                  <Label htmlFor="fromName">From Name</Label>
                  <Input
                    id="fromName"
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder="Your Company"
                    value={fromName}
                  />
                </div>
              </div>

              {/* Reply To */}
              <div className="space-y-2">
                <Label htmlFor="replyTo">Reply-To Email (optional)</Label>
                <Input
                  id="replyTo"
                  onChange={(e) => setReplyTo(e.target.value)}
                  placeholder="replies@yourcompany.com"
                  type="email"
                  value={replyTo}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Recipient Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-4 w-4" />
                Recipients
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                {loadingCount ? (
                  <div className="text-muted-foreground">Loading...</div>
                ) : recipientCount !== null ? (
                  <>
                    <div className="font-bold text-3xl">{recipientCount}</div>
                    <div className="text-muted-foreground text-sm">
                      active email contacts
                    </div>
                  </>
                ) : (
                  <div className="text-muted-foreground">
                    Unable to count recipients
                  </div>
                )}
              </div>
              {recipientCount === 0 && (
                <p className="mt-4 text-center text-muted-foreground text-sm">
                  No active contacts to send to. Add some contacts first.
                </p>
              )}
            </CardContent>
          </Card>

          {/* AWS Account */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">AWS Account</CardTitle>
              <CardDescription>
                Select which AWS account to send from
              </CardDescription>
            </CardHeader>
            <CardContent>
              {awsAccounts.length > 0 ? (
                <Select
                  onValueChange={setAwsAccountId}
                  value={awsAccountId || ""}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select AWS account" />
                  </SelectTrigger>
                  <SelectContent>
                    {awsAccounts
                      .filter((account) => account.id)
                      .map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name} ({account.region})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-center text-muted-foreground text-sm">
                  <p>No AWS accounts connected.</p>
                  <Button asChild className="mt-2" size="sm" variant="outline">
                    <Link href={`/${orgSlug}/settings/aws-accounts`}>
                      Connect AWS Account
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Send Button */}
          <Card>
            <CardContent className="pt-6">
              <Button
                className="w-full"
                disabled={isPending || !isValid || recipientCount === 0}
                size="lg"
                type="submit"
              >
                {isPending ? (
                  <>Sending...</>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send to {recipientCount ?? 0} contacts
                  </>
                )}
              </Button>
              <p className="mt-2 text-center text-muted-foreground text-xs">
                This will immediately queue the batch for sending
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
