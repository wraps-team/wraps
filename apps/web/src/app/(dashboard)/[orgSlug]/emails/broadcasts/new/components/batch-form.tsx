"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Calendar } from "@wraps/ui/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wraps/ui/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@wraps/ui/components/ui/dialog";
import { Label } from "@wraps/ui/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@wraps/ui/components/ui/popover";
import {
  RadioGroup,
  RadioGroupItem,
} from "@wraps/ui/components/ui/radio-group";
import { ScrollArea } from "@wraps/ui/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import { Textarea } from "@wraps/ui/components/ui/textarea";
import { format } from "date-fns";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarIcon,
  Check,
  ChevronDown,
  Clock,
  Code,
  FileText,
  Filter,
  Lock,
  RefreshCw,
  Send,
  Tag,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import {
  getVerifiedDomains,
  type VerifiedIdentity,
} from "@/actions/aws-accounts";
import {
  type AudienceType,
  type CheckTemplateVariableCoverageResult,
  type ContentType,
  checkBroadcastSendDuration,
  checkHtmlVariableCoverage,
  checkTemplateVariableCoverage,
  createBatchSend,
  getRecipientCount,
  getSampleContacts,
  promoteDraftToSend,
  type RecipientFilter,
  saveDraftBatchSend,
  updateDraftBatchSend,
} from "@/actions/batch";
import { ConnectAwsDialog } from "@/components/connect-aws-dialog";
import { SendConfirmDialog } from "@/components/send-confirm-dialog";
import { TemplateSelector } from "@/components/template-editor/template-selector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMessageUsageQueryKey } from "@/hooks/use-message-usage";
import { useNaturalDateParser } from "@/hooks/use-natural-date-parser";
import { useRequireAws } from "@/hooks/use-require-aws";
import { useTemplates } from "@/hooks/use-template-queries";
import type {
  CheckSendDurationResult,
  CreateDraftBatchInput,
  SampleContact,
} from "@/lib/batch";
import { cn } from "@/lib/utils";
import {
  type CampaignData,
  type ScheduleType,
  stripSelfReferencingPlaceholder,
} from "./batch-form-utils";
import { EmailPreviewCarousel } from "./email-preview-carousel";
import { TestSendCard } from "./test-send-card";
import { VariableMapper } from "./variable-mapper";

type Template = {
  id: string;
  name: string;
  subject: string | null;
  previewText: string | null;
};

type AwsAccount = {
  id: string;
  name: string;
  region: string;
};

// Both counts arrive already narrowed to the send predicate (see
// `countTopicAudience` / `countRecipientsBySegment`), so the picker and the
// "Estimated Recipients" card below it cannot show two different numbers for
// the same audience.
type Topic = {
  id: string;
  name: string;
  /** Subscribers this broadcast would actually reach. */
  subscriberCount: number;
};

type Segment = {
  id: string;
  name: string;
  /** Contacts this broadcast would actually reach. */
  memberCount: number;
};

type OrgDefaults = {
  defaultAwsAccountId: string | null;
  defaultFrom: string | null;
  defaultFromName: string | null;
  defaultReplyTo: string | null;
} | null;

type BatchFormMode = "create" | "edit";

type BatchFormProps = {
  awsAccounts: AwsAccount[];
  initialVerifiedDomains: VerifiedIdentity[];
  organizationId: string;
  orgDefaults: OrgDefaults;
  orgSlug: string;
  schedulingEnabled: boolean;
  segments: Segment[];
  segmentsEnabled: boolean;
  templates: Template[];
  topics: Topic[];
  topicsEnabled: boolean;
  /** Prefills the test-send recipient — the signed-in user can always
   *  receive it, including in the SES sandbox once they verify themselves. */
  currentUserEmail: string;
  // Draft-edit retrofit — all optional so the create-new flow is unchanged.
  mode?: BatchFormMode;
  draftId?: string;
  initialValues?: Partial<CampaignData>;
};

/**
 * Build the server-action input payload from the wizard's CampaignData.
 * Shared by save-draft (create or update) and promote-from-draft paths.
 */
function mapCampaignDataToActionInput(
  data: CampaignData,
  fromAddress: string
): CreateDraftBatchInput {
  return {
    name: data.name || undefined,
    subject: data.subject || undefined,
    previewText: data.previewText || undefined,
    from: fromAddress || undefined,
    fromName: data.fromName || undefined,
    replyTo: data.replyTo || undefined,
    contentType: data.contentType,
    templateId:
      data.contentType === "template"
        ? data.templateId || undefined
        : undefined,
    htmlContent:
      data.contentType === "html" ? data.htmlContent || undefined : undefined,
    variableMappings:
      data.variableMappings.length > 0 ? data.variableMappings : undefined,
    awsAccountId: data.awsAccountId || undefined,
    recipientFilter: {
      audienceType: data.audienceType,
      topicId: data.audienceType === "topic" ? data.topicId : undefined,
      segmentId: data.audienceType === "segment" ? data.segmentId : undefined,
    },
    scheduledFor: buildScheduledFor(data),
  };
}

/**
 * Combine the separate date and time-of-day fields into the single instant the
 * send is scheduled for. Null when the user picked "send now" or has not chosen
 * a date yet — on a draft update that clears any schedule already stored.
 */
function buildScheduledFor(data: CampaignData): Date | null {
  if (data.scheduleType !== "later" || !data.scheduledDate) {
    return null;
  }
  const [hours, minutes] = data.scheduledTime.split(":").map(Number);
  const scheduledFor = new Date(data.scheduledDate);
  scheduledFor.setHours(hours, minutes, 0, 0);
  return scheduledFor;
}

type Step = "setup" | "content" | "audience" | "review";

/** The viewer's IANA zone, e.g. "America/Denver". Every scheduled time in this
 *  wizard is built in local time via Date#setHours, and the detail page renders
 *  in the viewer's zone too — but nothing ever said which zone, so "9:00 AM"
 *  was unverifiable and looked like it disagreed with the detail page. */
function localTimeZoneLabel(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "local time";
  } catch {
    return "local time";
  }
}

