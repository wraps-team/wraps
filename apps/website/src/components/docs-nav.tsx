"use client";

import {
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  Blocks,
  BookOpen,
  Bot,
  Box,
  ChevronRight,
  Cloud,
  FileCode2,
  FileJson,
  FileText,
  Globe,
  History,
  KeyRound,
  Layers,
  Mail,
  MessageSquare,
  Radio,
  Rocket,
  Server,
  Settings,
  ShieldCheck,
  Sliders,
  Terminal,
  Workflow,
  Zap,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type NavItem = {
  title: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  defaultExpanded?: boolean;
  children?: NavItem[];
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const navItems: NavSection[] = [
  {
    title: "Getting Started",
    items: [
      {
        title: "Introduction",
        href: "/docs",
        icon: FileText,
      },
      {
        title: "Quickstart",
        href: "/docs/quickstart",
        icon: Rocket,
      },
      {
        title: "Docs for LLMs",
        href: "/llms-full.txt",
        icon: Bot,
      },
    ],
  },
  {
    title: "Platform",
    items: [
      {
        title: "Quickstart",
        href: "/docs/quickstart/platform",
        icon: Rocket,
      },
      {
        title: "SDK Reference",
        href: "/docs/client-sdk-reference",
        icon: Blocks,
      },
      {
        title: "CLI Commands",
        href: "/docs/cli-reference/platform",
        icon: Terminal,
      },
    ],
  },
  {
    title: "Email",
    items: [
      {
        title: "Quickstart",
        href: "/docs/quickstart/email",
        icon: Rocket,
        defaultExpanded: true,
        children: [
          { title: "Next.js", href: "/docs/quickstart/email/nextjs" },
          { title: "Express", href: "/docs/quickstart/email/express" },
          { title: "Remix", href: "/docs/quickstart/email/remix" },
          {
            title: "Cloudflare Workers",
            href: "/docs/quickstart/email/cloudflare",
          },
          { title: "Inbound", href: "/docs/quickstart/email/inbound" },
          { title: "Templates", href: "/docs/quickstart/email/templates" },
          { title: "Workflows", href: "/docs/quickstart/email/workflows" },
          { title: "Agents", href: "/docs/quickstart/email/agents" },
        ],
      },
      {
        title: "TypeScript SDK",
        href: "/docs/sdk-reference",
        icon: Mail,
      },
      {
        title: "Python SDK",
        href: "/docs/python-sdk-reference",
        icon: FileCode2,
      },
      {
        title: "MCP Server",
        href: "/docs/mcp-reference",
        icon: Bot,
      },
      {
        title: "CLI Commands",
        href: "/docs/cli-reference/email",
        icon: Terminal,
      },
      {
        title: "Infrastructure",
        href: "/docs/infrastructure/email",
        icon: Server,
      },
      {
        title: "Domain Verification",
        href: "/docs/guides/domain-verification",
        icon: Globe,
      },
      {
        title: "Production Access",
        href: "/docs/guides/production-access",
        icon: ShieldCheck,
      },
      {
        title: "SMTP Credentials",
        href: "/docs/guides/smtp",
        icon: KeyRound,
      },
      {
        title: "Webhooks",
        href: "/docs/guides/webhooks",
        icon: Zap,
      },
      {
        title: "Reply Threading",
        href: "/docs/guides/reply-threading",
        icon: Radio,
      },
      {
        title: "Templates Guide",
        href: "/docs/guides/templates",
        icon: FileCode2,
      },
      {
        title: "Workflows Guide",
        href: "/docs/guides/workflows",
        icon: Workflow,
      },
      {
        title: "Configuration Presets",
        href: "/docs/guides/configuration-presets",
        icon: Sliders,
      },
    ],
  },
  {
    title: "SMS",
    items: [
      {
        title: "Quickstart",
        href: "/docs/quickstart/sms",
        icon: Rocket,
      },
      {
        title: "SDK Reference",
        href: "/docs/sms-sdk-reference",
        icon: MessageSquare,
      },
      {
        title: "CLI Commands",
        href: "/docs/cli-reference/sms",
        icon: Terminal,
      },
      {
        title: "Infrastructure",
        href: "/docs/infrastructure/sms",
        icon: Server,
      },
    ],
  },
  {
    title: "CDN",
    items: [
      {
        title: "Quickstart",
        href: "/docs/quickstart/cdn",
        icon: Rocket,
      },
      {
        title: "CLI Commands",
        href: "/docs/cli-reference/cdn",
        icon: Terminal,
      },
      {
        title: "Infrastructure",
        href: "/docs/infrastructure/cdn",
        icon: Server,
      },
    ],
  },
  {
    title: "Reference",
    items: [
      {
        title: "API Reference",
        href: "/docs/reference/api",
        icon: FileCode2,
      },
      {
        title: "CLI Overview",
        href: "/docs/cli-reference",
        icon: Terminal,
      },
      {
        title: "Error Codes",
        href: "/docs/reference/errors",
        icon: AlertTriangle,
      },
      {
        title: "Rate Limits",
        href: "/docs/reference/rate-limits",
        icon: ShieldCheck,
      },
      {
        title: "Environment Variables",
        href: "/docs/reference/environment-variables",
        icon: Settings,
      },
      {
        title: "JSON Output",
        href: "/docs/reference/json-output",
        icon: FileJson,
      },
      {
        title: "EventBridge Events",
        href: "/docs/infrastructure/events",
        icon: Zap,
      },
      {
        title: "Telemetry",
        href: "/docs/telemetry",
        icon: BarChart3,
      },
      {
        title: "Changelog",
        href: "/changelog",
        icon: History,
      },
    ],
  },
  {
    title: "Resources",
    items: [
      {
        title: "AWS Setup",
        href: "/docs/guides/aws-setup",
        icon: Cloud,
        children: [
          { title: "Quick Start", href: "/docs/guides/aws-setup/quick" },
          { title: "Full Setup", href: "/docs/guides/aws-setup/full" },
          {
            title: "IAM Permissions",
            href: "/docs/guides/aws-setup/permissions",
          },
          {
            title: "Troubleshooting",
            href: "/docs/guides/aws-setup/troubleshooting",
          },
        ],
      },
      {
        title: "Auth Commands",
        href: "/docs/cli-reference/auth",
        icon: KeyRound,
      },
      {
        title: "AWS Commands",
        href: "/docs/cli-reference/aws",
        icon: Cloud,
      },
      {
        title: "Self-Hosted Deployment",
        href: "/docs/guides/self-hosted",
        icon: Server,
      },
      {
        title: "Vercel Setup",
        href: "/docs/guides/vercel-setup",
        icon: Rocket,
      },
      {
        title: "Custom Events",
        href: "/docs/guides/custom-events",
        icon: Radio,
      },
      {
        title: "Orchestration",
        href: "/docs/guides/orchestration",
        icon: Layers,
      },
      {
        title: "Migration Guide",
        href: "/docs/guides/migration",
        icon: ArrowRightLeft,
      },
      {
        title: "Context7 (AI Docs)",
        href: "/docs/guides/context7",
        icon: Bot,
      },
      {
        title: "CDK Construct",
        href: "/docs/cdk-reference",
        icon: Layers,
      },
      {
        title: "Pulumi Component",
        href: "/docs/pulumi-reference",
        icon: Box,
      },
      {
        title: "Cookbook",
        href: "/docs/cookbook",
        icon: BookOpen,
      },
    ],
  },
];

function NavItemComponent({
  item,
  pathname,
}: {
  item: NavItem;
  pathname: string;
}) {
  const Icon = item.icon;
  const isActive = pathname === item.href;
  const hasChildren = item.children && item.children.length > 0;
  const isChildActive =
    hasChildren && item.children?.some((child) => pathname === child.href);

  // Expand if this item or any child is active, or if defaultExpanded
  const [isExpanded, setIsExpanded] = useState(
    isActive || isChildActive || item.defaultExpanded === true
  );

  return (
    <div>
      <div
        className={cn(
          "group flex items-center rounded-md text-sm transition-colors",
          isActive
            ? "bg-primary/10 font-medium text-primary"
            : isChildActive
              ? "font-medium text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          item.disabled && "pointer-events-none opacity-50"
        )}
      >
        <a
          className="flex flex-1 items-center gap-2 px-2 py-1.5"
          href={item.disabled ? undefined : item.href}
          onClick={hasChildren ? () => setIsExpanded(true) : undefined}
        >
          {Icon && <Icon className="h-4 w-4 shrink-0" />}
          <span className="flex-1">{item.title}</span>
          {item.disabled && (
            <span className="text-muted-foreground text-xs">(Soon)</span>
          )}
        </a>
        {hasChildren && (
          <button
            aria-expanded={isExpanded}
            aria-label={`Toggle ${item.title} section`}
            className="rounded-md p-1.5 hover:bg-muted"
            onClick={() => setIsExpanded(!isExpanded)}
            type="button"
          >
            <ChevronRight
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                isExpanded && "rotate-90"
              )}
            />
          </button>
        )}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="mt-1 ml-4 space-y-0.5 border-border border-l pl-3">
          {item.children?.map((child) => {
            const childIsActive = pathname === child.href;
            return (
              <a
                className={cn(
                  "block rounded-md px-2 py-1.5 text-sm transition-colors",
                  childIsActive
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                href={child.href}
                key={child.href}
              >
                {child.title}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DocsNav() {
  const pathname = usePathname();

  return (
    <nav className="w-full space-y-6">
      {navItems.map((section) => (
        <div key={section.title}>
          <h4 className="mb-2 px-2 font-medium text-foreground text-xs uppercase tracking-wide">
            {section.title}
          </h4>
          <div className="space-y-0.5">
            {section.items.map((item) => (
              <NavItemComponent
                item={item}
                key={item.href}
                pathname={pathname}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
