"use client";

import { Button } from "@wraps/ui/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@wraps/ui/components/ui/tooltip";
import {
  AlertTriangle,
  ArrowRight,
  Code2,
  Eye,
  MousePointerClick,
  Terminal,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AwsDynamodbIcon } from "@/components/ui/svgs/awsDynamodbIcon";
import { AwsEventbridgeIcon } from "@/components/ui/svgs/awsEventbridgeIcon";
import { AwsLambdaIcon } from "@/components/ui/svgs/awsLambdaIcon";
import { AwsSesIcon } from "@/components/ui/svgs/awsSesIcon";
import { AwsSqsIcon } from "@/components/ui/svgs/awsSqsIcon";

export type ArchitectureTabKey = "send" | "track" | "deploy";

type TabContent = {
  title: string;
  description: string;
  ctaText: string;
  ctaLink: string;
};

const tabContent: Record<ArchitectureTabKey, TabContent> = {
  send: {
    title: "Send Emails",
    description:
      "Use our TypeScript SDK to send emails through your own AWS SES infrastructure. Simple API, full type safety, automatic credential handling via OIDC.",
    ctaText: "View SDK Docs",
    ctaLink: "/docs/sdk-reference",
  },
  track: {
    title: "Track Events",
    description:
      "SES captures opens, clicks, bounces, and complaints. Wraps routes these through EventBridge, SQS (with DLQ for reliability), and Lambda into DynamoDB. Query directly or view in the dashboard.",
    ctaText: "See Event Types",
    ctaLink: "/docs/cli-reference/email#event-tracking",
  },
  deploy: {
    title: "Deploy Infrastructure",
    description:
      "One CLI command deploys production-ready email infrastructure to your AWS account. SES, DynamoDB, Lambda, EventBridge, SQS, and IAM roles - all configured automatically.",
    ctaText: "Get Started",
    ctaLink: "/docs/cli-reference",
  },
};

// Icon box component for grid nodes
function IconBox({
  icon: Icon,
  highlighted = false,
  label,
  compact = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  highlighted?: boolean;
  label?: string;
  compact?: boolean;
}) {
  const iconElement = (
    <div
      className={`flex aspect-square items-center justify-center rounded-full border-2 bg-background transition-all ${
        compact ? "size-10" : "size-14"
      } ${
        highlighted
          ? "border-brand bg-brand/5 text-brand-text"
          : "border-border text-muted-foreground"
      }`}
    >
      <Icon className={compact ? "size-8" : "size-11"} />
    </div>
  );

  if (label) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{iconElement}</TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    );
  }

  return iconElement;
}

// Simple node component for external entities (Your App, Recipients)
type SimpleNodeProps = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  highlighted?: boolean;
  nodeRef?: React.RefObject<HTMLDivElement | null>;
  compact?: boolean;
};

function SimpleNode({
  label,
  icon: Icon,
  highlighted = false,
  nodeRef,
  compact = false,
}: SimpleNodeProps) {
  return (
    <div
      className={`flex flex-col items-center ${compact ? "gap-1.5" : "gap-2"}`}
      ref={nodeRef}
    >
      <div
        className={`flex aspect-square items-center justify-center rounded-full border-2 bg-background transition-all ${
          compact ? "size-11" : "size-14"
        } ${
          highlighted
            ? "border-brand bg-brand/5 text-brand-text"
            : "border-border text-muted-foreground"
        }`}
      >
        <Icon className={compact ? "size-5" : "size-6"} />
      </div>
      <span
        className={`font-medium text-xs ${highlighted ? "text-brand-text" : "text-muted-foreground"}`}
      >
        {label}
      </span>
    </div>
  );
}

// AWS Account container with SES and Wraps infrastructure boxes
type AWSAccountBoxProps = {
  activeTab: ArchitectureTabKey;
  sesRef?: React.RefObject<HTMLDivElement | null>;
  wrapsRef?: React.RefObject<HTMLDivElement | null>;
  compact?: boolean;
};