export function BatchForm({
  awsAccounts,
  initialVerifiedDomains,
  organizationId,
  orgDefaults,
  orgSlug,
  schedulingEnabled,
  segments,
  segmentsEnabled,
  templates,
  topics,
  topicsEnabled,
  currentUserEmail,
  mode = "create",
  draftId,
  initialValues,
}: BatchFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSavingDraft, startSaveDraftTransition] = useTransition();
  // Tracks the draft ID after first save so rapid re-saves update in place
  // instead of creating duplicate rows before the router.push resolves.
  const savedDraftId = useRef<string | null>(draftId ?? null);
  const {
    requireAws,
    dialogOpen: awsDialogOpen,
    setDialogOpen: setAwsDialogOpen,
    pendingAction,
    orgSlug: awsOrgSlug,
  } = useRequireAws(orgSlug);
  const queryClient = useQueryClient();

  // Step state
  const [currentStep, setCurrentStep] = useState<Step>("setup");

  // Verified domains state
  const [verifiedDomains, setVerifiedDomains] = useState<VerifiedIdentity[]>(
    initialVerifiedDomains
  );
  const [domainsLoading, setDomainsLoading] = useState(false);

  // Form data
  const [campaignData, setCampaignData] = useState<CampaignData>(() => {
    // Parse org default from email into prefix and domain
    let defaultFromPrefix = "";
    let defaultFromDomain = "";
    if (orgDefaults?.defaultFrom?.includes("@")) {
      const [prefix, domain] = orgDefaults.defaultFrom.split("@");
      defaultFromPrefix = prefix || "";
      defaultFromDomain = domain || "";
    }

    // Find a valid domain: org default or first verified domain
    const firstDomain = initialVerifiedDomains.find((d) => d.type === "DOMAIN");
    const isDefaultDomainValid = initialVerifiedDomains.some(
      (d) => d.identity === defaultFromDomain && d.type === "DOMAIN"
    );
    const fromDomain = isDefaultDomainValid
      ? defaultFromDomain
      : firstDomain?.identity || "";

    // Determine initial AWS account: org default or first available
    const initialAwsAccountId =
      orgDefaults?.defaultAwsAccountId &&
      awsAccounts.some((a) => a.id === orgDefaults.defaultAwsAccountId)
        ? orgDefaults.defaultAwsAccountId
        : awsAccounts[0]?.id || "";

    const defaults: CampaignData = {
      name: "",
      subject: "",
      previewText: "",
      fromPrefix: defaultFromPrefix,
      fromDomain,
      fromName: orgDefaults?.defaultFromName || "",
      replyTo: orgDefaults?.defaultReplyTo || "",
      awsAccountId: initialAwsAccountId,
      contentType: "template",
      templateId: "",
      htmlContent: "",
      variableMappings: [],
      audienceType: "all",
      topicId: "",
      segmentId: "",
      scheduleType: "now",
      scheduledDate: undefined,
      scheduledTime: "09:00",
    };

    // Merge initialValues on top of defaults (used by /edit page when loading
    // a draft). Only overrides keys the caller actually supplied.
    return { ...defaults, ...initialValues };
  });

  // Fetch domains when AWS account changes
  const fetchDomainsForAccount = useCallback(
    async (awsAccountId: string, forceRefresh = false) => {
      if (!awsAccountId) {
        setVerifiedDomains([]);
        return;
      }

      setDomainsLoading(true);
      const result = await getVerifiedDomains(
        awsAccountId,
        organizationId,
        forceRefresh
      );
      setDomainsLoading(false);

      if (result.success) {
        setVerifiedDomains(result.identities);
        // Auto-select first domain if current is not in the list
        const currentDomainValid = result.identities.some(
          (d) => d.identity === campaignData.fromDomain
        );
        if (!currentDomainValid && result.identities.length > 0) {
          const firstDomain = result.identities.find(
            (d) => d.type === "DOMAIN"
          );
          if (firstDomain) {
            setCampaignData((prev) => ({
              ...prev,
              fromDomain: firstDomain.identity,
            }));
          }
        }
      } else if (result.errorCode === "PERMISSION_DENIED") {
        toast.error("Permission Update Required", {
          description:
            "Your IAM role needs updated permissions. Run: wraps platform update-role",
          duration: Number.POSITIVE_INFINITY,
        });
      } else {
        toast.error("Failed to load domains", {
          description: result.error,
        });
      }
    },
    [organizationId, campaignData.fromDomain]
  );

  // Refresh domains when AWS account changes
  useEffect(() => {
    // Only fetch if account changed from initial
    if (campaignData.awsAccountId !== awsAccounts[0]?.id) {
      fetchDomainsForAccount(campaignData.awsAccountId);
    }
  }, [campaignData.awsAccountId, awsAccounts, fetchDomainsForAccount]);

  // Compute full from address
  const getFromAddress = useCallback(() => {
    if (!(campaignData.fromPrefix && campaignData.fromDomain)) {
      return "";
    }
    return `${campaignData.fromPrefix}@${campaignData.fromDomain}`;
  }, [campaignData.fromPrefix, campaignData.fromDomain]);

  // Recipient count
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);
  const [countError, setCountError] = useState<string | null>(null);

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

  // Load recipient count when filter changes. The count is cleared first so a
  // failed fetch can never leave the previous filter's number on screen, and
  // `null` means "unknown" — never "zero". Every consumer must distinguish them.
  useEffect(() => {
    let cancelled = false;
    const loadCount = async () => {
      setLoadingCount(true);
      setCountError(null);
      setRecipientCount(null);
      const filter = getCurrentFilter();
      const result = await getRecipientCount(organizationId, "email", filter);
      if (cancelled) {
        return;
      }
      if (result.success) {
        setRecipientCount(result.count);
      } else {
        setCountError(result.error);
      }
      setLoadingCount(false);
    };
    loadCount();
    return () => {
      cancelled = true;
    };
  }, [organizationId, getCurrentFilter]);

  const updateData = (updates: Partial<CampaignData>) => {
    setCampaignData((prev) => ({ ...prev, ...updates }));
  };

  // Wizard state lived only in memory: a reload, a crash, or a mistaken back
  // navigation mid-compose lost hand-authored HTML and every variable mapping.
  // A serialised snapshot in sessionStorage survives all three, and is offered
  // back rather than applied silently — restoring over a deliberate fresh start
  // would be its own surprise.
  const draftStorageKey = `wraps:broadcast-wizard:${organizationId}:${draftId ?? "new"}`;
  const [recoverable, setRecoverable] = useState<CampaignData | null>(null);
  const [hasUnsavedWork, setHasUnsavedWork] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.sessionStorage.getItem(draftStorageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as CampaignData & {
        scheduledDate?: string;
      };
      setRecoverable({
        ...parsed,
        scheduledDate: parsed.scheduledDate
          ? new Date(parsed.scheduledDate)
          : undefined,
      });
    } catch {
      // A snapshot we cannot parse is worth exactly nothing — drop it rather
      // than blocking the wizard behind a broken recovery prompt.
      window.sessionStorage.removeItem(draftStorageKey);
    }
  }, [draftStorageKey]);

  // Only content the user actually authored is worth warning about losing.
  const hasAuthoredContent = Boolean(
    campaignData.name ||
      campaignData.subject ||
      campaignData.htmlContent.trim() ||
      campaignData.templateId ||
      campaignData.variableMappings.length > 0
  );

  useEffect(() => {
    if (typeof window === "undefined" || !hasAuthoredContent) {
      return;
    }
    setHasUnsavedWork(true);
    const timeoutId = setTimeout(() => {
      try {
        window.sessionStorage.setItem(
          draftStorageKey,
          JSON.stringify(campaignData)
        );
      } catch {
        // Quota or private-mode failures are not worth interrupting the user.
      }
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [campaignData, draftStorageKey, hasAuthoredContent]);

  useEffect(() => {
    if (typeof window === "undefined" || !hasUnsavedWork) {
      return;
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedWork]);

  const clearRecoverySnapshot = useCallback(() => {
    setHasUnsavedWork(false);
    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(draftStorageKey);
    }
  }, [draftStorageKey]);

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

  const handleSaveDraft = () => {
    // Drafts may be empty skeletons. No validation gate here — the server
    // accepts partially-filled drafts and the user can come back later.
    const fromAddress = getFromAddress();
    const payload = mapCampaignDataToActionInput(campaignData, fromAddress);

    startSaveDraftTransition(async () => {
      try {
        const existingId = savedDraftId.current;
        if (existingId) {
          const result = await updateDraftBatchSend(
            existingId,
            organizationId,
            payload
          );
          if (result.success) {
            clearRecoverySnapshot();
            toast.success("Draft saved");
            if (mode !== "edit") {
              router.push(`/${orgSlug}/emails/broadcasts/${existingId}/edit`);
            } else {
              router.refresh();
            }
          } else {
            toast.error("Failed to save draft", { description: result.error });
          }
          return;
        }

        const result = await saveDraftBatchSend(organizationId, payload);
        if (result.success) {
          savedDraftId.current = result.batch.id;
          clearRecoverySnapshot();
          toast.success("Draft saved");
          router.push(`/${orgSlug}/emails/broadcasts/${result.batch.id}/edit`);
        } else {
          toast.error("Failed to save draft", { description: result.error });
        }
      } catch (error) {
        toast.error("Failed to save draft", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });
  };

  const handleSend = () => {
    if (!requireAws("send")) {
      return;
    }

    if (!campaignData.awsAccountId) {
      toast.error("Please select an AWS account");
      return;
    }

    const fromAddress = getFromAddress();
    if (!fromAddress) {
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

    // Validate scheduling
    if (campaignData.scheduleType === "later") {
      if (!campaignData.scheduledDate) {
        toast.error("Please select a date for scheduling");
        return;
      }
      // Combine date and time
      const [hours, minutes] = campaignData.scheduledTime
        .split(":")
        .map(Number);
      const scheduledFor = new Date(campaignData.scheduledDate);
      scheduledFor.setHours(hours, minutes, 0, 0);

      if (scheduledFor <= new Date()) {
        toast.error("Scheduled time must be in the future");
        return;
      }
    }

    startTransition(async () => {
      try {
        // Calculate scheduledFor if scheduling
        const scheduledFor = buildScheduledFor(campaignData) ?? undefined;

        const payload = {
          name: campaignData.name || undefined,
          subject: campaignData.subject || undefined,
          previewText: campaignData.previewText || undefined,
          from: fromAddress,
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
          variableMappings:
            campaignData.variableMappings.length > 0
              ? campaignData.variableMappings
              : undefined,
          awsAccountId: campaignData.awsAccountId,
          recipientFilter: getCurrentFilter(),
          scheduledFor,
        };

        // Promote-from-draft vs direct-create. Both paths return the same
        // { success, batch? | error } shape so the rest of this handler
        // doesn't branch further.
        const result =
          mode === "edit" && draftId
            ? await promoteDraftToSend(draftId, organizationId, payload)
            : await createBatchSend(organizationId, payload);
        if (result.success) {
          clearRecoverySnapshot();
          const isScheduled = result.batch.status === "scheduled";

          // Capture broadcast sent event in PostHog
          posthog.capture("broadcast_sent", {
            broadcast_id: result.batch.id,
            broadcast_name: campaignData.name || null,
            recipient_count: result.batch.totalRecipients,
            content_type: campaignData.contentType,
            audience_type: campaignData.audienceType,
            is_scheduled: isScheduled,
            organization_id: organizationId,
            organization_slug: orgSlug,
          });

          queryClient.invalidateQueries({
            queryKey: getMessageUsageQueryKey(orgSlug),
          });

          toast.success(
            isScheduled ? "Broadcast scheduled" : "Broadcast created",
            {
              description: isScheduled
                ? `Will send to ${result.batch.totalRecipients} recipients at ${format(scheduledFor!, "PPp")} (${localTimeZoneLabel()})`
                : `Sending to ${result.batch.totalRecipients} recipients`,
            }
          );
          if (result.warning) {
            toast.warning("Sending will pause and resume", {
              description: result.warning,
              duration: 12_000,
            });
          }
          router.push(`/${orgSlug}/emails/broadcasts/${result.batch.id}`);
        } else {
          console.error("[batch-form] Error:", result.error);
          toast.error("Failed to create broadcast", {
            description: result.error,
          });
        }
      } catch (error) {
        console.error("[batch-form] Caught error:", error);
        toast.error("Failed to create broadcast", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
    });
  };

  const isSetupValid =
    campaignData.awsAccountId &&
    campaignData.fromPrefix &&
    campaignData.fromDomain;

  const isContentValid =
    campaignData.subject &&
    ((campaignData.contentType === "template" && campaignData.templateId) ||
      (campaignData.contentType === "html" && campaignData.htmlContent.trim()));

  const isAudienceValid =
    campaignData.audienceType === "all" ||
    (campaignData.audienceType === "topic" && campaignData.topicId) ||
    (campaignData.audienceType === "segment" && campaignData.segmentId);

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 pb-6">
        <Button
          aria-label="Back to broadcasts"
          asChild
          size="icon"
          variant="ghost"
        >
          <Link href={`/${orgSlug}/emails/broadcasts`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="font-bold text-2xl tracking-tight">
            {mode === "edit" ? "Edit Draft" : "New Broadcast"}
          </h1>
          <p className="text-muted-foreground">
            {mode === "edit"
              ? "Finish your draft, then send or schedule"
              : "Send an email to your contacts"}
          </p>
        </div>
      </div>

      {recoverable && (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-info/30 bg-info/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">
            <span className="font-medium">
              We kept your unfinished broadcast.
            </span>{" "}
            You left this page mid-compose. Restoring brings back your content
            and variable mappings.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              onClick={() => {
                setCampaignData(recoverable);
                setRecoverable(null);
                toast.success("Restored your unfinished broadcast");
              }}
              size="sm"
              type="button"
            >
              Restore
            </Button>
            <Button
              onClick={() => {
                setRecoverable(null);
                clearRecoverySnapshot();
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              Discard
            </Button>
          </div>
        </div>
      )}

      {/* Progress Steps */}
      <div className="border-b pb-6">
        <div className="mx-auto flex max-w-2xl items-center justify-center">
          {steps.map((step, index) => (
            <div className="flex flex-1 items-center" key={step.id}>
              <button
                className={`flex flex-1 items-center gap-3 ${
                  index < currentStepIndex ? "cursor-pointer" : "cursor-default"
                }`}
                disabled={index >= currentStepIndex}
                onClick={() => {
                  if (index < currentStepIndex) {
                    setCurrentStep(steps[index].id);
                  }
                }}
                type="button"
              >
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
              </button>
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
              domainsLoading={domainsLoading}
              onChange={updateData}
              onRefreshDomains={() =>
                fetchDomainsForAccount(campaignData.awsAccountId, true)
              }
              orgSlug={orgSlug}
              verifiedDomains={verifiedDomains}
            />
          )}
          {currentStep === "content" && (
            <ContentStep
              data={campaignData}
              onChange={updateData}
              organizationId={organizationId}
              orgSlug={orgSlug}
            />
          )}
          {currentStep === "audience" && (
            <AudienceStep
              countError={countError}
              data={campaignData}
              loadingCount={loadingCount}
              onChange={updateData}
              organizationId={organizationId}
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
              countError={countError}
              currentUserEmail={currentUserEmail}
              data={campaignData}
              isPending={isPending}
              loadingCount={loadingCount}
              onChange={updateData}
              onSend={handleSend}
              organizationId={organizationId}
              orgSlug={orgSlug}
              recipientCount={recipientCount}
              schedulingEnabled={schedulingEnabled}
              segments={segments}
              topics={topics}
            />
          )}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="border-t pt-6">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2">
          <Button
            disabled={currentStepIndex === 0}
            onClick={handleBack}
            type="button"
            variant="outline"
          >
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Button
              disabled={isSavingDraft || isPending}
              onClick={handleSaveDraft}
              type="button"
              variant="outline"
            >
              {isSavingDraft ? "Saving..." : "Save as draft"}
            </Button>
            {currentStep !== "review" && (
              <Button
                disabled={
                  (currentStep === "setup" && !isSetupValid) ||
                  (currentStep === "content" && !isContentValid) ||
                  (currentStep === "audience" && !isAudienceValid)
                }
                onClick={handleNext}
                type="button"
              >
                Continue
              </Button>
            )}
          </div>
        </div>
      </div>

      <ConnectAwsDialog
        action={pendingAction ?? "send"}
        onOpenChange={setAwsDialogOpen}
        open={awsDialogOpen}
        orgSlug={awsOrgSlug}
      />
    </div>
  );
}

// Setup Step Component
function SetupStep({
  awsAccounts,
  data,
  domainsLoading,
  onChange,
  onRefreshDomains,
  orgSlug,
  verifiedDomains,
}: {
  awsAccounts: AwsAccount[];
  data: CampaignData;
  domainsLoading: boolean;
  onChange: (updates: Partial<CampaignData>) => void;
  onRefreshDomains: () => void;
  orgSlug: string;
  verifiedDomains: VerifiedIdentity[];
}) {
  // Get available domains for the dropdown (domains only, not email addresses)
  const domainOptions = verifiedDomains.filter((d) => d.type === "DOMAIN");
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sender Information</CardTitle>
          <CardDescription>Configure who this email is from</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
            <div className="flex items-center justify-between">
              <Label htmlFor="fromPrefix">From Email *</Label>
              <Button
                aria-label="Refresh domains"
                className="h-6 w-6"
                disabled={domainsLoading}
                onClick={onRefreshDomains}
                size="icon"
                title="Refresh domains"
                type="button"
                variant="ghost"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${domainsLoading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
            {domainOptions.length > 0 ? (
              <div className="flex items-center gap-2">
                <Input
                  className="flex-1"
                  id="fromPrefix"
                  onChange={(e) => onChange({ fromPrefix: e.target.value })}
                  placeholder="hello"
                  value={data.fromPrefix}
                />
                <span className="text-muted-foreground">@</span>
                <Select
                  onValueChange={(value) => onChange({ fromDomain: value })}
                  value={data.fromDomain}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select domain" />
                  </SelectTrigger>
                  <SelectContent>
                    {domainOptions.map((domain) => (
                      <SelectItem key={domain.identity} value={domain.identity}>
                        {domain.identity}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center">
                <p className="text-muted-foreground text-sm">
                  {domainsLoading
                    ? "Loading domains..."
                    : "No verified domains found"}
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  Add a domain using the{" "}
                  <code className="rounded bg-muted px-1">
                    wraps email domains add
                  </code>{" "}
                  CLI command
                </p>
              </div>
            )}
            <p className="text-muted-foreground text-xs">
              Only verified domains with Wraps configuration are shown
            </p>
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
  organizationId,
  orgSlug,
}: {
  data: CampaignData;
  onChange: (updates: Partial<CampaignData>) => void;
  organizationId: string;
  orgSlug: string;
}) {
  const [showAdvanced, setShowAdvanced] = useState(data.contentType === "html");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Email Content</CardTitle>
          <CardDescription>
            Choose how to build your email content
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Use Template - Primary Option */}
          <div className="rounded-lg border p-4">
            <RadioGroup
              onValueChange={(v) => {
                if (v === "template") {
                  onChange({ contentType: v as ContentType });
                  setShowAdvanced(false);
                }
              }}
              value={data.contentType === "template" ? "template" : undefined}
            >
              <div className="flex items-start space-x-3">
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
                    Select from your saved email templates or create a new one
                  </p>
                  {data.contentType === "template" && (
                    <TemplateSelector
                      onTemplateChange={(templateId, tmpl) => {
                        const updates: Partial<CampaignData> = {
                          templateId,
                          variableMappings: [],
                        };
                        const subject = stripSelfReferencingPlaceholder(
                          "subject",
                          tmpl?.subject
                        );
                        if (subject) {
                          updates.subject = subject;
                        }
                        const previewText = stripSelfReferencingPlaceholder(
                          "previewText",
                          tmpl?.previewText
                        );
                        if (previewText) {
                          updates.previewText = previewText;
                        }
                        onChange(updates);
                      }}
                      orgSlug={orgSlug}
                      selectedTemplateId={data.templateId || undefined}
                    />
                  )}
                </div>
              </div>
            </RadioGroup>
          </div>

          {/* Advanced Options - Collapsible */}
          <Collapsible onOpenChange={setShowAdvanced} open={showAdvanced}>
            <CollapsibleTrigger asChild>
              <Button
                className="w-full justify-between"
                type="button"
                variant="ghost"
              >
                <span className="text-muted-foreground text-sm">
                  Advanced options
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    showAdvanced && "rotate-180"
                  )}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <div className="rounded-lg border p-4">
                <RadioGroup
                  onValueChange={(v) => {
                    onChange({
                      contentType: v as ContentType,
                      templateId: "",
                    });
                  }}
                  value={data.contentType === "html" ? "html" : undefined}
                >
                  <div className="flex items-start space-x-3">
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
                            Tip: Make sure your HTML is responsive for mobile
                            devices
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </RadioGroup>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Subject & Preview Text */}
      <Card>
        <CardHeader>
          <CardTitle>Subject & Preview</CardTitle>
          <CardDescription>
            The subject line and preview text for this broadcast
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

      {/* Variable Mapping - shown when a template is selected */}
      {data.contentType === "template" && data.templateId && (
        <VariableMapper
          formManagedValues={{
            subject: data.subject,
            previewText: data.previewText,
          }}
          mappings={data.variableMappings}
          onChange={(mappings) => onChange({ variableMappings: mappings })}
          organizationId={organizationId}
          templateId={data.templateId}
        />
      )}
    </div>
  );
}

// How many recipients the "View all recipients" dialog will load. Enough to
// answer "did I pick the right audience?" without pulling a whole list into
// the browser; larger audiences fall back to the contacts page.
const RECIPIENT_LIST_LIMIT = 200;

function ContactRow({ contact }: { contact: SampleContact }) {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{contact.email}</span>
      {(name || contact.company) && (
        <span className="text-muted-foreground/70">
          ({[name, contact.company].filter(Boolean).join(", ")})
        </span>
      )}
    </div>
  );
}

function AllRecipientsDialog({
  filter,
  onOpenChange,
  open,
  organizationId,
  orgSlug,
  recipientCount,
}: {
  filter: RecipientFilter;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  organizationId: string;
  orgSlug: string;
  recipientCount: number | null;
}) {
  const [contacts, setContacts] = useState<SampleContact[]>([]);
  const [loading, setLoading] = useState(false);

  // The full list is only worth fetching once someone opens it, and it is
  // re-fetched whenever the audience changes so an open dialog can never show
  // recipients from a filter the user has already moved off.
  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      const result = await getSampleContacts(
        organizationId,
        "email",
        filter,
        RECIPIENT_LIST_LIMIT
      );
      if (cancelled) {
        return;
      }
      if (result.success) {
        setContacts(result.contacts);
      }
      setLoading(false);
    };
    fetchAll();
    return () => {
      cancelled = true;
    };
  }, [filter, open, organizationId]);

  const truncated = recipientCount !== null && recipientCount > contacts.length;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Recipients</DialogTitle>
          <DialogDescription>
            {recipientCount === null
              ? "Everyone this broadcast will be sent to."
              : `Everyone this broadcast will be sent to (${recipientCount.toLocaleString()}).`}
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : (
          <ScrollArea className="max-h-80">
            <div className="space-y-1 pr-4">
              {contacts.map((contact) => (
                <ContactRow contact={contact} key={contact.id} />
              ))}
            </div>
          </ScrollArea>
        )}
        {truncated && (
          <p className="text-muted-foreground text-xs">
            Showing the first {contacts.length.toLocaleString()} of{" "}
            {recipientCount.toLocaleString()}.{" "}
            <Link
              className="text-primary hover:underline"
              href={`/${orgSlug}/contacts`}
              rel="noreferrer"
              target="_blank"
            >
              Open all contacts in a new tab
            </Link>
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecipientPreviewCard({
  countError,
  data,
  loadingCount,
  organizationId,
  orgSlug,
  recipientCount,
}: {
  countError: string | null;
  data: CampaignData;
  loadingCount: boolean;
  organizationId: string;
  orgSlug: string;
  recipientCount: number | null;
}) {
  const [sampleContacts, setSampleContacts] = useState<SampleContact[]>([]);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [showAllRecipients, setShowAllRecipients] = useState(false);

  const filter: RecipientFilter = useMemo(
    () => ({
      audienceType: data.audienceType,
      topicId: data.audienceType === "topic" ? data.topicId : undefined,
      segmentId: data.audienceType === "segment" ? data.segmentId : undefined,
    }),
    [data.audienceType, data.topicId, data.segmentId]
  );

  const hasValidSelection =
    data.audienceType === "all" ||
    (data.audienceType === "topic" && Boolean(data.topicId)) ||
    (data.audienceType === "segment" && Boolean(data.segmentId));

  // Fetch sample contacts when audience selection changes
  useEffect(() => {
    let cancelled = false;
    const fetchSamples = async () => {
      if (!hasValidSelection) {
        setSampleContacts([]);
        return;
      }

      setLoadingSamples(true);
      const result = await getSampleContacts(
        organizationId,
        "email",
        filter,
        5
      );
      if (cancelled) {
        return;
      }
      if (result.success) {
        setSampleContacts(result.contacts);
      }
      setLoadingSamples(false);
    };

    fetchSamples();
    return () => {
      cancelled = true;
    };
  }, [organizationId, filter, hasValidSelection]);

  const hasMoreThanPreview =
    recipientCount !== null && recipientCount > sampleContacts.length;

  return (
    <>
      {/* Recipient Count & Sample Preview */}
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
                  : countError || recipientCount === null
                    ? "Unknown"
                    : recipientCount.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Sample Contacts Preview */}
          {sampleContacts.length > 0 && (
            <div className="mt-4 border-t pt-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium text-muted-foreground text-sm">
                  {recipientCount === null
                    ? `Preview (${sampleContacts.length})`
                    : `Preview (${sampleContacts.length} of ${recipientCount.toLocaleString()})`}
                </p>
                {hasMoreThanPreview && (
                  <Button
                    className="h-auto p-0 text-xs"
                    onClick={() => setShowAllRecipients(true)}
                    type="button"
                    variant="link"
                  >
                    View all recipients
                  </Button>
                )}
              </div>
              <div className="space-y-1">
                {loadingSamples ? (
                  <p className="text-muted-foreground text-sm">Loading...</p>
                ) : (
                  sampleContacts.map((contact) => (
                    <ContactRow contact={contact} key={contact.id} />
                  ))
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Leaving the wizard to inspect the audience used to discard the whole
          draft, so the full list opens here instead of on the contacts page. */}
      <AllRecipientsDialog
        filter={filter}
        onOpenChange={setShowAllRecipients}
        open={showAllRecipients}
        organizationId={organizationId}
        orgSlug={orgSlug}
        recipientCount={recipientCount}
      />
    </>
  );
}

// Audience Step Component
function AudienceStep({
  data,
  countError,
  loadingCount,
  onChange,
  organizationId,
  orgSlug,
  recipientCount,
  segments,
  segmentsEnabled,
  topics,
  topicsEnabled,
}: {
  countError: string | null;
  data: CampaignData;
  loadingCount: boolean;
  onChange: (updates: Partial<CampaignData>) => void;
  organizationId: string;
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
                        Growth
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
                          can be emailed)
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
                        Growth
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
                          can be emailed)
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

      <RecipientPreviewCard
        countError={countError}
        data={data}
        loadingCount={loadingCount}
        organizationId={organizationId}
        orgSlug={orgSlug}
        recipientCount={recipientCount}
      />
    </div>
  );
}

// Review Step Component
function ReviewStep({
  data,
  isPending,
  countError,
  currentUserEmail,
  loadingCount,
  onChange,
  onSend,
  organizationId,
  orgSlug,
  recipientCount,
  schedulingEnabled,
  segments,
  topics,
}: {
  countError: string | null;
  currentUserEmail: string;
  data: CampaignData;
  isPending: boolean;
  loadingCount: boolean;
  onChange: (updates: Partial<CampaignData>) => void;
  onSend: () => void;
  organizationId: string;
  orgSlug: string;
  recipientCount: number | null;
  schedulingEnabled: boolean;
  segments: Segment[];
  topics: Topic[];
}) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [coverageResult, setCoverageResult] =
    useState<CheckTemplateVariableCoverageResult | null>(null);
  // A preflight that threw used to be indistinguishable from one that passed:
  // no `.catch`, so the promise rejected, state stayed null, and the review
  // step rendered a clean bill of health. These track "the check did not run".
  const [coverageCheckFailed, setCoverageCheckFailed] = useState(false);
  const [durationCheckFailed, setDurationCheckFailed] = useState(false);

  // Check variable coverage once content + audience are both set. Custom HTML
  // goes through the same check as a template — it used to have none.
  useEffect(() => {
    const usesTemplate = data.contentType === "template" && data.templateId;
    const usesHtml =
      data.contentType === "html" && data.htmlContent.trim().length > 0;
    if (!(usesTemplate || usesHtml)) {
      setCoverageResult(null);
      setCoverageCheckFailed(false);
      return;
    }
    const filter: RecipientFilter = {
      audienceType: data.audienceType,
      topicId: data.audienceType === "topic" ? data.topicId : undefined,
      segmentId: data.audienceType === "segment" ? data.segmentId : undefined,
    };
    const mappings =
      data.variableMappings.length > 0 ? data.variableMappings : undefined;

    let cancelled = false;
    const check = usesTemplate
      ? checkTemplateVariableCoverage(
          organizationId,
          data.templateId,
          filter,
          mappings
        )
      : checkHtmlVariableCoverage(
          organizationId,
          data.htmlContent,
          data.subject || undefined,
          filter,
          mappings
        );

    check
      .then((result) => {
        if (cancelled) {
          return;
        }
        setCoverageResult(result);
        setCoverageCheckFailed(!result.success);
      })
      .catch(() => {
        if (!cancelled) {
          setCoverageResult(null);
          setCoverageCheckFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    organizationId,
    data.contentType,
    data.templateId,
    data.htmlContent,
    data.subject,
    data.audienceType,
    data.topicId,
    data.segmentId,
    data.variableMappings,
  ]);

  const coverageWarning =
    coverageResult?.success && coverageResult.missingCount > 0
      ? coverageResult
      : null;

  const [durationResult, setDurationResult] =
    useState<CheckSendDurationResult | null>(null);

  // Estimate the multi-day send duration BEFORE the user confirms, so an
  // 800k-recipient broadcast that will take ~8 days is a decision made before
  // clicking Send, not a toast discovered after. This wizard is email-only —
  // there is no SMS variant of CampaignData — so the channel is always "email".
  useEffect(() => {
    if (!data.awsAccountId || recipientCount === null) {
      setDurationResult(null);
      setDurationCheckFailed(false);
      return;
    }
    let cancelled = false;
    checkBroadcastSendDuration(
      organizationId,
      data.awsAccountId,
      "email",
      recipientCount,
      Boolean(data.scheduleType === "later" && data.scheduledDate)
    )
      .then((result) => {
        if (cancelled) {
          return;
        }
        setDurationResult(result);
        setDurationCheckFailed(!result.success);
      })
      .catch(() => {
        if (!cancelled) {
          setDurationResult(null);
          setDurationCheckFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    organizationId,
    data.awsAccountId,
    recipientCount,
    data.scheduleType,
    data.scheduledDate,
  ]);

  const estimatedDays =
    durationResult?.success && durationResult.available
      ? durationResult.estimatedDays
      : null;

  const dailyCapacity =
    durationResult?.success && durationResult.available
      ? durationResult.dailyCapacity
      : 0;

  const inFlightBatches =
    durationResult?.success && durationResult.available
      ? durationResult.inFlightBatches
      : 0;

  const inFlightRecipients =
    durationResult?.success && durationResult.available
      ? durationResult.inFlightRecipients
      : 0;

  // The SES sandbox is the actual cause of an enormous day estimate (200/day),
  // and it also means SES rejects every unverified recipient. Before this the
  // wizard rendered "~100 days" and never named it.
  const inSandbox =
    durationResult?.success &&
    durationResult.available &&
    !durationResult.productionAccessEnabled;

  // The server blocks this exact case, so offering Send and rejecting after the
  // point-of-no-return dialog is the wrong order to find out.
  const blockedByCoverage = Boolean(
    coverageResult?.success &&
      coverageResult.allFail &&
      coverageResult.missingVariables.length > 0
  );

  // Fetch templates with React Query - auto-updates when templates change
  const { data: templatesData } = useTemplates(orgSlug);
  const templates: Template[] = (templatesData ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    subject: t.subject,
    previewText: t.previewText ?? null,
  }));

  const reviewRecipientFilter = useMemo(
    () => ({
      audienceType: data.audienceType,
      topicId: data.audienceType === "topic" ? data.topicId : undefined,
      segmentId: data.audienceType === "segment" ? data.segmentId : undefined,
    }),
    [data.audienceType, data.topicId, data.segmentId]
  );

  const getAudienceLabel = () => {
    if (data.audienceType === "all") {
      return "All Contacts";
    }
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

  // data.scheduledDate carries midnight; the time-of-day lives in
  // data.scheduledTime. The dialog was given the bare date, so it announced
  // "12:00 AM" for a send the user scheduled for 9am.
  const scheduledDateTimeForConfirm = (() => {
    if (data.scheduleType !== "later" || !data.scheduledDate) {
      return;
    }
    const [hours, minutes] = data.scheduledTime.split(":").map(Number);
    const combined = new Date(data.scheduledDate);
    combined.setHours(hours, minutes, 0, 0);
    return combined;
  })();

  const testSendBlockedReason = (() => {
    if (!(data.fromPrefix && data.fromDomain)) {
      return "Set a from address in step 1 before sending a test.";
    }
    if (!data.subject) {
      return "Add a subject line in step 2 before sending a test.";
    }
    if (data.contentType === "template" && !data.templateId) {
      return "Pick a template in step 2 before sending a test.";
    }
    if (data.contentType === "html" && !data.htmlContent.trim()) {
      return "Add HTML content in step 2 before sending a test.";
    }
    return;
  })();

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
                {data.fromName
                  ? `${data.fromName} <${data.fromPrefix}@${data.fromDomain}>`
                  : `${data.fromPrefix}@${data.fromDomain}`}
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

      {/* Email Preview Carousel - only show for template content */}
      {data.contentType === "template" && data.templateId && (
        <EmailPreviewCarousel
          organizationId={organizationId}
          recipientFilter={reviewRecipientFilter}
          templateId={data.templateId}
          variableMappings={data.variableMappings}
        />
      )}

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
                    : countError || recipientCount === null
                      ? "Recipient count unavailable"
                      : `${recipientCount.toLocaleString()} recipients`}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test send — the flow had none, so the only way to try a broadcast was
          to send a real one. See finding H5. */}
      <TestSendCard
        defaultTo={currentUserEmail}
        disabledReason={testSendBlockedReason}
        organizationId={organizationId}
        payload={{
          awsAccountId: data.awsAccountId,
          from: `${data.fromPrefix}@${data.fromDomain}`,
          fromName: data.fromName || undefined,
          replyTo: data.replyTo || undefined,
          subject: data.subject,
          templateId:
            data.contentType === "template"
              ? data.templateId || undefined
              : undefined,
          htmlContent:
            data.contentType === "html"
              ? data.htmlContent || undefined
              : undefined,
          variableMappings:
            data.variableMappings.length > 0
              ? data.variableMappings
              : undefined,
          recipientFilter: reviewRecipientFilter,
        }}
      />

      {/* Scheduling Card */}
      <SchedulingCard
        data={data}
        onChange={onChange}
        schedulingEnabled={schedulingEnabled}
      />

      {/* Variable coverage warning */}
      {coverageWarning && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="space-y-1">
            <p className="font-medium text-warning text-sm">
              {coverageWarning.missingCount === coverageWarning.totalSampled
                ? "All sampled contacts are missing required template variables"
                : `${coverageWarning.missingCount} of ${coverageWarning.totalSampled} contacts are missing template variables`}
            </p>
            <p className="text-warning/80 text-xs">
              Missing: {coverageWarning.missingVariables.join(", ")}. Add these
              attributes to your contacts or set a fallback value in the
              template.
            </p>
          </div>
        </div>
      )}

      {/* SES sandbox — named, not left to an unexplained day count (H6) */}
      {inSandbox && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="space-y-1">
            <p className="font-medium text-warning text-sm">
              This AWS account is still in the SES sandbox
            </p>
            <p className="text-warning/80 text-xs">
              SES will reject every recipient that is not a verified address,
              and the sandbox daily quota is {dailyCapacity.toLocaleString()} —
              which is why the estimate below is what it is. Requesting
              production access in the SES console is the one step that changes
              it. You can still send now to verified addresses.
            </p>
          </div>
        </div>
      )}

      {/* Blocked by variable coverage — say so here, not after confirming (M8) */}
      {blockedByCoverage && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="font-medium text-destructive text-sm">
              Every contact is missing a required variable, so this send is
              blocked.
            </p>
            <p className="text-destructive/80 text-xs">
              Missing:{" "}
              {coverageResult?.success
                ? coverageResult.missingVariables.join(", ")
                : ""}
              . Set a value under Template Variables, add these attributes to
              your contacts, or set a fallback in your{" "}
              {data.contentType === "template" ? "template" : "HTML"}.
            </p>
          </div>
        </div>
      )}

      {/* A safety check that did not run must not read as one that passed (H8) */}
      {(coverageCheckFailed || durationCheckFailed) && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="space-y-1">
            <p className="font-medium text-warning text-sm">
              Some pre-send checks couldn't run.
            </p>
            <p className="text-warning/80 text-xs">
              {coverageCheckFailed && durationCheckFailed
                ? "The variable-coverage check and the send-duration estimate both failed"
                : coverageCheckFailed
                  ? "The variable-coverage check failed"
                  : "The send-duration estimate failed"}
              , so this page can't tell you whether they would have warned you.
              Reload to try again. Sending is still allowed — the server runs
              its own checks — but you are sending without this warning.
            </p>
          </div>
        </div>
      )}

      {/* Recipient count unavailable warning */}
      {countError && (
        <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="space-y-1">
            <p className="font-medium text-warning text-sm">
              We couldn't count this audience. Sending is blocked until the
              count loads.
            </p>
            <p className="text-warning/80 text-xs">
              Reload the page to try again — if it keeps failing, check that the
              selected topic or segment still exists. ({countError})
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-end pt-4">
        <Button
          disabled={
            isPending ||
            loadingCount ||
            recipientCount === null ||
            recipientCount === 0 ||
            blockedByCoverage ||
            (data.scheduleType === "later" && !data.scheduledDate)
          }
          onClick={() => setShowConfirmDialog(true)}
          size="lg"
        >
          {isPending ? (
            data.scheduleType === "later" ? (
              "Scheduling..."
            ) : (
              "Sending..."
            )
          ) : recipientCount === null ? (
            "Recipient count unavailable"
          ) : data.scheduleType === "later" ? (
            <>
              <Clock className="mr-2 h-4 w-4" />
              Schedule for {recipientCount.toLocaleString()} contacts
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Send to {recipientCount.toLocaleString()} contacts
            </>
          )}
        </Button>
      </div>

      <SendConfirmDialog
        audienceLabel={getAudienceLabel()}
        countIsProvisional
        estimatedDays={estimatedDays}
        inFlightBatches={inFlightBatches}
        inFlightRecipients={inFlightRecipients}
        loading={isPending}
        onConfirm={() => {
          setShowConfirmDialog(false);
          onSend();
        }}
        onOpenChange={setShowConfirmDialog}
        open={showConfirmDialog}
        recipientCount={recipientCount}
        scheduledDate={scheduledDateTimeForConfirm}
        timeZoneLabel={localTimeZoneLabel()}
        variant={data.scheduleType === "later" ? "schedule" : "send"}
      />
    </div>
  );
}

// Scheduling Card Component - isolated to prevent NL input keystrokes from
// re-rendering the rest of ReviewStep (notably EmailPreviewCarousel)
function SchedulingCard({
  data,
  onChange,
  schedulingEnabled,
}: {
  data: CampaignData;
  onChange: (updates: Partial<CampaignData>) => void;
  schedulingEnabled: boolean;
}) {
  // Natural language date input (state is local to this component)
  const [nlText, setNlText] = useState("");
  const { parsedDate, formattedPreview } = useNaturalDateParser(nlText);

  // Sync parsed NL date → pickers (only when the value actually changes)
  useEffect(() => {
    if (!parsedDate) {
      return;
    }

    // Snap time to nearest 30-minute slot
    const minutes = parsedDate.getMinutes();
    const snappedMinutes = minutes < 15 ? 0 : minutes < 45 ? 30 : 0;
    const snappedHours =
      minutes >= 45 ? parsedDate.getHours() + 1 : parsedDate.getHours();
    const finalHours = snappedHours % 24;

    const newTime = `${finalHours.toString().padStart(2, "0")}:${snappedMinutes.toString().padStart(2, "0")}`;
    const newDate = new Date(parsedDate);
    newDate.setHours(0, 0, 0, 0);

    // Skip update if date and time haven't actually changed
    const dateUnchanged =
      data.scheduledDate && data.scheduledDate.getTime() === newDate.getTime();
    const timeUnchanged = data.scheduledTime === newTime;
    if (dateUnchanged && timeUnchanged) {
      return;
    }

    onChange({ scheduledDate: newDate, scheduledTime: newTime });
  }, [parsedDate, data.scheduledDate, data.scheduledTime, onChange]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear NL text when user picks via calendar/time dropdown
  const handlePickerDateChange = (date: Date | undefined) => {
    setNlText("");
    onChange({ scheduledDate: date });
  };

  const handlePickerTimeChange = (time: string) => {
    setNlText("");
    onChange({ scheduledTime: time });
  };

  // Generate time options in 30-minute increments
  const timeOptions = [];
  for (let hour = 0; hour < 24; hour++) {
    for (const minute of [0, 30]) {
      const time = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
      const displayTime = format(new Date().setHours(hour, minute), "h:mm a");
      timeOptions.push({ value: time, label: displayTime });
    }
  }

  // Calculate the scheduled datetime for display
  const getScheduledDateTime = () => {
    if (!data.scheduledDate) {
      return null;
    }
    const [hours, minutes] = data.scheduledTime.split(":").map(Number);
    const scheduled = new Date(data.scheduledDate);
    scheduled.setHours(hours, minutes, 0, 0);
    return scheduled;
  };

  const scheduledDateTime = getScheduledDateTime();

  return (
    <Card>
      <CardHeader>
        <CardTitle>When to Send</CardTitle>
        <CardDescription>Send now or schedule for later</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          onValueChange={(v) => onChange({ scheduleType: v as ScheduleType })}
          value={data.scheduleType}
        >
          {/* Send Now */}
          <div className="flex items-start space-x-3 rounded-lg border p-4">
            <RadioGroupItem id="now" value="now" />
            <div className="flex-1">
              <label
                className="cursor-pointer font-medium text-sm"
                htmlFor="now"
              >
                <Send className="mr-1 inline h-4 w-4" />
                Send immediately
              </label>
              <p className="mt-1 text-muted-foreground text-xs">
                Start sending to recipients right away
              </p>
            </div>
          </div>

          {/* Schedule for Later */}
          <div
            className={cn(
              "flex items-start space-x-3 rounded-lg border p-4",
              !schedulingEnabled && "cursor-not-allowed opacity-60"
            )}
          >
            <RadioGroupItem
              disabled={!schedulingEnabled}
              id="later"
              value="later"
            />
            <div className="flex-1 space-y-3">
              <div>
                <label
                  className={cn(
                    "font-medium text-sm",
                    schedulingEnabled ? "cursor-pointer" : "cursor-not-allowed"
                  )}
                  htmlFor="later"
                >
                  {schedulingEnabled ? (
                    <Clock className="mr-1 inline h-4 w-4" />
                  ) : (
                    <Lock className="mr-1 inline h-4 w-4" />
                  )}
                  Schedule for later
                  {!schedulingEnabled && (
                    <span className="ml-2 text-muted-foreground text-xs">
                      (Starter plan)
                    </span>
                  )}
                </label>
                <p className="mt-1 text-muted-foreground text-xs">
                  {schedulingEnabled
                    ? "Choose a specific date and time to send"
                    : "Upgrade to Starter to schedule broadcasts for later"}
                </p>
              </div>
              {data.scheduleType === "later" && (
                <div className="space-y-3">
                  {/* Natural language date input */}
                  <div className="space-y-1.5">
                    <Input
                      onChange={(e) => setNlText(e.target.value)}
                      placeholder='Type a date, e.g. "next Wednesday at 9am"'
                      value={nlText}
                    />
                    {formattedPreview && (
                      <p className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                        <Check className="h-3.5 w-3.5" />
                        {formattedPreview}
                      </p>
                    )}
                  </div>

                  {/* Date & time pickers as fallback */}
                  <div className="space-y-1.5">
                    <p className="text-muted-foreground text-xs">
                      Or pick a date and time:
                    </p>
                    <div className="flex flex-wrap gap-3">
                      {/* Date Picker */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            className={cn(
                              "w-[180px] justify-start text-left font-normal",
                              !data.scheduledDate && "text-muted-foreground"
                            )}
                            variant="outline"
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {data.scheduledDate ? (
                              format(data.scheduledDate, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-auto p-0">
                          <Calendar
                            disabled={(date) => date < new Date()}
                            mode="single"
                            onSelect={handlePickerDateChange}
                            selected={data.scheduledDate}
                          />
                        </PopoverContent>
                      </Popover>

                      {/* Time Picker */}
                      <Select
                        onValueChange={handlePickerTimeChange}
                        value={data.scheduledTime}
                      >
                        <SelectTrigger className="w-[160px]">
                          <Clock className="mr-2 h-4 w-4" />
                          <SelectValue placeholder="Time" />
                        </SelectTrigger>
                        <SelectContent>
                          {timeOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              )}
              {data.scheduleType === "later" && scheduledDateTime && (
                <p className="text-muted-foreground text-xs">
                  Scheduled for {format(scheduledDateTime, "PPPP 'at' p")} (
                  {localTimeZoneLabel()})
                </p>
              )}
            </div>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
