"use client";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Label } from "@wraps/ui/components/ui/label";
import {
  BotIcon,
  CalendarIcon,
  CheckCircle2Icon,
  CloudIcon,
  CopyIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  TerminalIcon,
} from "lucide-react";
import posthog from "posthog-js";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { SelfhostConnectInstructions } from "@/components/selfhost-connect-instructions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AgentPromptOption } from "./agent-prompt-option";

type CliDeployConnectStepProps = {
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onConnected?: () => void;
  organizationId: string;
  orgName?: string;
  orgSlug?: string;
  /**
   * True on self-hosted deployments. Threaded down from page.tsx, which reads
   * it from the onboarding-status payload — the license key is server-only.
   */
  selfHosted: boolean;
};

type DeployMethod = "cli" | "agent" | "cloudformation";

const CLI_STEPS = [
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

const PREREQUISITES = [
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

const CAL_BOOKING_URL = "https://cal.com/wraps/get-started-with-wraps";

/**
 * Prompt handed to the user's coding agent. Mirrors the CLI path — every command
 * here is one of CLI_STEPS — but calls out the interactive points an agent would
 * otherwise stall on (device code, region/preset prompts, org selection).
 */
function buildAgentPrompt(orgName?: string, selfHosted = false): string {
  const orgLine = orgName
    ? `   If it asks which organization to connect, choose "${orgName}".`
    : "   If it asks which organization to connect, ask me which one to pick.";

  return `Deploy Wraps email infrastructure into my AWS account and connect it to my Wraps dashboard.

1. Check my AWS credentials: aws sts get-caller-identity
   If that fails, help me set up credentials before continuing — AWS SSO, access keys, environment variables, and AWS_PROFILE all work.
2. Install the CLI: npm install -g @wraps.dev/cli
   (or: curl -fsSL https://get.wraps.dev | sh)
3. Sign in: ${selfHosted ? "wraps selfhost login" : "wraps auth login"}
   This is a device-code flow — it prints a code like XXXX-XXXX and tries to open a browser. Show me the code and wait for me to confirm I approved it before moving on.
4. Deploy the infrastructure: wraps email init
   It prompts for an AWS region and a preset (starter / production / enterprise), then shows estimated monthly AWS cost. Show me those and let me choose — don't accept the deploy on my behalf.
5. Connect the deployment to my dashboard: ${selfHosted ? "wraps selfhost connect" : "wraps platform connect"}
${orgLine}
6. Confirm it worked: wraps email status --json
   Report the region, the SES configuration set, and whether the account is still in the SES sandbox (sandbox means I can only send to verified addresses until AWS grants production access).

When you're done, tell me — I'll click "I've finished — check connection" in the Wraps onboarding tab.

Full Wraps docs (agent-readable): https://wraps.dev/llms-full.txt`;
}

/**
 * Generate a cryptographically secure webhook secret
 */
function generateSecureWebhookSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generate CloudFormation Quick Create URL for the hosted platform. Only called
 * when `selfHosted` is false — the S3-hosted template grants assume-role to the
 * Wraps platform account and posts events to api.wraps.dev, neither of which a
 * self-hosted control plane can use.
 */
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

export function CliDeployConnectStep({
  onBack,
  onSkip,
  onConnected,
  organizationId,
  orgName,
  selfHosted,
}: CliDeployConnectStepProps) {
  const queryClient = useQueryClient();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [cfnDeployed, setCfnDeployed] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<DeployMethod | null>(
    null
  );
  // Both deduped per mount: a user copying three CLI commands started one
  // deployment, and a user toggling between two cards chose each one once.
  const selectedMethods = useRef<Set<DeployMethod>>(new Set());
  const startedMethods = useRef<Set<DeployMethod>>(new Set());

  // The chosen path's panel renders after the whole card grid, so on a phone it
  // opens a screen or two below the button that was tapped. Focusing it scrolls
  // it into view and announces it; the button's pressed state alone does not.
  const panelIdBase = useId();
  const panelIdFor = (method: DeployMethod) => `${panelIdBase}-${method}`;
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (selectedMethod === null) {
      return;
    }
    panelRef.current?.focus();
    panelRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [selectedMethod]);

  const agentPrompt = useMemo(
    () => buildAgentPrompt(orgName, selfHosted),
    [orgName, selfHosted]
  );

  // Generate a cryptographically secure webhook secret once on mount
  const [webhookSecret] = useState(() => generateSecureWebhookSecret());

  const quickCreateUrl = useMemo(
    () =>
      selfHosted ? null : generateQuickCreateUrl(organizationId, webhookSecret),
    [organizationId, selfHosted, webhookSecret]
  );

  // Manual connection check
  const [isChecking, setIsChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [validationError, setValidationError] = useState<{
    error: string;
    code: string;
    remediation: string;
  } | null>(null);

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
        toast.success("Connection detected!");
        posthog.capture("onboarding_cli_connection_detected", {
          step: 4,
          step_name: "Deploy & Connect",
          organization_id: organizationId,
        });
        posthog.capture("onboarding_step_completed", {
          step: 4,
          step_name: "Deploy & Connect",
          organization_id: organizationId,
          method: "cli",
        });
        queryClient.invalidateQueries({
          queryKey: ["onboarding-status", organizationId],
        });
        if (onConnected) {
          onConnected();
        }
      } else {
        setCheckFailed(true);
        toast.error(
          "No connection found yet. Make sure you've run all 4 commands."
        );
      }
    } catch {
      setCheckFailed(true);
      toast.error("Failed to check connection. Please try again.");
    } finally {
      setIsChecking(false);
    }
  };

  // CloudFormation validation mutation
  const validateAwsMutation = useMutation({
    mutationFn: async (data: { roleArn: string; externalId: string }) => {
      const response = await fetch(
        `/api/${organizationId}/aws/validate-infrastructure`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, webhookSecret }),
        }
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const err = new Error(
          body.error || "Failed to validate AWS connection"
        );
        (err as Error & { details?: unknown }).details = {
          code: body.code ?? "UNKNOWN",
          remediation: body.remediation ?? "",
        };
        throw err;
      }
      return response.json();
    },
    onMutate: () => setValidationError(null),
    onSuccess: () => {
      setValidationError(null);
      toast.success("Infrastructure connected successfully!");
      queryClient.invalidateQueries({
        queryKey: ["onboarding-status", organizationId],
      });
      posthog.capture("onboarding_step_completed", {
        step: 4,
        step_name: "Deploy & Connect",
        organization_id: organizationId,
        method: "cloudformation",
      });
      if (onConnected) {
        onConnected();
      }
    },
    onError: (
      error: Error & { details?: { code?: string; remediation?: string } }
    ) => {
      const code = error.details?.code ?? "UNKNOWN";
      const remediation = error.details?.remediation ?? "";
      setValidationError({ error: error.message, code, remediation });
      toast.error(error.message || "Failed to validate connection");
      posthog.capture("onboarding_connection_failed", {
        step: 4,
        step_name: "Deploy & Connect",
        organization_id: organizationId,
        method: "cloudformation",
        error_code: code,
      });
    },
  });

  const form = useForm({
    defaultValues: {
      roleArn: "",
      externalId: "",
    },
    onSubmit: async ({ value }) => {
      validateAwsMutation.mutate(value);
    },
    validators: {
      onSubmit: z.object({
        roleArn: z
          .string()
          .regex(/^arn:aws:iam::\d{12}:role\/.*$/, "Invalid IAM Role ARN"),
        externalId: z.string().min(1, "External ID is required"),
      }),
    },
  });

  const handleCopy = async (command: string, index: number) => {
    try {
      await navigator.clipboard.writeText(command);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — nothing to report.
      return;
    }
    setCopiedIndex(index);
    toast.success("Copied to clipboard");
    posthog.capture("onboarding_cli_command_copied", {
      step: 4,
      step_name: "Deploy & Connect",
      organization_id: organizationId,
      command,
    });
    trackDeploymentStarted("cli");
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleBack = () => {
    posthog.capture("onboarding_step_back", {
      step: 4,
      step_name: "Deploy & Connect",
      organization_id: organizationId,
    });
    onBack();
  };

  const handleSkip = () => {
    posthog.capture("onboarding_skipped", {
      step: 4,
      step_name: "Deploy & Connect",
      organization_id: organizationId,
    });
    onSkip();
  };

  // Fires once per method per mount, at the first action that actually starts a
  // deployment on that path. Before this change only CloudFormation emitted it,
  // so a shift toward the CLI would have read as a drop.
  const trackDeploymentStarted = (method: DeployMethod) => {
    if (startedMethods.current.has(method)) {
      return;
    }
    startedMethods.current.add(method);
    posthog.capture("onboarding_deployment_started", {
      step: 4,
      step_name: "Deploy & Connect",
      organization_id: organizationId,
      method,
      layout: "three_path",
    });
  };

  // Deduped per method per mount, the same way trackDeploymentStarted is. A user
  // who clicks CLI, reads the prerequisites, clicks Browser, then clicks CLI
  // again has chosen two methods, not three — and this event is the denominator
  // the whole chunk exists to rebuild.
  const handleMethodSelected = (method: DeployMethod) => {
    setSelectedMethod(method);
    if (selectedMethods.current.has(method)) {
      return;
    }
    selectedMethods.current.add(method);
    posthog.capture("onboarding_deployment_method_selected", {
      step: 4,
      step_name: "Deploy & Connect",
      organization_id: organizationId,
      method,
      layout: "three_path",
    });
  };

  const handleAgentPromptCopied = () => {
    toast.success("Prompt copied — paste it into your agent");
    posthog.capture("onboarding_agent_prompt_copied", {
      step: 4,
      step_name: "Deploy & Connect",
      organization_id: organizationId,
    });
    trackDeploymentStarted("agent");
  };

  const handleCloudFormationDeploy = () => {
    if (!quickCreateUrl) {
      return;
    }
    trackDeploymentStarted("cloudformation");
    window.open(quickCreateUrl, "_blank", "noopener,noreferrer");
    setCfnDeployed(true);
  };

  // Self-hosted deployments run a different CLI flow: `wraps selfhost login` and
  // `wraps selfhost connect` point at the user's own control plane, while the
  // hosted commands would connect their AWS account to the Wraps platform.
  const cliSteps = selfHosted
    ? CLI_STEPS.map((step) => {
        if (step.command === "wraps auth login") {
          return { ...step, command: "wraps selfhost login" };
        }
        if (step.command === "wraps platform connect") {
          return {
            ...step,
            label: "Connect to your instance",
            command: "wraps selfhost connect",
          };
        }
        return step;
      })
    : CLI_STEPS;

  // Shared by the CLI and agent paths — both finish with the connect command
  const checkConnectionBlock = (
    <div className="space-y-3">
      <Button
        className="w-full"
        loading={isChecking}
        onClick={handleCheckConnection}
      >
        <RefreshCwIcon className="mr-2 h-4 w-4" />
        I&apos;ve finished — check connection
      </Button>
      {checkFailed && (
        <p className="text-center text-muted-foreground text-sm">
          No connection found. Make sure the deploy and{" "}
          <code className="rounded bg-muted px-1 py-0.5">
            {selfHosted ? "wraps selfhost connect" : "wraps platform connect"}
          </code>{" "}
          both finished, then try again.
        </p>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <CloudIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Deploy & Connect</CardTitle>
            <CardDescription>
              Deploy infrastructure to your AWS account and connect it to the
              platform
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {cfnDeployed ? null : (
          <div
            className={
              selfHosted
                ? "grid gap-4 md:grid-cols-2"
                : "grid gap-4 md:grid-cols-3"
            }
          >
            <Card className="flex flex-col items-center space-y-3 p-6 text-center">
              <TerminalIcon className="h-10 w-10 text-primary" />
              <h3 className="flex items-center gap-2 font-semibold text-lg">
                CLI
                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
                  Recommended
                </span>
              </h3>
              <p className="text-muted-foreground text-sm">
                Four commands in your terminal. Ends with a test email, so you
                know sending works before you leave.
              </p>
              <Button
                aria-controls={panelIdFor("cli")}
                aria-expanded={selectedMethod === "cli"}
                aria-pressed={selectedMethod === "cli"}
                className="mt-auto w-full"
                onClick={() => handleMethodSelected("cli")}
                size="lg"
                variant={selectedMethod === "cli" ? "default" : "outline"}
              >
                Use the CLI
              </Button>
            </Card>

            <Card className="flex flex-col items-center space-y-3 p-6 text-center">
              <BotIcon className="h-10 w-10 text-primary" />
              <h3 className="font-semibold text-lg">AI agent</h3>
              <p className="text-muted-foreground text-sm">
                The same four commands, driven by your coding agent. It still
                needs AWS credentials on your machine and stops for the sign-in
                code and the region choice.
              </p>
              <Button
                aria-controls={panelIdFor("agent")}
                aria-expanded={selectedMethod === "agent"}
                aria-pressed={selectedMethod === "agent"}
                className="mt-auto w-full"
                onClick={() => handleMethodSelected("agent")}
                size="lg"
                variant={selectedMethod === "agent" ? "default" : "outline"}
              >
                Copy the agent prompt
              </Button>
            </Card>

            {selfHosted ? null : (
              <Card className="flex flex-col items-center space-y-3 p-6 text-center">
                <CloudIcon className="h-10 w-10 text-primary" />
                <h3 className="font-semibold text-lg">Browser</h3>
                <p className="text-muted-foreground text-sm">
                  Deploy from your browser with CloudFormation — no Node.js and
                  no local AWS credentials. Infrastructure only: you still
                  verify your sending domain and request production access
                  separately.
                </p>
                <Button
                  aria-controls={panelIdFor("cloudformation")}
                  aria-expanded={selectedMethod === "cloudformation"}
                  aria-pressed={selectedMethod === "cloudformation"}
                  className="mt-auto w-full"
                  onClick={() => handleMethodSelected("cloudformation")}
                  size="lg"
                  variant={
                    selectedMethod === "cloudformation" ? "default" : "outline"
                  }
                >
                  Use the browser
                </Button>
              </Card>
            )}
          </div>
        )}

        {selfHosted && <SelfhostConnectInstructions />}

        {!cfnDeployed && selectedMethod === "cli" && (
          <section
            aria-label="CLI deployment steps"
            className="space-y-6"
            id={panelIdFor("cli")}
            ref={panelRef}
            tabIndex={-1}
          >
            <p className="text-muted-foreground text-sm">
              Needs Node.js and AWS credentials on this machine. No local
              credentials?{" "}
              {selfHosted ? (
                <>
                  Configure them on the machine running the CLI, then{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    wraps aws doctor
                  </code>{" "}
                  to verify.
                </>
              ) : (
                "Use the browser path instead."
              )}
            </p>

            {/* Prerequisites */}
            <div className="space-y-2 rounded-lg bg-muted/50 p-4">
              <h4 className="font-semibold text-sm">Prerequisites</h4>
              <div className="space-y-1.5">
                {PREREQUISITES.map((prereq) => (
                  <div key={prereq.label}>
                    <label className="flex items-center gap-2">
                      <input
                        className="h-4 w-4 rounded border-muted-foreground/25"
                        type="checkbox"
                      />
                      <span className="text-sm">{prereq.label}</span>
                      <a
                        className="text-primary text-xs underline underline-offset-4"
                        href={prereq.href}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        Guide
                      </a>
                    </label>
                    {"hint" in prereq && (
                      <p className="ml-6 mt-0.5 text-muted-foreground text-xs">
                        Any of these work:{" "}
                        <code className="rounded bg-muted px-1 py-0.5">
                          aws configure sso
                        </code>{" "}
                        /{" "}
                        <code className="rounded bg-muted px-1 py-0.5">
                          aws sso login
                        </code>
                        ,{" "}
                        <code className="rounded bg-muted px-1 py-0.5">
                          aws configure
                        </code>
                        ,{" "}
                        <code className="rounded bg-muted px-1 py-0.5">
                          AWS_ACCESS_KEY_ID
                        </code>{" "}
                        +{" "}
                        <code className="rounded bg-muted px-1 py-0.5">
                          AWS_SECRET_ACCESS_KEY
                        </code>
                        , or{" "}
                        <code className="rounded bg-muted px-1 py-0.5">
                          AWS_PROFILE
                        </code>
                        . Then{" "}
                        <code className="rounded bg-muted px-1 py-0.5">
                          wraps aws doctor
                        </code>{" "}
                        to verify.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* CLI Commands */}
            <div className="space-y-3">
              {cliSteps.map((item, index) => (
                <div className="space-y-1.5" key={item.command}>
                  <h3 className="flex items-center gap-2 font-semibold text-sm">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
                      {index + 1}
                    </span>
                    {item.label}
                    <span className="font-normal text-muted-foreground text-xs">
                      {item.time}
                    </span>
                  </h3>
                  <div className="relative">
                    <pre className="overflow-x-auto rounded-lg bg-secondary p-4 pr-12">
                      <code className="text-sm">{item.command}</code>
                    </pre>
                    <Button
                      aria-label={
                        copiedIndex === index
                          ? "Copied"
                          : `Copy ${item.label} command`
                      }
                      className="absolute top-2 right-2"
                      onClick={() => handleCopy(item.command, index)}
                      size="icon"
                      variant="ghost"
                    >
                      {copiedIndex === index ? (
                        <CheckCircle2Icon className="size-4 text-green-500" />
                      ) : (
                        <CopyIcon className="size-4" />
                      )}
                    </Button>
                  </div>
                  {"altCommand" in item && item.altCommand && (
                    <p className="text-muted-foreground text-xs">
                      Or via npm:{" "}
                      <button
                        className="font-mono underline underline-offset-2"
                        onClick={() =>
                          handleCopy(item.altCommand as string, index)
                        }
                        type="button"
                      >
                        {item.altCommand}
                      </button>
                    </p>
                  )}
                </div>
              ))}
            </div>

            {checkConnectionBlock}
          </section>
        )}

        {!cfnDeployed && selectedMethod === "agent" && (
          <section
            aria-label="AI agent deployment steps"
            className="space-y-6"
            id={panelIdFor("agent")}
            ref={panelRef}
            tabIndex={-1}
          >
            <p className="text-muted-foreground text-sm">
              Same CLI path as above, driven by your coding agent. It still
              needs AWS credentials on your machine, and it will stop for the
              sign-in code and the region/preset choices.
            </p>

            <AgentPromptOption
              onCopyPrompt={handleAgentPromptCopied}
              prompt={agentPrompt}
            />

            {checkConnectionBlock}
          </section>
        )}

        {selectedMethod === "cloudformation" &&
          quickCreateUrl !== null &&
          (cfnDeployed ? (
            <section
              aria-label="Browser deployment steps"
              className="space-y-6"
              id={panelIdFor("cloudformation")}
              ref={panelRef}
              tabIndex={-1}
            >
              <div className="flex items-center gap-2 rounded-lg bg-green-500/10 p-3 text-green-600 dark:text-green-400">
                <CheckCircle2Icon className="h-5 w-5" />
                <span className="font-medium text-sm">
                  CloudFormation deployment started
                </span>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-sm">
                  Waiting for deployment to complete...
                </h3>
                <p className="text-muted-foreground text-sm">
                  Once CloudFormation finishes, copy the{" "}
                  <strong>ConsoleRoleArn</strong> and{" "}
                  <strong>ExternalId</strong> from the Outputs tab and paste
                  them below.
                </p>
              </div>

              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  form.handleSubmit();
                }}
              >
                <form.Field name="roleArn">
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor={field.name}>Console Role ARN</Label>
                      <Input
                        id={field.name}
                        name={field.name}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="arn:aws:iam::123456789012:role/wraps-console-access-role"
                        value={field.state.value}
                      />
                      {field.state.meta.errors.map((error) => (
                        <p
                          className="text-destructive text-sm"
                          key={error?.message}
                        >
                          {error?.message}
                        </p>
                      ))}
                    </div>
                  )}
                </form.Field>

                <form.Field name="externalId">
                  {(field) => (
                    <div className="space-y-2">
                      <Label htmlFor={field.name}>External ID</Label>
                      <Input
                        id={field.name}
                        name={field.name}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="wraps-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        value={field.state.value}
                      />
                      {field.state.meta.errors.map((error) => (
                        <p
                          className="text-destructive text-sm"
                          key={error?.message}
                        >
                          {error?.message}
                        </p>
                      ))}
                    </div>
                  )}
                </form.Field>

                {validationError && (
                  <div
                    className="space-y-1 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm"
                    role="alert"
                  >
                    <p className="font-medium text-destructive">
                      {validationError.error}
                    </p>
                    {validationError.remediation && (
                      <p className="text-muted-foreground">
                        {validationError.remediation}
                      </p>
                    )}
                    <a
                      className="inline-block text-primary text-xs underline underline-offset-4"
                      href={CAL_BOOKING_URL}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Book a setup call
                    </a>
                  </div>
                )}

                <form.Subscribe>
                  {(state) => (
                    <Button
                      className="w-full"
                      disabled={
                        !state.canSubmit || validateAwsMutation.isPending
                      }
                      loading={
                        state.isSubmitting || validateAwsMutation.isPending
                      }
                      type="submit"
                    >
                      Validate Connection
                    </Button>
                  )}
                </form.Subscribe>
              </form>

              <Button asChild className="w-full" variant="outline">
                <a
                  href={quickCreateUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <CloudIcon className="mr-2 h-4 w-4" />
                  Open AWS Console
                </a>
              </Button>
            </section>
          ) : (
            <section
              aria-label="Browser deployment steps"
              className="space-y-5"
              id={panelIdFor("cloudformation")}
              ref={panelRef}
              tabIndex={-1}
            >
              {/* What Gets Deployed */}
              <div className="space-y-2 rounded-lg bg-muted/50 p-4">
                <h4 className="font-semibold text-sm">What gets deployed?</h4>
                <ul className="list-inside list-disc space-y-1 text-muted-foreground text-sm">
                  <li>Vercel OIDC provider for secure authentication</li>
                  <li>IAM role with minimal required permissions</li>
                  <li>SES configuration set with open/click tracking</li>
                  <li>EventBridge for real-time event routing</li>
                  <li>DynamoDB table for email history</li>
                  <li>Lambda function for event processing</li>
                </ul>
              </div>

              <p className="text-muted-foreground text-sm">
                If this AWS account already has SES resources with these names,
                the stack can fail partway and leave resources behind. The CLI
                path reports conflicts before it deploys.
              </p>

              <Button className="w-full" onClick={handleCloudFormationDeploy}>
                <ExternalLinkIcon className="mr-2 h-4 w-4" />
                Deploy with CloudFormation
              </Button>
            </section>
          ))}

        {/* Need help? */}
        <div className="rounded-lg border border-dashed p-4">
          <div className="flex items-start gap-3">
            <CalendarIcon className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <h4 className="font-medium text-sm">Need help getting set up?</h4>
              <p className="mt-1 text-muted-foreground text-sm">
                Free 15-minute walkthrough — we&apos;ll help you deploy and
                connect.
              </p>
              <Button asChild className="mt-2" size="sm" variant="outline">
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
      </CardContent>

      <CardFooter className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button onClick={handleBack} variant="outline">
            Back
          </Button>
          <Button onClick={handleSkip} variant="ghost">
            Skip
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