function AWSAccountBox({
  activeTab,
  sesRef,
  wrapsRef,
  compact = false,
}: AWSAccountBoxProps) {
  const sesHighlighted =
    activeTab === "send" || activeTab === "deploy" || activeTab === "track";
  const wrapsHighlighted = activeTab === "track" || activeTab === "deploy";

  return (
    <div
      className={`flex flex-col items-center ${compact ? "gap-1.5" : "gap-2"}`}
    >
      <div
        className={`rounded-lg bg-muted/50 px-2 py-0.5 text-muted-foreground ${compact ? "text-xs" : "text-xs"}`}
      >
        Your AWS Account
      </div>
      <div
        className={`flex flex-col items-center rounded-xl border-2 border-muted-foreground/30 border-dashed bg-muted/10 ${compact ? "gap-2 p-3" : "gap-4 p-4"}`}
      >
        {/* SES Box - Top Row */}
        <div
          className={`flex flex-col items-center ${compact ? "gap-1" : "gap-2"}`}
          ref={sesRef}
        >
          <div
            className={`flex items-center justify-center rounded-lg border-2 transition-all ${
              compact ? "h-12 w-12" : "h-16 w-16"
            } ${
              sesHighlighted
                ? "border-brand bg-brand/5 text-brand-text"
                : "border-border bg-background text-muted-foreground"
            }`}
          >
            <AwsSesIcon className={compact ? "h-9 w-9" : "h-14 w-14"} />
          </div>
          <span
            className={`font-medium text-xs ${
              sesHighlighted ? "text-brand-text" : "text-muted-foreground"
            }`}
          >
            SES
          </span>
        </div>

        {/* Wraps Infrastructure Box - Bottom Row */}
        <div
          className={`flex items-center rounded-lg border-2 transition-all ${
            compact ? "gap-1.5 px-2 py-1.5" : "gap-2 px-3 py-2"
          } ${
            wrapsHighlighted
              ? "border-brand bg-brand/5"
              : "border-border bg-background"
          }`}
          ref={wrapsRef}
        >
          <IconBox
            compact={compact}
            highlighted={wrapsHighlighted}
            icon={AwsEventbridgeIcon}
            label="EventBridge"
          />
          <IconBox
            compact={compact}
            highlighted={wrapsHighlighted}
            icon={AwsSqsIcon}
            label="SQS"
          />
          <IconBox
            compact={compact}
            highlighted={wrapsHighlighted}
            icon={AwsLambdaIcon}
            label="Lambda"
          />
          <IconBox
            compact={compact}
            highlighted={wrapsHighlighted}
            icon={AwsDynamodbIcon}
            label="DynamoDB"
          />
        </div>
      </div>
    </div>
  );
}

