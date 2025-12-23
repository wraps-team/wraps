"use client";

import {
  ArrowLeft,
  Check,
  Code,
  ExternalLink,
  FileText,
  Filter,
  Lock,
  Send,
  Tag,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type AudienceType,
  type ContentType,
  createBatchSend,
  getRecipientCount,
  type RecipientFilter,
} from "@/actions/batch";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type Topic = {
  id: string;
  name: string;
  subscriberCount: number;
};

type Segment = {
  id: string;
  name: string;
  memberCount: number;
};

type BatchFormProps = {
  awsAccounts: AwsAccount[];
  organizationId: string;
  orgSlug: string;
  segments: Segment[];
  segmentsEnabled: boolean;
  templates: Template[];
  topics: Topic[];
  topicsEnabled: boolean;
};

type Step = "setup" | "content" | "audience" | "review";

interface CampaignData {
  name: string;
  subject: string;
  previewText: string;
  from: string;
  fromName: string;
  replyTo: string;
  awsAccountId: string;
  // Content
  contentType: ContentType;
  templateId: string;
  htmlContent: string;
  // Audience
  audienceType: AudienceType;
  topicId: string;
  segmentId: string;
}

export function BatchForm({
  awsAccounts,
  organizationId,
  orgSlug,
  segments,
  segmentsEnabled,
  templates,
  topics,
  topicsEnabled,
}: BatchFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Step state
  const [currentStep, setCurrentStep] = useState<Step>("setup");

  // Form data
  const [campaignData, setCampaignData] = useState<CampaignData>({
    name: "",
    subject: "",
    previewText: "",
    from: "",
    fromName: "",
    replyTo: "",
    awsAccountId: awsAccounts[0]?.id || "",
    contentType: "template",
    templateId: "",
    htmlContent: "",
    audienceType: "all",
    topicId: "",
    segmentId: "",
  });

  // Recipient count
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);

  const steps: { id: Step; label: string; number: number }[] = [
    { id: "setup", label: "Setup", number: 1 },
    { id: "content", label: "Content", number: 2 },
    { id: "audience", label: "Audience", number: 3 },
    { id: "review", label: "Review & Send", number: 4 },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  // Build current recipient filter
  const getCurrentFilter = useCallback((): RecipientFilter | undefined => {
    if (campaignData.audienceType === "topic" && campaignData.topicId) {
      return { audienceType: "topic", topicId: campaignData.topicId };
    }
    if (campaignData.audienceType === "segment" && campaignData.segmentId) {
      return { audienceType: "segment", segmentId: campaignData.segmentId };
    }
    return { audienceType: "all" };
  }, [campaignData.audienceType, campaignData.topicId, campaignData.segmentId]);

  // Load recipient count when filter changes
  useEffect(() => {
    const loadCount = async () => {
      setLoadingCount(true);
      const filter = getCurrentFilter();
      const result = await getRecipientCount(organizationId, "email", filter);
      if (result.success) {
        setRecipientCount(result.count);
      }
      setLoadingCount(false);
    };
    loadCount();
  }, [organizationId, getCurrentFilter]);

  const updateData = (updates: Partial<CampaignData>) => {
    setCampaignData((prev) => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex].id);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].id);
    }
  };

  const handleSend = () => {
    if (!campaignData.awsAccountId) {
      toast.error("Please select an AWS account");
      return;
    }

    if (!campaignData.from) {
      toast.error("Please enter a from address");
      return;
    }

    if (!campaignData.subject) {
      toast.error("Please enter a subject line");
      return;
    }

    if (!isContentValid) {
      toast.error("Please select a template or enter HTML content");
      return;
    }

    startTransition(async () => {
      const result = await createBatchSend(organizationId, {
        name: campaignData.name || undefined,
        subject: campaignData.subject || undefined,
        previewText: campaignData.previewText || undefined,
        from: campaignData.from,
        fromName: campaignData.fromName || undefined,
        replyTo: campaignData.replyTo || undefined,
        contentType: campaignData.contentType,
        templateId:
          campaignData.contentType === "template"
            ? campaignData.templateId || undefined
            : undefined,
        htmlContent:
          campaignData.contentType === "html"
            ? campaignData.htmlContent || undefined
            : undefined,
        awsAccountId: campaignData.awsAccountId,
        recipientFilter: getCurrentFilter(),
      });

      if (result.success) {
        toast.success("Broadcast created", {
          description: `Sending to ${result.batch.totalRecipients} recipients`,
        });
        router.push(`/${orgSlug}/send/${result.batch.id}`);
      } else {
        toast.error("Failed to create broadcast", {
          description: result.error,
        });
      }
    });
  };

  const isSetupValid =
    campaignData.awsAccountId && campaignData.from && campaignData.subject;

  const isContentValid =
    (campaignData.contentType === "template" && campaignData.templateId) ||
    (campaignData.contentType === "html" && campaignData.htmlContent.trim());

  const isAudienceValid =
    campaignData.audienceType === "all" ||
    (campaignData.audienceType === "topic" && campaignData.topicId) ||
    (campaignData.audienceType === "segment" && campaignData.segmentId);

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 pb-6">
        <Button asChild size="icon" variant="ghost">
          <Link href={`/${orgSlug}/send`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="font-bold text-2xl tracking-tight">New Broadcast</h1>
          <p className="text-muted-foreground">
            Send an email to your contacts
          </p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="border-b pb-6">
        <div className="mx-auto flex max-w-2xl items-center justify-center">
          {steps.map((step, index) => (
            <div className="flex flex-1 items-center" key={step.id}>
              <div className="flex flex-1 items-center gap-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 font-semibold text-sm transition-colors ${
                    index <= currentStepIndex
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  {index < currentStepIndex ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    step.number
                  )}
                </div>
                <span
                  className={`font-medium text-sm ${
                    index <= currentStepIndex
                      ? "text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`mx-4 h-0.5 flex-1 ${
                    index < currentStepIndex ? "bg-primary" : "bg-border"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 py-6">
        <div className="mx-auto max-w-2xl">
          {currentStep === "setup" && (
            <SetupStep
              awsAccounts={awsAccounts}
              data={campaignData}
              onChange={updateData}
              orgSlug={orgSlug}
            />
          )}
          {currentStep === "content" && (
            <ContentStep
              data={campaignData}
              onChange={updateData}
              orgSlug={orgSlug}
              templates={templates}
            />
          )}
          {currentStep === "audience" && (
            <AudienceStep
              data={campaignData}
              loadingCount={loadingCount}
              onChange={updateData}
              orgSlug={orgSlug}
              recipientCount={recipientCount}
              segments={segments}
              segmentsEnabled={segmentsEnabled}
              topics={topics}
              topicsEnabled={topicsEnabled}
            />
          )}
          {currentStep === "review" && (
            <ReviewStep
              data={campaignData}
              isPending={isPending}
              loadingCount={loadingCount}
              onSend={handleSend}
              recipientCount={recipientCount}
              segments={segments}
              templates={templates}
              topics={topics}
            />
          )}
        </div>
      </div>

      {/* Footer Navigation */}
      {currentStep !== "review" && (
        <div className="border-t pt-6">
          <div className="mx-auto flex max-w-2xl justify-between">
            <Button
              disabled={currentStepIndex === 0}
              onClick={handleBack}
              variant="outline"
            >
              Back
            </Button>
            <Button
              disabled={
                (currentStep === "setup" && !isSetupValid) ||
                (currentStep === "content" && !isContentValid) ||
                (currentStep === "audience" && !isAudienceValid)
              }
              onClick={handleNext}
            >
              Continue
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Setup Step Component
function SetupStep({
  awsAccounts,
  data,
  onChange,
  orgSlug,
}: {
  awsAccounts: AwsAccount[];
  data: CampaignData;
  onChange: (updates: Partial<CampaignData>) => void;
  orgSlug: string;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Broadcast Details</CardTitle>
          <CardDescription>Basic information about your email</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Broadcast Name</Label>
            <Input
              id="name"
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder="e.g., December Newsletter"
              value={data.name}
            />
            <p className="text-muted-foreground text-xs">
              Internal name to identify this broadcast
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subject">Subject Line *</Label>
            <Input
              id="subject"
              onChange={(e) => onChange({ subject: e.target.value })}
              placeholder="Your email subject"
              value={data.subject}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="previewText">Preview Text</Label>
            <Textarea
              className="resize-none"
              id="previewText"
              onChange={(e) => onChange({ previewText: e.target.value })}
              placeholder="Text shown in email preview..."
              rows={2}
              value={data.previewText}
            />
            <p className="text-muted-foreground text-xs">
              Appears after the subject in most email clients
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sender Information</CardTitle>
          <CardDescription>Configure who this email is from</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fromName">From Name</Label>
              <Input
                id="fromName"
                onChange={(e) => onChange({ fromName: e.target.value })}
                placeholder="Your Company"
                value={data.fromName}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="from">From Email *</Label>
              <Input
                id="from"
                onChange={(e) => onChange({ from: e.target.value })}
                placeholder="hello@yourcompany.com"
                type="email"
                value={data.from}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="replyTo">Reply-To Email</Label>
            <Input
              id="replyTo"
              onChange={(e) => onChange({ replyTo: e.target.value })}
              placeholder="replies@yourcompany.com"
              type="email"
              value={data.replyTo}
            />
            <p className="text-muted-foreground text-xs">
              Where replies will be sent (defaults to From Email)
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AWS Account</CardTitle>
          <CardDescription>
            Select which AWS account to send from
          </CardDescription>
        </CardHeader>
        <CardContent>
          {awsAccounts.length > 0 ? (
            <Select
              onValueChange={(value) => onChange({ awsAccountId: value })}
              value={data.awsAccountId || ""}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select AWS account" />
              </SelectTrigger>
              <SelectContent>
                {awsAccounts.map((account) => (
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
    </div>
  );
}

// Content Step Component
function ContentStep({
  data,
  onChange,
  orgSlug,
  templates,
}: {
  data: CampaignData;
  onChange: (updates: Partial<CampaignData>) => void;
  orgSlug: string;
  templates: Template[];
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Email Content</CardTitle>
          <CardDescription>
            Choose how to build your email content
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            onValueChange={(v) =>
              onChange({
                contentType: v as ContentType,
                templateId: "",
                htmlContent: "",
              })
            }
            value={data.contentType}
          >
            {/* Use Template */}
            <div className="flex items-start space-x-3 rounded-lg border p-4">
              <RadioGroupItem id="template" value="template" />
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <label
                    className="cursor-pointer font-medium text-sm"
                    htmlFor="template"
                  >
                    <FileText className="mr-1 inline h-4 w-4" />
                    Use Template
                  </label>
                </div>
                <p className="text-muted-foreground text-xs">
                  Select from your saved email templates
                </p>
                {data.contentType === "template" && (
                  <div className="space-y-3">
                    {templates.length > 0 ? (
                      <>
                        <Select
                          onValueChange={(v) => onChange({ templateId: v })}
                          value={data.templateId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a template" />
                          </SelectTrigger>
                          <SelectContent>
                            {templates.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-muted-foreground text-xs">
                          Or{" "}
                          <Link
                            className="text-primary hover:underline"
                            href={`/${orgSlug}/emails/templates/new`}
                            target="_blank"
                          >
                            create a new template
                            <ExternalLink className="ml-0.5 inline h-3 w-3" />
                          </Link>
                        </p>
                      </>
                    ) : (
                      <div className="rounded-lg border border-dashed p-4 text-center">
                        <p className="text-muted-foreground text-sm">
                          No templates yet
                        </p>
                        <Button
                          asChild
                          className="mt-2"
                          size="sm"
                          variant="outline"
                        >
                          <Link
                            href={`/${orgSlug}/emails/templates/new`}
                            target="_blank"
                          >
                            <ExternalLink className="mr-1 h-3 w-3" />
                            Create Template
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Custom HTML */}
            <div className="flex items-start space-x-3 rounded-lg border p-4">
              <RadioGroupItem id="html" value="html" />
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <label
                    className="cursor-pointer font-medium text-sm"
                    htmlFor="html"
                  >
                    <Code className="mr-1 inline h-4 w-4" />
                    Custom HTML
                  </label>
                </div>
                <p className="text-muted-foreground text-xs">
                  Paste your own HTML email content
                </p>
                {data.contentType === "html" && (
                  <div className="space-y-2">
                    <Textarea
                      className="min-h-[200px] font-mono text-sm"
                      onChange={(e) =>
                        onChange({ htmlContent: e.target.value })
                      }
                      placeholder="<html>
  <body>
    <h1>Your Email Content</h1>
    <p>Enter your HTML here...</p>
  </body>
</html>"
                      value={data.htmlContent}
                    />
                    <p className="text-muted-foreground text-xs">
                      Tip: Make sure your HTML is responsive for mobile devices
                    </p>
                  </div>
                )}
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>
    </div>
  );
}

// Audience Step Component
function AudienceStep({
  data,
  loadingCount,
  onChange,
  orgSlug,
  recipientCount,
  segments,
  segmentsEnabled,
  topics,
  topicsEnabled,
}: {
  data: CampaignData;
  loadingCount: boolean;
  onChange: (updates: Partial<CampaignData>) => void;
  orgSlug: string;
  recipientCount: number | null;
  segments: Segment[];
  segmentsEnabled: boolean;
  topics: Topic[];
  topicsEnabled: boolean;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Select Audience</CardTitle>
          <CardDescription>
            Choose who will receive this broadcast
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            onValueChange={(v) => onChange({ audienceType: v as AudienceType })}
            value={data.audienceType}
          >
            {/* All Contacts */}
            <div className="flex items-start space-x-3 rounded-lg border p-4">
              <RadioGroupItem id="all" value="all" />
              <div className="flex-1">
                <label
                  className="cursor-pointer font-medium text-sm"
                  htmlFor="all"
                >
                  All Contacts
                </label>
                <p className="mt-1 text-muted-foreground text-xs">
                  Send to all active contacts in your database
                </p>
              </div>
            </div>

            {/* Topic Subscribers */}
            <div className="flex items-start space-x-3 rounded-lg border p-4">
              <RadioGroupItem
                disabled={!topicsEnabled}
                id="topic"
                value="topic"
              />
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <label
                    className={`cursor-pointer font-medium text-sm ${topicsEnabled ? "" : "text-muted-foreground"}`}
                    htmlFor="topic"
                  >
                    <Tag className="mr-1 inline h-4 w-4" />
                    Topic Subscribers
                  </label>
                  {!topicsEnabled && (
                    <span className="flex items-center gap-1 text-muted-foreground text-xs">
                      <Lock className="h-3 w-3" />
                      <Link
                        className="text-primary hover:underline"
                        href={`/${orgSlug}/settings/billing`}
                      >
                        Pro
                      </Link>
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-xs">
                  Send to contacts subscribed to a specific topic
                </p>
                {data.audienceType === "topic" && topicsEnabled && (
                  <Select
                    onValueChange={(v) => onChange({ topicId: v })}
                    value={data.topicId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a topic" />
                    </SelectTrigger>
                    <SelectContent>
                      {topics.map((topic) => (
                        <SelectItem key={topic.id} value={topic.id}>
                          {topic.name} ({topic.subscriberCount.toLocaleString()}{" "}
                          subscribers)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Segment */}
            <div className="flex items-start space-x-3 rounded-lg border p-4">
              <RadioGroupItem
                disabled={!segmentsEnabled}
                id="segment"
                value="segment"
              />
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <label
                    className={`cursor-pointer font-medium text-sm ${segmentsEnabled ? "" : "text-muted-foreground"}`}
                    htmlFor="segment"
                  >
                    <Filter className="mr-1 inline h-4 w-4" />
                    Segment
                  </label>
                  {!segmentsEnabled && (
                    <span className="flex items-center gap-1 text-muted-foreground text-xs">
                      <Lock className="h-3 w-3" />
                      <Link
                        className="text-primary hover:underline"
                        href={`/${orgSlug}/settings/billing`}
                      >
                        Pro
                      </Link>
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground text-xs">
                  Send to contacts matching specific criteria
                </p>
                {data.audienceType === "segment" && segmentsEnabled && (
                  <Select
                    onValueChange={(v) => onChange({ segmentId: v })}
                    value={data.segmentId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a segment" />
                    </SelectTrigger>
                    <SelectContent>
                      {segments.map((segment) => (
                        <SelectItem key={segment.id} value={segment.id}>
                          {segment.name} ({segment.memberCount.toLocaleString()}{" "}
                          contacts)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Recipient Count */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-muted-foreground text-sm">
                Estimated Recipients
              </p>
              <p className="font-semibold text-2xl">
                {loadingCount
                  ? "..."
                  : (recipientCount?.toLocaleString() ?? "0")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Review Step Component
function ReviewStep({
  data,
  isPending,
  loadingCount,
  onSend,
  recipientCount,
  segments,
  templates,
  topics,
}: {
  data: CampaignData;
  isPending: boolean;
  loadingCount: boolean;
  onSend: () => void;
  recipientCount: number | null;
  segments: Segment[];
  templates: Template[];
  topics: Topic[];
}) {
  const getAudienceLabel = () => {
    if (data.audienceType === "all") return "All Contacts";
    if (data.audienceType === "topic") {
      const topic = topics.find((t) => t.id === data.topicId);
      return topic ? `Topic: ${topic.name}` : "Topic";
    }
    if (data.audienceType === "segment") {
      const segment = segments.find((s) => s.id === data.segmentId);
      return segment ? `Segment: ${segment.name}` : "Segment";
    }
    return "—";
  };

  const getContentLabel = () => {
    if (data.contentType === "template") {
      const template = templates.find((t) => t.id === data.templateId);
      return template ? `Template: ${template.name}` : "Template";
    }
    return "Custom HTML";
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Review Broadcast</CardTitle>
          <CardDescription>Review all details before sending</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="text-muted-foreground">Broadcast Name</Label>
              <p className="font-medium">{data.name || "Untitled"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Subject</Label>
              <p className="font-medium">{data.subject || "—"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">From</Label>
              <p className="font-medium">
                {data.fromName ? `${data.fromName} <${data.from}>` : data.from}
              </p>
            </div>
            <div>
              <Label className="text-muted-foreground">Content</Label>
              <p className="font-medium">{getContentLabel()}</p>
            </div>
          </div>

          {data.previewText && (
            <div>
              <Label className="text-muted-foreground">Preview Text</Label>
              <p>{data.previewText}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">
                  {getAudienceLabel()}
                </p>
                <p className="font-semibold text-2xl">
                  {loadingCount
                    ? "..."
                    : `${recipientCount?.toLocaleString() ?? "0"} recipients`}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end pt-4">
        <Button
          disabled={isPending || recipientCount === 0}
          onClick={onSend}
          size="lg"
        >
          {isPending ? (
            "Sending..."
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Send to {recipientCount?.toLocaleString() ?? 0} contacts
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
