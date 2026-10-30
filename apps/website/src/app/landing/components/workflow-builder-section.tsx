"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import {
  ArrowDown,
  ChevronRight,
  Clock,
  GitBranch,
  Hourglass,
  Mail,
  MessageSquare,
  Sparkles,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type StepType = "trigger" | "wait" | "wait_event" | "condition" | "action";

type WorkflowStep = {
  id: string;
  type: StepType;
  label: string;
  description: string;
  icon: typeof Zap;
  config?: string;
  // For condition steps - the branch outcomes
  yesBranch?: {
    label: string;
    description: string;
    icon: typeof Zap;
    config?: string;
  };
  noBranch?: {
    label: string;
    description: string;
    icon: typeof Zap;
    config?: string;
  };
};

type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
};

const workflowTemplates: WorkflowTemplate[] = [
  {
    id: "welcome",
    name: "Welcome Series",
    description: "Onboard new users with a warm welcome sequence",
    steps: [
      {
        id: "trigger",
        type: "trigger",
        label: "User Signs Up",
        description: "Triggered when a new user creates an account",
        icon: Zap,
        config: "user.signed_up",
      },
      {
        id: "action-1",
        type: "action",
        label: "Send Welcome Email",
        description: "Introduce your product and set expectations",
        icon: Mail,
        config: "welcome-email",
      },
      {
        id: "wait-event-1",
        type: "wait_event",
        label: "Wait for Email Open",
        description: "Continue only after they engage with the welcome email",
        icon: Hourglass,
        config: "email.opened | timeout: 2 days",
      },
      {
        id: "action-2",
        type: "action",
        label: "Send Getting Started Tips",
        description: "Help them discover key features",
        icon: Mail,
        config: "getting-started",
      },
      {
        id: "wait-1",
        type: "wait",
        label: "Wait 3 Days",
        description: "Let them build habits",
        icon: Clock,
        config: "3 days",
      },
      {
        id: "condition",
        type: "condition",
        label: "Has Completed Setup?",
        description:
          "Branch the workflow based on whether they finished onboarding",
        icon: GitBranch,
        config: "setup_completed == true",
        yesBranch: {
          label: "Send Success Story",
          description: "Share how others succeed with your product",
          icon: Mail,
          config: "success-story",
        },
        noBranch: {
          label: "Send Setup Reminder",
          description: "Nudge them to complete their setup",
          icon: Mail,
          config: "setup-reminder",
        },
      },
    ],
  },
  {
    id: "trial",
    name: "Trial Conversion",
    description: "Convert trial users into paying customers",
    steps: [
      {
        id: "trigger",
        type: "trigger",
        label: "Trial Started",
        description: "Triggered when a user starts their free trial",
        icon: Zap,
        config: "trial.started",
      },
      {
        id: "action-1",
        type: "action",
        label: "Send Quick Start Guide",
        description: "Help them get value quickly",
        icon: Mail,
        config: "quick-start",
      },
      {
        id: "wait-1",
        type: "wait",
        label: "Wait 3 Days",
        description: "Give them time to explore",
        icon: Clock,
        config: "3 days",
      },
      {
        id: "action-2",
        type: "action",
        label: "Send Feature Highlight",
        description: "Show them a key feature they haven't tried",
        icon: Mail,
        config: "feature-highlight",
      },
      {
        id: "wait-2",
        type: "wait",
        label: "Wait Until Day 12",
        description: "Just before trial ends",
        icon: Clock,
        config: "day 12",
      },
      {
        id: "action-3",
        type: "action",
        label: "Send Upgrade CTA",
        description: "Make a compelling offer to convert",
        icon: Mail,
        config: "upgrade-cta",
      },
    ],
  },
  {
    id: "purchase",
    name: "Post-Purchase",
    description: "Delight customers after they buy",
    steps: [
      {
        id: "trigger",
        type: "trigger",
        label: "Order Completed",
        description: "Triggered when a purchase is made",
        icon: Zap,
        config: "order.completed",
      },
      {
        id: "action-1",
        type: "action",
        label: "Send Confirmation",
        description: "Thank them and confirm their order",
        icon: Mail,
        config: "order-confirmation",
      },
      {
        id: "wait-event-1",
        type: "wait_event",
        label: "Wait for Delivery",
        description: "Continue when the order is marked as delivered",
        icon: Hourglass,
        config: "order.delivered | timeout: 14 days",
      },
      {
        id: "action-2",
        type: "action",
        label: "Request Review",
        description: "Ask for feedback while it's fresh",
        icon: Mail,
        config: "review-request",
      },
      {
        id: "wait-1",
        type: "wait",
        label: "Wait 7 Days",
        description: "Give them time to write a review",
        icon: Clock,
        config: "7 days",
      },
      {
        id: "action-3",
        type: "action",
        label: "Send Cross-Sell",
        description: "Recommend related products",
        icon: Mail,
        config: "cross-sell",
      },
    ],
  },
  {
    id: "cascade",
    name: "Cross-Channel Cascade",
    description: "Reach users on their preferred channel",
    steps: [
      {
        id: "trigger",
        type: "trigger",
        label: "Cart Abandoned",
        description: "Triggered when a user abandons their cart",
        icon: Zap,
        config: "cart.abandoned",
      },
      {
        id: "action-1",
        type: "action",
        label: "Send Recovery Email",
        description: "Send a cart recovery email immediately",
        icon: Mail,
        config: "cart-recovery",
      },
      {
        id: "wait-event-1",
        type: "wait_event",
        label: "Wait for Open",
        description: "Wait up to 2 hours for the email to be opened",
        icon: Hourglass,
        config: "email.opened | timeout: 2 hours",
      },
      {
        id: "condition",
        type: "condition",
        label: "Email Opened?",
        description: "Check if the recovery email was opened",
        icon: GitBranch,
        config: "email.engaged == true",
        yesBranch: {
          label: "Send Thank You",
          description: "Send a thank you with a discount code",
          icon: Mail,
          config: "thank-you-discount",
        },
        noBranch: {
          label: "Send SMS Reminder",
          description: "Fall back to SMS for users who didn't open",
          icon: MessageSquare,
          config: "cart-sms-reminder",
        },
      },
    ],
  },
];

