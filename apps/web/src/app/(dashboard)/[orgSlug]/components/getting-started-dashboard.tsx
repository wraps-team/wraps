"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Checkbox } from "@wraps/ui/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wraps/ui/components/ui/collapsible";
import { Label } from "@wraps/ui/components/ui/label";
import { Progress } from "@wraps/ui/components/ui/progress";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@wraps/ui/components/ui/tabs";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CalendarIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronDownIcon,
  CloudIcon,
  CodeIcon,
  CopyIcon,
  ExternalLinkIcon,
  GlobeIcon,
  InfoIcon,
  LinkIcon,
  Loader2Icon,
  MailIcon,
  RefreshCwIcon,
  ServerIcon,
  TerminalIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  saveWebhookSecretAction,
  scanAWSAccountFeatures,
} from "@/actions/aws-accounts";
import {
  getOwnEmailVerificationStatus,
  sendSimulatorTestEmail,
  sendWelcomeTestEmail,
  verifyOwnEmailIdentity,
} from "@/actions/ses-onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { AccountFeatures, AwsAccountData, SetupStatus } from "../page";
import { CAL_BOOKING_URL, HelpCard } from "./help-card";
import { NextStepCard } from "./next-step-card";

type GettingStartedDashboardProps = {
  orgSlug: string;
  organizationId: string;
  organizationName: string;
  setupStatus: SetupStatus;
  completionPercent: number;
  awsAccount: AwsAccountData;
  userEmail: string;
};

const SDK_CODE = `import { WrapsEmail } from '@wraps.dev/email';

const wraps = new WrapsEmail();

await wraps.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Hello from Wraps!</h1>',
});`;

const INSTALL_CODE = "npm install @wraps.dev/email";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      aria-label="Copy to clipboard"
      className="h-8 w-8 shrink-0"
      onClick={handleCopy}
      size="icon"
      variant="ghost"
    >
      {copied ? (
        <CheckIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
      ) : (
        <CopyIcon className="h-4 w-4" />
      )}
    </Button>
  );
}

type ChecklistItemContentProps = {
  title: string;
  description: string;
  isComplete: boolean;
  icon: React.ReactNode;
  isOptional?: boolean;
};

function ChecklistItemIcon({
  isComplete,
  icon,
}: {
  isComplete: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
        isComplete
          ? "bg-green-500/10 text-green-600 dark:text-green-400"
          : "bg-primary/10 text-primary"
      )}
    >
      {isComplete ? <CheckCircle2Icon className="h-5 w-5" /> : icon}
    </div>
  );
}

function ChecklistItemBadges({
  isComplete,
  isOptional,
}: {
  isComplete: boolean;
  isOptional?: boolean;
}) {
  return (
    <>
      {isOptional && (
        <Badge className="text-xs" variant="secondary">
          Optional
        </Badge>
      )}
      {isComplete && (
        <Badge
          className="text-xs text-green-600 border-green-200 bg-green-50 dark:text-green-400 dark:border-green-800 dark:bg-green-950"
          variant="outline"
        >
          Complete
        </Badge>
      )}
    </>
  );
}

function ChecklistItemContent({
  title,
  description,
  isComplete,
  icon,
  isOptional,
}: ChecklistItemContentProps) {
  return (
    <>
      <ChecklistItemIcon icon={icon} isComplete={isComplete} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4
            className={cn("font-medium", isComplete && "text-muted-foreground")}
          >
            {title}
          </h4>
          <ChecklistItemBadges
            isComplete={isComplete}
            isOptional={isOptional}
          />
        </div>
        <p
          className={cn(
            "mt-1 text-sm",
            isComplete ? "text-muted-foreground/70" : "text-muted-foreground"
          )}
        >
          {description}
        </p>
      </div>
    </>
  );
}

type ExpandableChecklistItemProps = ChecklistItemContentProps & {
  href?: string;
  children?: React.ReactNode;
  defaultOpen?: boolean;
};