// Mobile node component
function MobileNode({
  icon: Icon,
  label,
  highlighted,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  highlighted: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex aspect-square size-14 items-center justify-center rounded-full border-2 ${
          highlighted
            ? "border-brand bg-brand/5 text-brand-text"
            : "border-border bg-background text-muted-foreground"
        }`}
      >
        <Icon className="h-11 w-11" />
      </div>
      <span
        className={`text-xs ${highlighted ? "text-brand-text" : "text-muted-foreground"}`}
      >
        {label}
      </span>
    </div>
  );
}

// Mobile AWS Account box component
function MobileAWSBox({
  showSES = true,
  showWraps = true,
  sesHighlighted = false,
  wrapsHighlighted = false,
}: {
  showSES?: boolean;
  showWraps?: boolean;
  sesHighlighted?: boolean;
  wrapsHighlighted?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-3xs text-muted-foreground">Your AWS Account</span>
      <div className="flex items-center gap-3 rounded-xl border-2 border-muted-foreground/30 border-dashed bg-muted/10 px-4 py-3">
        {showSES && (
          <MobileNode
            highlighted={sesHighlighted}
            icon={AwsSesIcon}
            label="SES"
          />
        )}
        {showWraps && (
          <MobileNode
            highlighted={wrapsHighlighted}
            icon={AwsDynamodbIcon}
            label="Wraps"
          />
        )}
      </div>
    </div>
  );
}

// Mobile simplified flow component
function MobileFlow({ activeTab }: { activeTab: ArchitectureTabKey }) {
  // Shared offset to align external nodes with AWS box content (accounting for "Your AWS Account" label)
  const nodeOffset = "mb-5";
  const arrowOffset = "mb-12";

  if (activeTab === "send") {
    return (
      <div className="flex flex-wrap items-end justify-center gap-3 pb-1">
        <div className={nodeOffset}>
          <MobileNode highlighted icon={Code2} label="Your App" />
        </div>
        <ArrowRight
          className={`h-4 w-4 shrink-0 text-brand-text ${arrowOffset}`}
        />
        <MobileAWSBox sesHighlighted showWraps={false} />
        <ArrowRight
          className={`h-4 w-4 shrink-0 text-brand-text ${arrowOffset}`}
        />
        <div className={nodeOffset}>
          <MobileNode highlighted icon={Users} label="Recipients" />
        </div>
      </div>
    );
  }

  if (activeTab === "track") {
    return (
      <div className="flex flex-wrap items-end justify-center gap-3 pb-1">
        <div className={nodeOffset}>
          <MobileNode highlighted icon={Users} label="Recipients" />
        </div>
        <ArrowRight
          className={`h-4 w-4 shrink-0 text-brand-text ${arrowOffset}`}
        />
        <MobileAWSBox sesHighlighted wrapsHighlighted />
      </div>
    );
  }

  // Deploy tab
  return (
    <div className="flex flex-wrap items-end justify-center gap-3 pb-1">
      <div className={nodeOffset}>
        <MobileNode highlighted icon={Terminal} label="CLI" />
      </div>
      <ArrowRight
        className={`h-4 w-4 shrink-0 text-brand-text ${arrowOffset}`}
      />
      <MobileAWSBox sesHighlighted wrapsHighlighted />
    </div>
  );
}

type Point = {
  x: number;
  y: number;
};

type NodePositions = {
  yourApp: Point;
  cli: Point;
  ses: Point;
  wraps: Point;
  recipients: Point;
};

// Generate curved path between two points
function createCurvedPath(from: Point, to: Point, curvature = 0.5): string {
  const dx = to.x - from.x;

  // Control points for smooth curve
  const cp1x = from.x + dx * curvature;
  const cp1y = from.y;
  const cp2x = to.x - dx * curvature;
  const cp2y = to.y;

  return `M ${from.x} ${from.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${to.x} ${to.y}`;
}

// SVG Connection lines with dynamic positions
function ConnectionLines({
  activeTab,
  positions,
  compact = false,
}: {
  activeTab: ArchitectureTabKey;
  positions: NodePositions | null;
  compact?: boolean;
}) {
  if (!positions) {
    return null;
  }

  const { yourApp, cli, ses, wraps, recipients } = positions;

  // Adjust offsets based on compact mode
  const nodeOffset = compact ? 28 : 35;
  const wrapsXOffset = compact ? 70 : 120;

  return (
    <svg className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-visible">
      <defs>
        <marker
          id="arrowhead"
          markerHeight="8"
          markerUnits="strokeWidth"
          markerWidth="8"
          orient="auto"
          refX="8"
          refY="4"
        >
          <path d="M 0 0 L 8 4 L 0 8 Z" fill="var(--color-muted-foreground)" />
        </marker>
        <marker
          id="arrowhead-orange"
          markerHeight="8"
          markerUnits="strokeWidth"
          markerWidth="8"
          orient="auto"
          refX="8"
          refY="4"
        >
          <path d="M 0 0 L 8 4 L 0 8 Z" fill="var(--color-brand)" />
        </marker>
      </defs>

      {/* Send tab connections */}
      {activeTab === "send" && (
        <>
          {/* Your App to SES */}
          <path
            className="animate-dash"
            d={createCurvedPath(
              { x: yourApp.x + nodeOffset, y: yourApp.y - 12 },
              { x: ses.x - nodeOffset, y: ses.y - 12 }
            )}
            fill="none"
            markerEnd="url(#arrowhead-orange)"
            stroke="var(--color-brand)"
            strokeDasharray="8 6"
            strokeWidth="2"
          />
          {/* SES to Recipients */}
          <path
            className="animate-dash"
            d={createCurvedPath(
              { x: ses.x + nodeOffset, y: ses.y - 12 },
              { x: recipients.x - nodeOffset, y: recipients.y - 12 }
            )}
            fill="none"
            markerEnd="url(#arrowhead-orange)"
            stroke="var(--color-brand)"
            strokeDasharray="8 6"
            strokeWidth="2"
          />
          {/* Feedback loop: Recipients back to SES (opens/clicks) */}
          <path
            className="animate-dash"
            d={createCurvedPath(
              { x: recipients.x - nodeOffset, y: recipients.y + 12 },
              { x: ses.x + nodeOffset, y: ses.y + 12 },
              0.4
            )}
            fill="none"
            markerEnd="url(#arrowhead-orange)"
            opacity={0.6}
            stroke="var(--color-brand)"
            strokeDasharray="8 6"
            strokeWidth="2"
          />
          {/* SES to Wraps (event tracking) */}
          <path
            className="animate-dash"
            d={`M ${ses.x - nodeOffset} ${ses.y + 12} C ${ses.x - nodeOffset - 30} ${ses.y + 12}, ${wraps.x - wrapsXOffset + 10} ${ses.y + 10}, ${wraps.x - wrapsXOffset + 10} ${wraps.y - (compact ? 30 : 58)}`}
            fill="none"
            markerEnd="url(#arrowhead-orange)"
            opacity={0.6}
            stroke="var(--color-brand)"
            strokeDasharray="8 6"
            strokeWidth="2"
          />
        </>
      )}

      {/* Track tab connections */}
      {activeTab === "track" && (
        <>
          {/* Recipients to SES (events coming back) */}
          <path
            className="animate-dash"
            d={createCurvedPath(
              { x: recipients.x - nodeOffset, y: recipients.y - 12 },
              { x: ses.x + nodeOffset, y: ses.y - 12 },
              0.4
            )}
            fill="none"
            markerEnd="url(#arrowhead-orange)"
            stroke="var(--color-brand)"
            strokeDasharray="8 6"
            strokeWidth="2"
          />
          {/* SES to Wraps - curve from left side of SES down to EB icon */}
          <path
            className="animate-dash"
            d={`M ${ses.x - nodeOffset} ${ses.y - 12} C ${ses.x - nodeOffset - 30} ${ses.y - 12}, ${wraps.x - wrapsXOffset + 45} ${ses.y + 20}, ${wraps.x - wrapsXOffset + 45} ${wraps.y - (compact ? 40 : 58)}`}
            fill="none"
            markerEnd="url(#arrowhead-orange)"
            stroke="var(--color-brand)"
            strokeDasharray="8 6"
            strokeWidth="2"
          />
        </>
      )}

      {/* Deploy tab connections */}
      {activeTab === "deploy" && (
        <>
          {/* CLI to SES */}
          <path
            className="animate-dash"
            d={createCurvedPath(
              { x: cli.x + nodeOffset, y: cli.y - 12 },
              { x: ses.x - nodeOffset, y: ses.y - 12 },
              0.5
            )}
            fill="none"
            markerEnd="url(#arrowhead-orange)"
            stroke="var(--color-brand)"
            strokeDasharray="8 6"
            strokeWidth="2"
          />
          {/* CLI to Wraps */}
          <path
            className="animate-dash"
            d={createCurvedPath(
              { x: cli.x + nodeOffset, y: cli.y + 12 },
              { x: wraps.x - wrapsXOffset - (compact ? 40 : 60), y: wraps.y },
              0.5
            )}
            fill="none"
            markerEnd="url(#arrowhead-orange)"
            stroke="var(--color-brand)"
            strokeDasharray="8 6"
            strokeWidth="2"
          />
        </>
      )}
    </svg>
  );
}

// Reusable interactive diagram component (without section wrapper)
export function InteractiveArchitectureDiagram({
  defaultTab = "send",
  showTabBar = true,
  compact = false,
}: {
  defaultTab?: ArchitectureTabKey;
  showTabBar?: boolean;
  compact?: boolean;
} = {}) {
  const [activeTab, setActiveTab] = useState<ArchitectureTabKey>(defaultTab);
  const [positions, setPositions] = useState<NodePositions | null>(null);

  // Refs for all nodes
  const containerRef = useRef<HTMLDivElement>(null);
  const yourAppRef = useRef<HTMLDivElement>(null);
  const cliRef = useRef<HTMLDivElement>(null);
  const sesRef = useRef<HTMLDivElement>(null);
  const wrapsRef = useRef<HTMLDivElement>(null);
  const recipientsRef = useRef<HTMLDivElement>(null);

  // Calculate positions relative to container
  const updatePositions = useCallback(() => {
    if (!containerRef.current) {
      return;
    }

    const containerRect = containerRef.current.getBoundingClientRect();

    const getCenter = (ref: React.RefObject<HTMLDivElement | null>): Point => {
      if (!ref.current) {
        return { x: 0, y: 0 };
      }
      const rect = ref.current.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top + rect.height / 2 - containerRect.top,
      };
    };

    setPositions({
      yourApp: getCenter(yourAppRef),
      cli: getCenter(cliRef),
      ses: getCenter(sesRef),
      wraps: getCenter(wrapsRef),
      recipients: getCenter(recipientsRef),
    });
  }, []);

  // Update positions on mount, resize, and tab change
  useEffect(() => {
    updatePositions();

    const handleResize = () => {
      requestAnimationFrame(updatePositions);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updatePositions]);

  // Small delay to ensure layout is complete
  useEffect(() => {
    const timer = setTimeout(updatePositions, 50);
    return () => clearTimeout(timer);
  }, [updatePositions]);

  return (
    <>
      {/* Main diagram container */}
      <div className="overflow-hidden rounded-md border bg-muted/20">
        {/* Tab bar - optional */}
        {showTabBar && (
          <div className="flex justify-center border-b bg-background/50 py-4">
            <div className="inline-flex rounded-full border bg-background p-1">
              {(["send", "track", "deploy"] as const).map((tab) => (
                <button
                  className={`rounded-full px-5 py-2 font-medium text-sm transition-all ${
                    activeTab === tab
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  type="button"
                >
                  {tab === "send" && "Send Email"}
                  {tab === "track" && "Track Events"}
                  {tab === "deploy" && "Deploy"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mobile: Simplified vertical flow */}
        {!compact && (
          <div className="block p-6 md:hidden">
            <MobileFlow activeTab={activeTab} />
          </div>
        )}

        {/* Desktop: Full diagram */}
        <div
          className={`relative ${compact ? "min-h-[240px] px-6 py-6" : "hidden min-h-[380px] p-8 md:block"}`}
          ref={containerRef}
        >
          {/* Connection lines SVG */}
          <ConnectionLines
            activeTab={activeTab}
            compact={compact}
            positions={positions}
          />

          {/* Node layout - horizontal flow */}
          <div
            className={`relative z-10 flex items-center justify-center ${compact ? "gap-8 md:gap-20" : "gap-12 lg:gap-16"}`}
          >
            {/* Left side - Your App / CLI */}
            <div className={`flex flex-col ${compact ? "gap-3" : "gap-6"}`}>
              {/* Your App - hidden in deploy tab when compact */}
              {!(compact && activeTab === "deploy") && (
                <SimpleNode
                  compact={compact}
                  highlighted={activeTab === "send"}
                  icon={Code2}
                  label="Your App"
                  nodeRef={yourAppRef}
                />
              )}
              {/* Wraps CLI - hidden in send tab when compact */}
              {!(compact && activeTab === "send") && (
                <SimpleNode
                  compact={compact}
                  highlighted={activeTab === "deploy"}
                  icon={Terminal}
                  label="Wraps CLI"
                  nodeRef={cliRef}
                />
              )}
            </div>

            {/* Center - AWS Account with SES and Wraps boxes */}
            <AWSAccountBox
              activeTab={activeTab}
              compact={compact}
              sesRef={sesRef}
              wrapsRef={wrapsRef}
            />

            {/* Right side - Recipients - hidden in deploy tab when compact */}
            {!(compact && activeTab === "deploy") && (
              <div
                className={`flex flex-col items-center ${compact ? "gap-2" : "gap-4"}`}
              >
                <SimpleNode
                  compact={compact}
                  highlighted={activeTab === "send" || activeTab === "track"}
                  icon={Users}
                  label="Recipients"
                  nodeRef={recipientsRef}
                />
                {/* Event types shown below recipients for send tab in compact mode */}
                {activeTab === "send" && compact && (
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex gap-1">
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border border-brand/50 bg-brand/10 text-brand-text">
                        <Eye className="h-2.5 w-2.5" />
                      </div>
                      <div className="flex h-5 w-5 items-center justify-center rounded-full border border-brand/50 bg-brand/10 text-brand-text">
                        <MousePointerClick className="h-2.5 w-2.5" />
                      </div>
                    </div>
                    <span className="text-3xs text-brand-text">
                      opens · clicks
                    </span>
                  </div>
                )}
                {/* Event types shown below recipients for track tab - hidden in compact */}
                {activeTab === "track" && !compact && (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full border border-brand/50 bg-brand/10 text-brand-text">
                        <Eye className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex h-7 w-7 items-center justify-center rounded-full border border-brand/50 bg-brand/10 text-brand-text">
                        <MousePointerClick className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex h-7 w-7 items-center justify-center rounded-full border border-brand/50 bg-brand/10 text-brand-text">
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </div>
                    </div>
                    <span className="text-3xs text-brand-text">
                      opens · clicks · bounces
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom description bar - hidden in compact mode */}
        {!compact && (
          <div className="flex flex-col gap-4 border-t bg-foreground px-6 py-5 text-background md:flex-row md:items-center md:justify-between md:px-8 md:py-6">
            <div className="max-w-xl">
              <h3 className="mb-1 font-semibold text-base md:text-lg">
                {tabContent[activeTab].title}
              </h3>
              <p className="text-background/70 text-sm">
                {tabContent[activeTab].description}
              </p>
            </div>
            <Button
              asChild
              className="w-full shrink-0 bg-background text-foreground hover:bg-background/90 md:w-auto"
              size="lg"
            >
              <a href={tabContent[activeTab].ctaLink}>
                {tabContent[activeTab].ctaText}
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </div>
        )}
      </div>

      {/* Legend - hidden on mobile and in compact mode */}
      {!compact && (
        <div className="mt-6 hidden flex-wrap items-center justify-center gap-6 text-muted-foreground text-sm md:flex">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded border-2 border-brand bg-brand/20" />
            <span>Active Flow</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded border-2 border-border" />
            <span>Infrastructure</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-0.5 w-6 border-brand border-t-2 border-dashed" />
            <span>Data Path</span>
          </div>
        </div>
      )}
    </>
  );
}

// Full standalone section (for use as a separate page section)
export function ArchitectureSection() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="mb-12 text-center">
          <h2 className="mb-4 font-bold text-3xl tracking-tight md:text-4xl">
            How Wraps Works
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            Deploy email infrastructure to your AWS account with one command.
            Send emails with our SDK. Track everything automatically.
          </p>
        </div>

        <InteractiveArchitectureDiagram />
      </div>
    </section>
  );
}