const typeColors: Record<StepType, string> = {
  trigger: "border-warning bg-warning/10",
  wait: "border-success bg-success/10",
  wait_event: "border-warning bg-warning/10",
  condition: "border-brand bg-brand/10",
  action: "border-info bg-info/10",
};

const typeBgColors: Record<StepType, string> = {
  trigger: "bg-warning text-warning-foreground",
  wait: "bg-success text-success-foreground",
  wait_event: "bg-warning text-warning-foreground",
  condition: "bg-brand text-brand-foreground",
  action: "bg-info text-info-foreground",
};

function WorkflowNode({
  step,
  isActive,
  onClick,
  compact = false,
}: {
  step: WorkflowStep;
  isActive: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const Icon = step.icon;

  return (
    <button
      className={cn(
        "group relative flex items-center gap-3 rounded-xl border-2 p-3 transition-all duration-200",
        compact ? "w-full max-w-[200px]" : "w-full max-w-[260px]",
        typeColors[step.type],
        isActive
          ? "ring-2 ring-brand ring-offset-2 ring-offset-background scale-[1.02]"
          : "hover:scale-[1.01] hover:shadow-md"
      )}
      onClick={onClick}
      type="button"
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg",
          compact ? "size-8" : "size-10",
          typeBgColors[step.type]
        )}
      >
        <Icon className={cn(compact ? "size-4" : "size-5")} />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className={cn("font-semibold", compact ? "text-xs" : "text-sm")}>
          {step.label}
        </p>
        {step.config && !compact && (
          <p className="truncate font-mono text-muted-foreground text-xs">
            {step.config}
          </p>
        )}
      </div>
      {!compact && (
        <ChevronRight
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            isActive && "rotate-90"
          )}
        />
      )}
    </button>
  );
}