function ExpandableChecklistItem({
  title,
  description,
  isComplete,
  href,
  icon,
  isOptional,
  children,
  defaultOpen = false,
}: ExpandableChecklistItemProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Simple link-based item when no children
  if (!children) {
    const content = (
      <div
        className={cn(
          "flex items-start gap-4 rounded-lg border p-4 transition-colors",
          href && !isComplete && "cursor-pointer hover:bg-accent",
          isComplete && "bg-muted/30"
        )}
      >
        <ChecklistItemContent
          description={description}
          icon={icon}
          isComplete={isComplete}
          isOptional={isOptional}
          title={title}
        />
        {href && !isComplete && (
          <ArrowRightIcon className="h-5 w-5 text-muted-foreground shrink-0" />
        )}
      </div>
    );

    return href && !isComplete ? <Link href={href}>{content}</Link> : content;
  }

  // Expandable collapsible item
  return (
    <Collapsible onOpenChange={setIsOpen} open={isOpen}>
      <div
        className={cn(
          "rounded-lg border transition-colors",
          isComplete && "bg-muted/30"
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            className="flex w-full items-start gap-4 p-4 text-left hover:bg-accent/50 transition-colors rounded-t-lg"
            type="button"
          >
            <ChecklistItemContent
              description={description}
              icon={icon}
              isComplete={isComplete}
              isOptional={isOptional}
              title={title}
            />
            <ChevronDownIcon
              className={cn(
                "h-5 w-5 text-muted-foreground shrink-0 transition-transform",
                isOpen && "rotate-180"
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t px-4 py-4">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function FeatureStatusRow({
  enabled,
  label,
}: {
  enabled: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {enabled ? (
        <CheckCircle2Icon className="h-4 w-4 text-green-600 dark:text-green-400" />
      ) : (
        <XCircleIcon className="h-4 w-4 text-muted-foreground" />
      )}
      <span className="text-sm">{label}</span>
    </div>
  );
}

function ResultMessage({
  success,
  message,
}: {
  success: boolean;
  message: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-3",
        success
          ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
          : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
      )}
    >
      <div className="flex items-center gap-2 text-sm">
        {success ? (
          <CheckCircle2Icon className="h-4 w-4" />
        ) : (
          <XCircleIcon className="h-4 w-4" />
        )}
        {message}
      </div>
    </div>
  );
}

type ScanFeaturesActionProps = {
  awsAccountId: string;
  organizationId: string;
  features: AccountFeatures;
};

function ScanFeaturesAction({
  awsAccountId,
  organizationId,
  features,
}: ScanFeaturesActionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    message: string;
    features?: AccountFeatures;
  } | null>(null);

  const handleScan = () => {
    startTransition(async () => {
      setScanResult(null);
      const result = await scanAWSAccountFeatures(awsAccountId, organizationId);

      if (result.success) {
        setScanResult({
          success: true,
          message: "Features scanned successfully",
          features: result.features,
        });
        router.refresh();
      } else {
        setScanResult({ success: false, message: result.error });
      }
    });
  };

  const displayFeatures = scanResult?.features || features;
  const emailFeatures = displayFeatures?.email;
  const identityCount = emailFeatures?.identities?.length || 0;
  // Config sets are per-domain now, so a null canonical configSetName doesn't
  // mean tracking is missing — verified identities each carry their own set.
  const hasConfigSet = !!emailFeatures?.configSetName || identityCount > 0;

  return (
    <div className="space-y-4">
      <Button disabled={isPending} onClick={handleScan} variant="outline">
        {isPending ? (
          <>
            <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
            Scanning...
          </>
        ) : (
          <>
            <RefreshCwIcon className="mr-2 h-4 w-4" />
            Scan Features
          </>
        )}
      </Button>

      {scanResult && (
        <ResultMessage
          message={scanResult.message}
          success={scanResult.success}
        />
      )}

      {displayFeatures && (
        <div className="space-y-2">
          <FeatureStatusRow
            enabled={hasConfigSet}
            label={
              emailFeatures?.configSetName
                ? `Configuration set (${emailFeatures.configSetName})`
                : identityCount > 0
                  ? "Configuration set (per-domain)"
                  : "Configuration set not found"
            }
          />
          <FeatureStatusRow
            enabled={!!emailFeatures?.eventTrackingEnabled}
            label={`Event tracking ${emailFeatures?.eventTrackingEnabled ? "enabled" : "not enabled"}`}
          />
          <FeatureStatusRow
            enabled={!!emailFeatures?.eventHistoryEnabled}
            label={`Event history ${emailFeatures?.eventHistoryEnabled ? "enabled" : "not enabled"}`}
          />
          <FeatureStatusRow
            enabled={identityCount > 0}
            label={`${identityCount} verified ${identityCount === 1 ? "domain" : "domains"} found`}
          />
        </div>
      )}

      {!hasConfigSet && (
        <p className="text-muted-foreground text-xs">
          Run{" "}
          <code className="rounded bg-muted px-1 py-0.5">wraps email init</code>{" "}
          to deploy email infrastructure.
        </p>
      )}
    </div>
  );
}

type WebhookSecretFormProps = {
  awsAccountId: string;
  organizationId: string;
  isConnected: boolean;
};

function WebhookSecretForm({
  awsAccountId,
  organizationId,
  isConnected,
}: WebhookSecretFormProps) {
  const router = useRouter();
  const [webhookSecret, setWebhookSecret] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleSave = () => {
    if (!webhookSecret.trim()) {
      setResult({ success: false, message: "Please enter a webhook secret" });
      return;
    }

    startTransition(async () => {
      setResult(null);
      const response = await saveWebhookSecretAction(
        awsAccountId,
        webhookSecret,
        organizationId
      );

      if (response.success) {
        setResult({ success: true, message: response.message });
        setWebhookSecret("");
        // Refresh to update completion status
        router.refresh();
      } else {
        setResult({ success: false, message: response.error });
      }
    });
  };

  if (isConnected) {
    return (
      <div className="flex items-center gap-2">
        <Badge className="text-green-600 border-green-200 bg-green-50 dark:text-green-400 dark:border-green-800 dark:bg-green-950">
          <CheckCircle2Icon className="mr-1 h-3 w-3" />
          Connected
        </Badge>
        <span className="text-muted-foreground text-sm">
          Events are streaming to the dashboard
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            className="font-mono text-sm"
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder="Paste webhook secret from CLI"
            type="text"
            value={webhookSecret}
          />
          <Button
            disabled={isPending || !webhookSecret.trim()}
            onClick={handleSave}
          >
            {isPending ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              "Save"
            )}
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Run{" "}
          <code className="rounded bg-muted px-1 py-0.5">
            wraps platform connect
          </code>{" "}
          to generate a webhook secret.
        </p>
      </div>

      {result && (
        <div
          className={cn(
            "rounded-md border p-3",
            result.success
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
              : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          )}
        >
          <div className="flex items-center gap-2 text-sm">
            {result.success ? (
              <CheckCircle2Icon className="h-4 w-4" />
            ) : (
              <XCircleIcon className="h-4 w-4" />
            )}
            {result.message}
          </div>
        </div>
      )}
    </div>
  );
}

type DomainVerificationProps = {
  verifiedDomains: string[];
};

function DomainVerification({ verifiedDomains }: DomainVerificationProps) {
  if (verifiedDomains.length === 0) {
    return (
      <CliCommandGuide
        command="wraps email domains add -d yourdomain.com"
        description="No verified domains found. Add and verify a domain using the CLI:"
        hint="Follow the DNS instructions shown after running this command. Verification can take up to 48 hours."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {verifiedDomains.map((domain) => (
          <div className="flex items-center gap-2" key={domain}>
            <CheckCircle2Icon className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="font-mono text-sm">{domain}</span>
            <Badge
              className="text-xs text-green-600 border-green-200 bg-green-50 dark:text-green-400 dark:border-green-800 dark:bg-green-950"
              variant="outline"
            >
              Verified
            </Badge>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground text-xs">
        To add more domains, run{" "}
        <code className="rounded bg-muted px-1 py-0.5">
          wraps email domains add -d yourdomain.com
        </code>
      </p>
    </div>
  );
}

type RealInboxSectionProps = {
  organizationId: string;
  userEmail: string;
  sandboxStatus: boolean | null;
};

function RealInboxSection({
  organizationId,
  userEmail,
  sandboxStatus,
}: RealInboxSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCheckingStatus, startCheckStatus] = useTransition();
  const [isVerifying, startVerify] = useTransition();
  const [isSendingWelcome, startWelcomeSend] = useTransition();
  const [verified, setVerified] = useState<boolean | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [welcomeResult, setWelcomeResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const canSendDirectly = sandboxStatus === false || verified === true;

  const checkStatus = () => {
    startCheckStatus(async () => {
      const result = await getOwnEmailVerificationStatus(organizationId);
      if (result.success) {
        setVerified(result.verified);
      }
    });
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open && verified === null && sandboxStatus !== false) {
      checkStatus();
    }
  };

  const handleVerify = () => {
    startVerify(async () => {
      setVerifyMessage(null);
      const result = await verifyOwnEmailIdentity(organizationId);
      if (!result.success) {
        setVerifyMessage({ success: false, message: result.error });
        return;
      }
      if (result.alreadyVerified) {
        setVerified(true);
        return;
      }
      setVerifyMessage({
        success: true,
        message: `Verification email sent to ${result.email}. Click the link, then check again below.`,
      });
    });
  };

  const handleWelcomeSend = () => {
    startWelcomeSend(async () => {
      setWelcomeResult(null);
      const result = await sendWelcomeTestEmail(organizationId);
      if (result.success) {
        setWelcomeResult({
          success: true,
          message: `Check your inbox — sent to ${userEmail}.`,
        });
      } else {
        setWelcomeResult({ success: false, message: result.error });
      }
    });
  };

  return (
    <Collapsible onOpenChange={handleOpenChange} open={isOpen}>
      <CollapsibleTrigger asChild>
        <button
          className="flex items-center gap-1 text-primary text-sm underline underline-offset-4"
          type="button"
        >
          Send to my real inbox instead
          <ChevronDownIcon
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <div className="space-y-3 rounded-lg border p-3">
          {isCheckingStatus && (
            <p className="flex items-center gap-2 text-muted-foreground text-xs">
              <Loader2Icon className="h-3 w-3 animate-spin" />
              Checking verification status...
            </p>
          )}

          {!isCheckingStatus && canSendDirectly && (
            <>
              <p className="text-muted-foreground text-sm">
                Send a test email straight to {userEmail}.
              </p>
              <Button
                disabled={isSendingWelcome}
                onClick={handleWelcomeSend}
                size="sm"
              >
                {isSendingWelcome ? (
                  <>
                    <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Send myself a test email"
                )}
              </Button>
            </>
          )}

          {!(isCheckingStatus || canSendDirectly) && (
            <>
              <p className="text-muted-foreground text-sm">
                Your AWS account is in SES sandbox mode — verify {userEmail} to
                send test emails to your own inbox.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={isVerifying}
                  onClick={handleVerify}
                  size="sm"
                  variant="outline"
                >
                  {isVerifying ? (
                    <>
                      <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    `Verify ${userEmail}`
                  )}
                </Button>
                <Button onClick={checkStatus} size="sm" variant="ghost">
                  I&apos;ve clicked the link — check
                </Button>
              </div>
            </>
          )}

          {verifyMessage && (
            <ResultMessage
              message={verifyMessage.message}
              success={verifyMessage.success}
            />
          )}
          {welcomeResult && (
            <ResultMessage
              message={welcomeResult.message}
              success={welcomeResult.success}
            />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

type SendFirstEmailGuideProps = {
  orgSlug: string;
  organizationId: string;
  userEmail: string;
  sandboxStatus: boolean | null;
};

function SendFirstEmailGuide({
  orgSlug,
  organizationId,
  userEmail,
  sandboxStatus,
}: SendFirstEmailGuideProps) {
  const router = useRouter();
  const [isSendingSimulator, startSimulatorSend] = useTransition();
  const [simulatorResult, setSimulatorResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleSimulatorSend = () => {
    startSimulatorSend(async () => {
      setSimulatorResult(null);
      const result = await sendSimulatorTestEmail(organizationId);
      if (result.success) {
        setSimulatorResult({
          success: true,
          message: "It works — test email sent.",
        });
        router.refresh();
      } else {
        setSimulatorResult({ success: false, message: result.error });
      }
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Send a test email through your infrastructure right now — no sender
        verification required.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={isSendingSimulator} onClick={handleSimulatorSend}>
          {isSendingSimulator ? (
            <>
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            "Send a test email"
          )}
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/${orgSlug}/settings/sender-defaults`}>
            Configure Sender Defaults
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a
            href="https://wraps.dev/docs/quickstart/email"
            rel="noopener noreferrer"
            target="_blank"
          >
            View SDK Guide
          </a>
        </Button>
      </div>

      {simulatorResult && (
        <div className="space-y-1">
          <ResultMessage
            message={simulatorResult.message}
            success={simulatorResult.success}
          />
          {simulatorResult.success && (
            <Link
              className="text-primary text-xs underline underline-offset-4"
              href={`/${orgSlug}/events`}
            >
              View it in your event log
            </Link>
          )}
        </div>
      )}

      <RealInboxSection
        organizationId={organizationId}
        sandboxStatus={sandboxStatus}
        userEmail={userEmail}
      />
    </div>
  );
}

const DEPLOY_CLI_STEPS = [
  {
    label: "Install the CLI",
    command: "curl -fsSL https://get.wraps.dev | sh",
    altCommand: "npm install -g @wraps.dev/cli",
    time: "~1 min",
  },
  {
    label: "Authenticate",
    command: "wraps auth login",
    time: "~1 min",
  },
  {
    label: "Deploy infrastructure",
    command: "wraps email init",
    time: "~5 min",
  },
  {
    label: "Connect to platform",
    command: "wraps platform connect",
    time: "~2 min",
  },
];

const DEPLOY_PREREQUISITES = [
  {
    label: "AWS CLI installed",
    href: "https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html",
  },
  {
    label: "AWS credentials configured",
    href: "https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html",
    hint: true,
  },
];

function generateQuickCreateUrl(
  organizationId: string,
  webhookSecret: string
): string {
  const templateUrl =
    "https://wraps-assets.s3.amazonaws.com/cloudformation/wraps-email-infrastructure.yaml";

  const params = new URLSearchParams({
    templateURL: templateUrl,
    stackName: "wraps-email-infrastructure",
    param_EnableEventTracking: "true",
    param_EnableHistoryStorage: "true",
    param_HistoryRetentionDays: "90",
    param_EnableSMTP: "false",
    param_TLSRequired: "false",
    param_WrapsOrganizationId: organizationId,
    param_WrapsWebhookSecret: webhookSecret,
  });

  return `https://console.aws.amazon.com/cloudformation/home#/stacks/create/review?${params.toString()}`;
}

function generateSecureWebhookSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

function CliCommandGuide({
  description,
  command,
  hint,
}: {
  description: string;
  command: string;
  hint?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">{description}</p>
      <div className="relative">
        <pre className="overflow-x-auto rounded-lg bg-secondary p-3 pr-10">
          <code className="text-sm">{command}</code>
        </pre>
        <Button
          aria-label={copied ? "Copied" : "Copy command"}
          className="absolute top-1.5 right-1.5 h-7 w-7"
          onClick={handleCopy}
          size="icon"
          variant="ghost"
        >
          {copied ? (
            <CheckCircle2Icon className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <CopyIcon className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

function DeployConnectGuide({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [cfnDeployed, setCfnDeployed] = useState(false);
  const [roleArn, setRoleArn] = useState("");
  const [externalId, setExternalId] = useState("");
  const [isValidating, startValidation] = useTransition();
  const [validationError, setValidationError] = useState<string | null>(null);

  const [webhookSecret] = useState(() => generateSecureWebhookSecret());
  const quickCreateUrl = useMemo(
    () => generateQuickCreateUrl(organizationId, webhookSecret),
    [organizationId, webhookSecret]
  );

  const handleCopy = async (command: string, index: number) => {
    await navigator.clipboard.writeText(command);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCheckConnection = async () => {
    setIsChecking(true);
    setCheckFailed(false);
    try {
      const res = await fetch(`/api/${organizationId}/connections`);
      if (!res.ok) {
        setCheckFailed(true);
        return;
      }
      const data = await res.json();
      if (data.connections?.length > 0) {
        router.refresh();
      } else {
        setCheckFailed(true);
      }
    } catch {
      setCheckFailed(true);
    } finally {
      setIsChecking(false);
    }
  };

  const handleCloudFormationDeploy = () => {
    window.open(quickCreateUrl, "_blank", "noopener,noreferrer");
    setCfnDeployed(true);
  };

  const handleValidateConnection = () => {
    setValidationError(null);
    startValidation(async () => {
      try {
        const response = await fetch(
          `/api/${organizationId}/aws/validate-infrastructure`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roleArn, externalId, webhookSecret }),
          }
        );
        if (!response.ok) {
          const error = await response.json();
          setValidationError(
            error.error || "Failed to validate AWS connection"
          );
          return;
        }
        router.refresh();
      } catch {
        setValidationError("Failed to validate connection. Please try again.");
      }
    });
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="cli">
        <TabsList className="w-full">
          <TabsTrigger value="cli">
            <TerminalIcon className="h-4 w-4" />
            CLI Setup
          </TabsTrigger>
          <TabsTrigger value="cloudformation">
            <CloudIcon className="h-4 w-4" />
            CloudFormation
          </TabsTrigger>
        </TabsList>

        <TabsContent className="space-y-4 pt-3" value="cli">
          <div className="space-y-2 rounded-lg bg-muted/50 p-3">
            <h4 className="font-semibold text-xs">Prerequisites</h4>
            <div className="space-y-1">
              {DEPLOY_PREREQUISITES.map((prereq) => (
                <div key={prereq.label}>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      aria-label={prereq.label}
                      id={`prereq-${prereq.label}`}
                    />
                    <label
                      className="text-xs"
                      htmlFor={`prereq-${prereq.label}`}
                    >
                      {prereq.label}
                    </label>
                    <a
                      className="text-primary text-xs underline underline-offset-4"
                      href={prereq.href}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Guide
                    </a>
                  </div>
                  {"hint" in prereq && (
                    <p className="ml-6 mt-0.5 text-muted-foreground text-xs">
                      Run{" "}
                      <code className="rounded bg-muted px-1 py-0.5">
                        aws configure
                      </code>{" "}
                      or{" "}
                      <code className="rounded bg-muted px-1 py-0.5">
                        aws sso login
                      </code>
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {DEPLOY_CLI_STEPS.map((item, index) => (
              <div className="space-y-1" key={item.command}>
                <h3 className="flex items-center gap-2 font-semibold text-xs">
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px]">
                    {index + 1}
                  </span>
                  {item.label}
                  <span className="font-normal text-muted-foreground text-xs">
                    {item.time}
                  </span>
                </h3>
                <div className="relative">
                  <pre className="overflow-x-auto rounded-lg bg-secondary p-3 pr-10">
                    <code className="text-xs">{item.command}</code>
                  </pre>
                  <Button
                    aria-label={
                      copiedIndex === index
                        ? "Copied"
                        : `Copy ${item.label} command`
                    }
                    className="absolute top-1.5 right-1.5 h-7 w-7"
                    onClick={() => handleCopy(item.command, index)}
                    size="icon"
                    variant="ghost"
                  >
                    {copiedIndex === index ? (
                      <CheckCircle2Icon className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <CopyIcon className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button
            className="w-full"
            disabled={isChecking}
            onClick={handleCheckConnection}
            size="sm"
          >
            {isChecking ? (
              <>
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                <RefreshCwIcon className="mr-2 h-4 w-4" />
                I've finished — check connection
              </>
            )}
          </Button>
          {checkFailed && (
            <p className="text-center text-muted-foreground text-xs">
              No connection found. Make sure you've run all 4 commands, then try
              again.
            </p>
          )}
        </TabsContent>

        <TabsContent className="space-y-4 pt-3" value="cloudformation">
          <p className="text-muted-foreground text-sm">
            Don't have Node.js? Deploy from your browser using AWS
            CloudFormation instead.
          </p>

          {cfnDeployed ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-3 text-green-600 dark:text-green-400">
                <CheckCircle2Icon className="h-4 w-4" />
                <span className="font-medium text-sm">
                  CloudFormation deployment started
                </span>
              </div>

              <p className="text-muted-foreground text-sm">
                Once CloudFormation finishes, go to the <strong>Outputs</strong>{" "}
                tab and copy these two values:
              </p>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="cfn-role-arn">
                    Console Role ARN
                    <span className="ml-1.5 text-muted-foreground font-normal">
                      — output key: ConsoleRoleArn
                    </span>
                  </Label>
                  <Input
                    id="cfn-role-arn"
                    onChange={(e) => setRoleArn(e.target.value)}
                    placeholder="arn:aws:iam::123456789012:role/wraps-console-access-role"
                    value={roleArn}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="cfn-external-id">
                    External ID
                    <span className="ml-1.5 text-muted-foreground font-normal">
                      — output key: ExternalId
                    </span>
                  </Label>
                  <Input
                    id="cfn-external-id"
                    onChange={(e) => setExternalId(e.target.value)}
                    placeholder="arn:aws:cloudformation:us-east-1:123456789012:stack/wraps-email-infrastructure/..."
                    value={externalId}
                  />
                  <p className="text-muted-foreground text-[11px]">
                    This will look like a CloudFormation ARN — that's expected.
                  </p>
                </div>
                {validationError && (
                  <ResultMessage message={validationError} success={false} />
                )}
                <Button
                  className="w-full"
                  disabled={!(roleArn && externalId) || isValidating}
                  onClick={handleValidateConnection}
                  size="sm"
                >
                  {isValidating ? (
                    <>
                      <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    "Validate Connection"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              className="w-full"
              onClick={handleCloudFormationDeploy}
              size="sm"
            >
              <ExternalLinkIcon className="mr-2 h-4 w-4" />
              Deploy to AWS Console
            </Button>
          )}
        </TabsContent>
      </Tabs>

      <div className="rounded-lg border border-dashed p-3">
        <div className="flex items-start gap-2">
          <CalendarIcon className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-muted-foreground text-xs">
              Need help? Free 15-minute walkthrough.
            </p>
            <Button asChild className="mt-1.5" size="sm" variant="outline">
              <a
                href={CAL_BOOKING_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                Book a Setup Call
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GettingStartedDashboard({
  orgSlug,
  organizationId,
  organizationName,
  setupStatus,
  completionPercent,
  awsAccount,
  userEmail,
}: GettingStartedDashboardProps) {
  const router = useRouter();
  const {
    hasAwsAccount,
    hasPlatformConnection,
    hasVerifiedDomain,
    hasSentEmail,
    verifiedDomains,
    awsRegion,
  } = setupStatus;

  return (
    <>
      {/* Page Header */}
      <div className="px-4 lg:px-6">
        <div className="flex flex-col gap-2">
          <h1 className="font-bold text-2xl tracking-tight">
            Set Up {organizationName}
          </h1>
          <p className="text-muted-foreground">
            Connect your AWS account and verify your domain to start sending.
          </p>
        </div>
      </div>

      {/* Next Step */}
      <div className="px-4 lg:px-6">
        <NextStepCard
          organizationId={organizationId}
          orgSlug={orgSlug}
          setupStatus={setupStatus}
        />
      </div>

      {/* Main Content */}
      <div className="@container/main px-4 lg:px-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Setup Checklist */}
          <div className="lg:col-span-2 space-y-6">
            {/* Progress Card */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Setup Progress</CardTitle>
                    <CardDescription>
                      {completionPercent === 100
                        ? "All set! You're ready to send emails."
                        : `${completionPercent}% complete`}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={() => router.refresh()}
                      size="icon"
                      variant="ghost"
                    >
                      <RefreshCwIcon className="h-4 w-4" />
                      <span className="sr-only">Refresh status</span>
                    </Button>
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                      <span className="font-bold text-primary text-lg">
                        {completionPercent}%
                      </span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Progress className="h-2" value={completionPercent} />
              </CardContent>
            </Card>

            {/* Checklist */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Setup Checklist</CardTitle>
                <CardDescription>
                  Deploy infrastructure and connect your AWS account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ExpandableChecklistItem
                  defaultOpen={!hasAwsAccount}
                  description="Set up AWS SES, DynamoDB, and event tracking in your account"
                  icon={<CloudIcon className="h-5 w-5" />}
                  isComplete={hasAwsAccount}
                  title="Deploy email infrastructure"
                >
                  {awsAccount ? (
                    <ScanFeaturesAction
                      awsAccountId={awsAccount.id}
                      features={awsAccount.features}
                      organizationId={organizationId}
                    />
                  ) : (
                    <DeployConnectGuide organizationId={organizationId} />
                  )}
                </ExpandableChecklistItem>

                {/* Connect to platform */}
                <ExpandableChecklistItem
                  description="Stream events and grant dashboard access"
                  icon={<LinkIcon className="h-5 w-5" />}
                  isComplete={hasPlatformConnection}
                  title="Connect to platform"
                >
                  {awsAccount ? (
                    <WebhookSecretForm
                      awsAccountId={awsAccount.id}
                      isConnected={hasPlatformConnection}
                      organizationId={organizationId}
                    />
                  ) : (
                    <CliCommandGuide
                      command="wraps platform connect"
                      description="After deploying infrastructure, run this command to connect your AWS account to the Wraps dashboard:"
                      hint="This grants the dashboard read-only access and streams email events in real time."
                    />
                  )}
                </ExpandableChecklistItem>

                {/* Verify domain */}
                <ExpandableChecklistItem
                  description="Configure DNS records to send emails from your domain"
                  icon={<GlobeIcon className="h-5 w-5" />}
                  isComplete={hasVerifiedDomain}
                  title="Verify your domain"
                >
                  <div className="space-y-3">
                    {!hasVerifiedDomain && hasAwsAccount && (
                      <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
                        <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />
                        <p className="text-sm">
                          DNS changes can take up to 48 hours to propagate.
                          Expand &quot;Deploy email infrastructure&quot; above
                          and click &quot;Scan Features&quot; to check again.
                        </p>
                      </div>
                    )}
                    <DomainVerification verifiedDomains={verifiedDomains} />
                  </div>
                </ExpandableChecklistItem>

                {/* Send first email */}
                <ExpandableChecklistItem
                  description="Configure sender defaults and use the SDK to send a test email"
                  icon={<MailIcon className="h-5 w-5" />}
                  isComplete={hasSentEmail}
                  title="Send your first email"
                >
                  <div className="space-y-3">
                    {hasVerifiedDomain &&
                      setupStatus.sandboxStatus === true &&
                      !hasSentEmail && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                          <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                          <div className="space-y-2 text-sm">
                            <p>
                              AWS starts every new account in SES sandbox mode,
                              so you can only send to verified addresses.{" "}
                              <a
                                className="font-medium underline underline-offset-4"
                                href="https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html"
                                rel="noopener noreferrer"
                                target="_blank"
                              >
                                Request production access
                              </a>{" "}
                              (usually approved in ~24h) to email anyone.
                            </p>
                            <p className="font-medium">
                              Meanwhile, send yourself a test below — it works
                              in sandbox right now.
                            </p>
                          </div>
                        </div>
                      )}
                    <SendFirstEmailGuide
                      organizationId={organizationId}
                      orgSlug={orgSlug}
                      sandboxStatus={setupStatus.sandboxStatus}
                      userEmail={userEmail}
                    />
                  </div>
                </ExpandableChecklistItem>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Status & Quick Start */}
          <div className="space-y-6">
            {/* Integration Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Integration Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ServerIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">AWS Account</span>
                  </div>
                  {hasAwsAccount ? (
                    <Badge
                      className="text-green-600 border-green-200 bg-green-50 dark:text-green-400 dark:border-green-800 dark:bg-green-950"
                      variant="outline"
                    >
                      Connected
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Not connected</Badge>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LinkIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Platform Events</span>
                  </div>
                  {hasPlatformConnection ? (
                    <Badge
                      className="text-green-600 border-green-200 bg-green-50 dark:text-green-400 dark:border-green-800 dark:bg-green-950"
                      variant="outline"
                    >
                      Streaming
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Not configured</Badge>
                  )}
                </div>

                {awsRegion && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GlobeIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Region</span>
                    </div>
                    <span className="text-sm font-mono">{awsRegion}</span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MailIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Verified Domains</span>
                  </div>
                  <span className="text-sm">{verifiedDomains.length}</span>
                </div>

                {verifiedDomains.length > 0 && (
                  <div className="border-t pt-3">
                    <p className="text-xs text-muted-foreground mb-2">
                      Domains
                    </p>
                    <div className="space-y-1">
                      {verifiedDomains.map((domain) => (
                        <div
                          className="flex items-center gap-2 text-sm"
                          key={domain}
                        >
                          <CheckCircle2Icon className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                          <span className="font-mono text-xs">{domain}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!hasAwsAccount && (
                  <p className="text-muted-foreground text-xs mt-2">
                    Complete the &quot;Deploy email infrastructure&quot; step in
                    the checklist to connect your AWS account.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Quick Start Code */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CodeIcon className="h-5 w-5" />
                  Quick Start
                </CardTitle>
                <CardDescription>
                  Install the SDK and send your first email
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      1. Install
                    </p>
                    <CopyButton value={INSTALL_CODE} />
                  </div>
                  <pre className="rounded-lg bg-secondary p-3 overflow-x-auto">
                    <code className="text-xs">{INSTALL_CODE}</code>
                  </pre>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      2. Send an email
                    </p>
                    <CopyButton value={SDK_CODE} />
                  </div>
                  <pre className="rounded-lg bg-secondary p-3 overflow-x-auto max-h-48">
                    <code className="text-xs whitespace-pre">{SDK_CODE}</code>
                  </pre>
                </div>

                <Button asChild className="w-full" variant="outline">
                  <a
                    href="https://wraps.dev/docs/quickstart/email"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <BookOpenIcon className="mr-2 h-4 w-4" />
                    View Full Documentation
                  </a>
                </Button>
              </CardContent>
            </Card>

            {/* Help Card */}
            <HelpCard />
          </div>
        </div>
      </div>
    </>
  );
}