function BranchActionNode({
  label,
  icon: Icon,
  isActive,
  onClick,
}: {
  label: string;
  icon: typeof Zap;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "group relative flex w-full max-w-[200px] items-center gap-3 rounded-xl border-2 p-3 transition-all duration-200",
        "border-info bg-background",
        isActive
          ? "ring-2 ring-brand ring-offset-2 ring-offset-background scale-[1.02]"
          : "hover:scale-[1.01] hover:shadow-md"
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-info text-info-foreground">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <p className="font-semibold text-sm">{label}</p>
        <p className="text-muted-foreground text-xs">Template selected</p>
      </div>
    </button>
  );
}

function ConditionBranch({
  step,
  isConditionActive,
  activeBranch,
  onConditionClick,
  onYesClick,
  onNoClick,
}: {
  step: WorkflowStep;
  isConditionActive: boolean;
  activeBranch: "yes" | "no" | null;
  onConditionClick: () => void;
  onYesClick: () => void;
  onNoClick: () => void;
}) {
  const Icon = step.icon;

  return (
    <div className="flex flex-col items-center">
      {/* Diamond Condition Node */}
      <button
        className={cn(
          "group relative transition-all duration-200",
          isConditionActive ? "scale-[1.02]" : "hover:scale-[1.01]"
        )}
        onClick={onConditionClick}
        type="button"
      >
        <div
          className={cn(
            "relative flex size-20 rotate-45 items-center justify-center rounded-xl border-2 bg-background shadow-sm",
            isConditionActive
              ? "border-brand ring-2 ring-brand ring-offset-2 ring-offset-background"
              : "border-border hover:border-brand/50 hover:shadow-md"
          )}
        >
          <div className="-rotate-45 flex flex-col items-center gap-1">
            <div className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground">
              <Icon className="size-4" />
            </div>
            <p className="max-w-[60px] truncate text-center font-medium text-xs">
              {step.label.length > 12
                ? `${step.label.slice(0, 10)}...`
                : step.label}
            </p>
          </div>
        </div>
      </button>

      {/* Branch points with connected lines to action nodes */}
      {step.yesBranch && step.noBranch && (
        <div className="relative flex w-full max-w-[580px] justify-center gap-x-24">
          {/* SVG for dashed branch lines - connects diamond to action nodes */}
          <svg
            aria-label="Branching paths from condition"
            className="pointer-events-none absolute inset-0 h-full w-full"
            fill="none"
            preserveAspectRatio="none"
            role="img"
            viewBox="0 0 400 160"
          >
            {/* Center vertical line from diamond */}
            <line
              className="text-muted-foreground"
              stroke="currentColor"
              strokeWidth="2"
              x1="200"
              x2="200"
              y1="0"
              y2="20"
            />

            {/* Yes branch - smooth curve left and down to action node */}
            <path
              className="text-success"
              d="M200 20 Q200 40 140 40 Q80 40 80 60 L80 95"
              fill="none"
              stroke="currentColor"
              strokeDasharray="6 4"
              strokeWidth="2"
            />

            {/* No branch - smooth curve right and down to action node */}
            <path
              className="text-destructive"
              d="M200 20 Q200 40 260 40 Q320 40 320 60 L320 95"
              fill="none"
              stroke="currentColor"
              strokeDasharray="6 4"
              strokeWidth="2"
            />
          </svg>

          {/* Yes branch action - left side */}
          <div className="relative flex flex-col items-center pt-4">
            {/* Yes Label Badge - positioned on the line */}
            <span className="absolute top-6 rounded bg-success/10 px-2 py-0.5 font-medium text-success text-xs">
              Yes
            </span>
            <div className="mt-16">
              <BranchActionNode
                icon={step.yesBranch.icon}
                isActive={activeBranch === "yes"}
                label={step.yesBranch.label}
                onClick={onYesClick}
              />
            </div>
          </div>

          {/* No branch action - right side */}
          <div className="relative flex flex-col items-center pt-4">
            {/* No Label Badge - positioned on the line */}
            <span className="absolute top-6 rounded bg-destructive/10 px-2 py-0.5 font-medium text-destructive text-xs">
              No
            </span>
            <div className="mt-16">
              <BranchActionNode
                icon={step.noBranch.icon}
                isActive={activeBranch === "no"}
                label={step.noBranch.label}
                onClick={onNoClick}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type ActiveSelection =
  | { type: "step"; index: number }
  | { type: "yes"; conditionIndex: number }
  | { type: "no"; conditionIndex: number };

function getStepDetails(
  template: WorkflowTemplate,
  selection: ActiveSelection
): {
  step: WorkflowStep;
  title: string;
  badgeType: StepType | "yes" | "no";
} | null {
  if (selection.type === "step") {
    const step = template.steps[selection.index];
    return step ? { step, title: step.label, badgeType: step.type } : null;
  }

  const conditionStep = template.steps[selection.conditionIndex];
  if (!conditionStep || conditionStep.type !== "condition") {
    return null;
  }

  if (selection.type === "yes" && conditionStep.yesBranch) {
    return {
      step: {
        id: `${conditionStep.id}-yes`,
        type: "action",
        label: conditionStep.yesBranch.label,
        description: conditionStep.yesBranch.description,
        icon: conditionStep.yesBranch.icon,
        config: conditionStep.yesBranch.config,
      },
      title: conditionStep.yesBranch.label,
      badgeType: "yes",
    };
  }

  if (selection.type === "no" && conditionStep.noBranch) {
    return {
      step: {
        id: `${conditionStep.id}-no`,
        type: "action",
        label: conditionStep.noBranch.label,
        description: conditionStep.noBranch.description,
        icon: conditionStep.noBranch.icon,
        config: conditionStep.noBranch.config,
      },
      title: conditionStep.noBranch.label,
      badgeType: "no",
    };
  }

  return null;
}

function WorkflowDetails({
  step,
  badgeType,
}: {
  step: WorkflowStep;
  badgeType: StepType | "yes" | "no";
}) {
  const Icon = step.icon;

  const getBadgeVariant = () => {
    switch (badgeType) {
      case "trigger":
        return "success";
      case "wait":
        return "info";
      case "wait_event":
        return "warning";
      case "condition":
        return "secondary";
      case "action":
        return "brand";
      case "yes":
        return "success";
      case "no":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const getBadgeLabel = () => {
    switch (badgeType) {
      case "wait_event":
        return "Wait for Event";
      case "yes":
        return "Yes Branch → Action";
      case "no":
        return "No Branch → Action";
      default:
        return badgeType.charAt(0).toUpperCase() + badgeType.slice(1);
    }
  };

  const getIconBg = () => {
    switch (badgeType) {
      case "trigger":
        return "bg-success text-success-foreground";
      case "wait":
        return "bg-info text-info-foreground";
      case "wait_event":
        return "bg-warning text-warning-foreground";
      case "condition":
        return "bg-muted-foreground text-background";
      case "yes":
        return "bg-success text-success-foreground";
      case "no":
        return "bg-destructive text-destructive-foreground";
      default:
        return "bg-brand text-brand-foreground";
    }
  };

  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="mb-4 flex items-center gap-3">
        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-xl",
            getIconBg()
          )}
        >
          <Icon className="size-6" />
        </div>
        <div>
          <Badge className="mb-1" variant={getBadgeVariant()}>
            {getBadgeLabel()}
          </Badge>
          <h4 className="font-semibold text-lg">{step.label}</h4>
        </div>
      </div>

      <p className="mb-4 text-muted-foreground">{step.description}</p>

      {step.config && (
        <div className="rounded-lg bg-muted/50 p-3">
          <p className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Configuration
          </p>
          <code className="font-mono text-sm">{step.config}</code>
        </div>
      )}
    </div>
  );
}

function WorkflowTemplateCard({
  template,
  isActive,
  onClick,
}: {
  template: WorkflowTemplate;
  isActive: boolean;
  onClick: () => void;
}) {
  // Count emails and SMS across actions and branch actions
  let emailCount = 0;
  let smsCount = 0;
  let branchCount = 0;
  for (const step of template.steps) {
    if (step.type === "action") {
      if (step.icon === MessageSquare) {
        smsCount += 1;
      } else {
        emailCount += 1;
      }
    }
    if (step.type === "condition") {
      branchCount += 1;
      if (step.yesBranch) {
        if (step.yesBranch.icon === MessageSquare) {
          smsCount += 1;
        } else {
          emailCount += 1;
        }
      }
      if (step.noBranch) {
        if (step.noBranch.icon === MessageSquare) {
          smsCount += 1;
        } else {
          emailCount += 1;
        }
      }
    }
  }

  return (
    <button
      className={cn(
        "flex flex-col items-start rounded-xl border p-4 text-left transition-all",
        isActive
          ? "border-brand bg-brand/5"
          : "hover:border-brand/50 hover:bg-muted/50"
      )}
      onClick={onClick}
      type="button"
    >
      <div className="mb-2 flex items-center gap-2">
        <Sparkles
          className={cn(
            "size-4",
            isActive ? "text-brand-text" : "text-muted-foreground"
          )}
        />
        <span className="font-semibold">{template.name}</span>
      </div>
      <p className="text-muted-foreground text-sm">{template.description}</p>
      <div className="mt-3 flex items-center gap-2.5 text-muted-foreground text-xs">
        {emailCount > 0 && (
          <span
            className="flex items-center gap-1"
            title={`${emailCount} email${emailCount > 1 ? "s" : ""}`}
          >
            <Mail className="size-3" />
            {emailCount}
          </span>
        )}
        {smsCount > 0 && (
          <span className="flex items-center gap-1" title={`${smsCount} SMS`}>
            <MessageSquare className="size-3" />
            {smsCount}
          </span>
        )}
        {branchCount > 0 && (
          <span
            className="flex items-center gap-1"
            title={`${branchCount} branch${branchCount > 1 ? "es" : ""}`}
          >
            <GitBranch className="size-3" />
            {branchCount}
          </span>
        )}
        <span
          className="flex items-center gap-1"
          title={`${template.steps.length} steps`}
        >
          <Zap className="size-3" />
          {template.steps.length}
        </span>
      </div>
    </button>
  );
}

export function InteractiveWorkflowBuilder() {
  const [activeTemplate, setActiveTemplate] = useState(workflowTemplates[0]);
  const [activeSelection, setActiveSelection] = useState<ActiveSelection>({
    type: "step",
    index: 0,
  });

  const details = getStepDetails(activeTemplate, activeSelection);

  const getTotalStepCount = () => {
    let count = 0;
    for (const step of activeTemplate.steps) {
      count += 1;
      if (step.type === "condition" && step.yesBranch && step.noBranch) {
        count += 2;
      }
    }
    return count;
  };

  const getCurrentStepNumber = () => {
    let count = 0;
    for (let i = 0; i < activeTemplate.steps.length; i += 1) {
      count += 1;
      if (activeSelection.type === "step" && activeSelection.index === i) {
        return count;
      }
      const step = activeTemplate.steps[i];
      if (step.type === "condition" && step.yesBranch && step.noBranch) {
        if (
          activeSelection.type === "yes" &&
          activeSelection.conditionIndex === i
        ) {
          return count + 1;
        }
        if (
          activeSelection.type === "no" &&
          activeSelection.conditionIndex === i
        ) {
          return count + 2;
        }
        count += 2;
      }
    }
    return count;
  };

  return (
    <div className="space-y-6">
      {/* Template Selector */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {workflowTemplates.map((template) => (
          <WorkflowTemplateCard
            isActive={activeTemplate.id === template.id}
            key={template.id}
            onClick={() => {
              setActiveTemplate(template);
              setActiveSelection({ type: "step", index: 0 });
            }}
            template={template}
          />
        ))}
      </div>
      <div className="flex items-center justify-center gap-4 text-muted-foreground text-xs">
        <span className="flex items-center gap-1">
          <Mail className="size-3" /> Emails
        </span>
        <span className="flex items-center gap-1">
          <MessageSquare className="size-3" /> SMS
        </span>
        <span className="flex items-center gap-1">
          <GitBranch className="size-3" /> Branches
        </span>
        <span className="flex items-center gap-1">
          <Zap className="size-3" /> Steps
        </span>
      </div>

      {/* Interactive Workflow Builder */}
      <div className="overflow-hidden rounded-2xl border bg-card shadow-lg">
        {/* Builder Header */}
        <div className="flex items-center justify-between border-b bg-muted/30 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="size-3 rounded-full bg-destructive/80" />
              <div className="size-3 rounded-full bg-warning/80" />
              <div className="size-3 rounded-full bg-success/80" />
            </div>
            <span className="font-medium">{activeTemplate.name}</span>
          </div>
          <Badge variant="outline">{getTotalStepCount()} steps</Badge>
        </div>

        {/* Builder Content */}
        <div className="grid lg:grid-cols-2">
          {/* Workflow Canvas */}
          <div className="border-b p-6 lg:border-r lg:border-b-0">
            <div className="flex flex-col items-center">
              {activeTemplate.steps.map((step, index) => {
                const isLastStep = index === activeTemplate.steps.length - 1;

                if (step.type === "condition") {
                  return (
                    <div className="flex flex-col items-center" key={step.id}>
                      <ConditionBranch
                        activeBranch={
                          activeSelection.type === "yes" &&
                          activeSelection.conditionIndex === index
                            ? "yes"
                            : activeSelection.type === "no" &&
                                activeSelection.conditionIndex === index
                              ? "no"
                              : null
                        }
                        isConditionActive={
                          activeSelection.type === "step" &&
                          activeSelection.index === index
                        }
                        onConditionClick={() =>
                          setActiveSelection({ type: "step", index })
                        }
                        onNoClick={() =>
                          setActiveSelection({
                            type: "no",
                            conditionIndex: index,
                          })
                        }
                        onYesClick={() =>
                          setActiveSelection({
                            type: "yes",
                            conditionIndex: index,
                          })
                        }
                        step={step}
                      />
                      {!isLastStep && (
                        <div className="flex h-8 flex-col items-center justify-center">
                          <div className="h-full w-0.5 bg-border" />
                          <ArrowDown className="size-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div className="flex flex-col items-center" key={step.id}>
                    <WorkflowNode
                      isActive={
                        activeSelection.type === "step" &&
                        activeSelection.index === index
                      }
                      onClick={() =>
                        setActiveSelection({ type: "step", index })
                      }
                      step={step}
                    />
                    {!isLastStep && (
                      <div className="flex h-8 flex-col items-center justify-center">
                        <div className="h-full w-0.5 bg-border" />
                        <ArrowDown className="size-4 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step Details */}
          <div className="bg-muted/20 p-6">
            <p className="mb-4 font-medium text-muted-foreground text-sm">
              Step {getCurrentStepNumber()} of {getTotalStepCount()}
            </p>
            {details && (
              <WorkflowDetails
                badgeType={details.badgeType}
                step={details.step}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
