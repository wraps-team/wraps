"use client";

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@wraps/ui/components/ui/dialog";
import { Command as CommandPrimitive } from "cmdk";
import {
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  Blocks,
  Bot,
  Box,
  Cloud,
  FileCode2,
  FileJson,
  Globe,
  KeyRound,
  Layers,
  Mail,
  MessageSquare,
  Radio,
  Rocket,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Sliders,
  Terminal,
  Workflow,
  Wrench,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { cn } from "@/lib/utils";
import { type NavItem, navItems } from "./docs-nav";

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive
    className={cn(
      "flex h-full w-full flex-col overflow-hidden rounded-xl bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50",
      className
    )}
    ref={ref}
    {...props}
  />
));
Command.displayName = CommandPrimitive.displayName;

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Input
    className={cn(
      "mb-4 flex h-12 w-full border-zinc-200 border-b border-none bg-transparent px-4 py-3 text-[17px] outline-none placeholder:text-zinc-500 dark:border-zinc-800 dark:placeholder:text-zinc-400",
      className
    )}
    ref={ref}
    {...props}
  />
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    className={cn(
      "max-h-[400px] overflow-y-auto overflow-x-hidden pb-2",
      className
    )}
    ref={ref}
    {...props}
  />
));
CommandList.displayName = CommandPrimitive.List.displayName;

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    className="flex h-12 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400"
    ref={ref}
    {...props}
  />
));
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    className={cn(
      "not-first:mt-2 overflow-hidden px-2 **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-2 **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:text-zinc-500 dark:**:[[cmdk-group-heading]]:text-zinc-400",
      className
    )}
    ref={ref}
    {...props}
  />
));
CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    className={cn(
      "relative flex min-h-12 cursor-pointer select-none items-center gap-2 rounded-lg px-4 py-2 text-sm text-zinc-700 outline-none transition-colors data-[disabled=true]:pointer-events-none data-[selected=true]:bg-zinc-100 data-[selected=true]:text-zinc-900 data-[disabled=true]:opacity-50 dark:text-zinc-300 dark:data-[selected=true]:bg-zinc-800 dark:data-[selected=true]:text-zinc-100 [&+[cmdk-item]]:mt-1",
      className
    )}
    ref={ref}
    {...props}
  />
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

type SearchItem = {
  title: string;
  description: string;
  url: string;
  group: string;
  icon?: React.ComponentType<{ className?: string }>;
};

type CommandSearchProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CommandSearch({ open, onOpenChange }: CommandSearchProps) {
  const router = useRouter();
  const commandRef = React.useRef<HTMLDivElement>(null);

  const searchItems: SearchItem[] = [
    // Getting Started
    {
      title: "Introduction",
      description: "Overview of Wraps and how it works",
      url: "/docs",
      group: "Getting Started",
      icon: Rocket,
    },
    {
      title: "Quickstart",
      description: "Pick a service and start deploying",
      url: "/docs/quickstart",
      group: "Getting Started",
      icon: Rocket,
    },
    {
      title: "Cookbook",
      description: "Common recipes and usage patterns",
      url: "/docs/cookbook",
      group: "Getting Started",
      icon: FileCode2,
    },

    // Platform
    {
      title: "Platform Quickstart",
      description: "Connect your AWS account to the dashboard",
      url: "/docs/quickstart/platform",
      group: "Platform",
      icon: Rocket,
    },
    {
      title: "Platform SDK Reference",
      description: "Client SDK for dashboard and API access",
      url: "/docs/client-sdk-reference",
      group: "Platform",
      icon: Blocks,
    },
    {
      title: "Platform CLI Commands",
      description: "connect, status, and account management",
      url: "/docs/cli-reference/platform",
      group: "Platform",
      icon: Terminal,
    },

    // Email
    {
      title: "Email Quickstart",
      description: "Deploy SES and send your first email",
      url: "/docs/quickstart/email",
      group: "Email",
      icon: Rocket,
    },
    {
      title: "Email + Next.js",
      description: "Send email from Next.js server actions",
      url: "/docs/quickstart/email/nextjs",
      group: "Email",
      icon: Rocket,
    },
    {
      title: "Email + Express",
      description: "Send email from an Express API",
      url: "/docs/quickstart/email/express",
      group: "Email",
      icon: Rocket,
    },
    {
      title: "Email + Remix",
      description: "Send email from Remix loaders and actions",
      url: "/docs/quickstart/email/remix",
      group: "Email",
      icon: Rocket,
    },
    {
      title: "Inbound Email",
      description: "Receive and process incoming email",
      url: "/docs/quickstart/email/inbound",
      group: "Email",
      icon: Mail,
    },
    {
      title: "Email Templates",
      description: "Build and manage reusable email templates",
      url: "/docs/quickstart/email/templates",
      group: "Email",
      icon: FileCode2,
    },
    {
      title: "Email Workflows",
      description: "Automate multi-step email sequences",
      url: "/docs/quickstart/email/workflows",
      group: "Email",
      icon: Workflow,
    },
    {
      title: "TypeScript Email SDK",
      description: "send, batch, templates, and tracking APIs",
      url: "/docs/sdk-reference",
      group: "Email",
      icon: Mail,
    },
    {
      title: "Python Email SDK",
      description: "send, attachments, templates, and suppression from Python",
      url: "/docs/python-sdk-reference",
      group: "Email",
      icon: FileCode2,
    },
    {
      title: "Email CLI Commands",
      description: "init, status, verify, doctor, domains, templates",
      url: "/docs/cli-reference/email",
      group: "Email",
      icon: Terminal,
    },
    {
      title: "Email Infrastructure",
      description: "SES, DKIM, SPF, and deployed resources",
      url: "/docs/infrastructure/email",
      group: "Email",
      icon: Server,
    },
    {
      title: "Domain Verification",
      description: "Verify domains with DNS records for sending",
      url: "/docs/guides/domain-verification",
      group: "Email",
      icon: Globe,
    },
    {
      title: "Production Access",
      description: "Move SES out of sandbox for real sending",
      url: "/docs/guides/production-access",
      group: "Email",
      icon: ShieldCheck,
    },
    {
      title: "SMTP Credentials",
      description: "Generate SMTP credentials for legacy apps",
      url: "/docs/guides/smtp",
      group: "Email",
      icon: KeyRound,
    },
    {
      title: "Webhooks",
      description: "Track bounces, deliveries, and opens",
      url: "/docs/guides/webhooks",
      group: "Email",
      icon: Zap,
    },
    {
      title: "Templates Guide",
      description: "Create, edit, and deploy email templates",
      url: "/docs/guides/templates",
      group: "Email",
      icon: FileCode2,
    },
    {
      title: "Workflows Guide",
      description: "Build automated email sequences and drips",
      url: "/docs/guides/workflows",
      group: "Email",
      icon: Workflow,
    },
    {
      title: "Configuration Presets",
      description: "Pre-built configs for common setups",
      url: "/docs/guides/configuration-presets",
      group: "Email",
      icon: Sliders,
    },

    // SMS
    {
      title: "SMS Quickstart",
      description: "Deploy SMS infrastructure and send texts",
      url: "/docs/quickstart/sms",
      group: "SMS",
      icon: Rocket,
    },
    {
      title: "SMS SDK Reference",
      description: "send, batch, opt-out, and number APIs",
      url: "/docs/sms-sdk-reference",
      group: "SMS",
      icon: MessageSquare,
    },
    {
      title: "SMS CLI Commands",
      description: "init, status, numbers, and opt-out management",
      url: "/docs/cli-reference/sms",
      group: "SMS",
      icon: Terminal,
    },
    {
      title: "SMS Infrastructure",
      description: "Pinpoint, numbers, and deployed resources",
      url: "/docs/infrastructure/sms",
      group: "SMS",
      icon: Server,
    },

    // CDN
    {
      title: "CDN Quickstart",
      description: "Deploy S3 + CloudFront for static assets",
      url: "/docs/quickstart/cdn",
      group: "CDN",
      icon: Rocket,
    },
    {
      title: "CDN CLI Commands",
      description: "init, deploy, invalidate, and status",
      url: "/docs/cli-reference/cdn",
      group: "CDN",
      icon: Terminal,
    },
    {
      title: "CDN Infrastructure",
      description: "S3 buckets, CloudFront, and distributions",
      url: "/docs/infrastructure/cdn",
      group: "CDN",
      icon: Server,
    },

    // Reference
    {
      title: "API Reference",
      description: "REST API endpoints and authentication",
      url: "/docs/reference/api",
      group: "Reference",
      icon: FileCode2,
    },
    {
      title: "CLI Overview",
      description: "Install, configure, and global options",
      url: "/docs/cli-reference",
      group: "Reference",
      icon: Terminal,
    },
    {
      title: "Error Codes",
      description: "All error codes and troubleshooting steps",
      url: "/docs/reference/errors",
      group: "Reference",
      icon: AlertTriangle,
    },
    {
      title: "Rate Limits",
      description: "API and CLI rate limits by plan",
      url: "/docs/reference/rate-limits",
      group: "Reference",
      icon: ShieldCheck,
    },
    {
      title: "Environment Variables",
      description: "All supported env vars and defaults",
      url: "/docs/reference/environment-variables",
      group: "Reference",
      icon: Settings,
    },
    {
      title: "JSON Output",
      description: "Machine-readable output for CI/CD scripts",
      url: "/docs/reference/json-output",
      group: "Reference",
      icon: FileJson,
    },
    {
      title: "EventBridge Events",
      description: "Event schemas for email and SMS hooks",
      url: "/docs/infrastructure/events",
      group: "Reference",
      icon: Zap,
    },
    {
      title: "Telemetry",
      description: "What data is collected and how to opt out",
      url: "/docs/telemetry",
      group: "Reference",
      icon: BarChart3,
    },

    // Resources
    {
      title: "AWS Setup",
      description: "Configure your AWS account for Wraps",
      url: "/docs/guides/aws-setup",
      group: "Resources",
      icon: Cloud,
    },
    {
      title: "AWS Quick Setup",
      description: "Minimal AWS config to get started fast",
      url: "/docs/guides/aws-setup/quick",
      group: "Resources",
      icon: Cloud,
    },
    {
      title: "AWS Full Setup",
      description: "Complete AWS account configuration",
      url: "/docs/guides/aws-setup/full",
      group: "Resources",
      icon: Cloud,
    },
    {
      title: "IAM Permissions",
      description: "Required IAM policies and least privilege",
      url: "/docs/guides/aws-setup/permissions",
      group: "Resources",
      icon: Cloud,
    },
    {
      title: "AWS Troubleshooting",
      description: "Fix common AWS credential and access issues",
      url: "/docs/guides/aws-setup/troubleshooting",
      group: "Resources",
      icon: Cloud,
    },
    {
      title: "Auth Commands",
      description: "Login, logout, and session management",
      url: "/docs/cli-reference/auth",
      group: "Resources",
      icon: KeyRound,
    },
    {
      title: "AWS Commands",
      description: "Configure and manage AWS connections",
      url: "/docs/cli-reference/aws",
      group: "Resources",
      icon: Cloud,
    },
    {
      title: "Vercel Setup",
      description: "Deploy Wraps with Vercel integration",
      url: "/docs/guides/vercel-setup",
      group: "Resources",
      icon: Rocket,
    },
    {
      title: "Custom Events",
      description: "Define and emit custom tracking events",
      url: "/docs/guides/custom-events",
      group: "Resources",
      icon: Radio,
    },
    {
      title: "Orchestration",
      description: "Coordinate multi-service deployments",
      url: "/docs/guides/orchestration",
      group: "Resources",
      icon: Layers,
    },
    {
      title: "Migration Guide",
      description: "Migrate from SendGrid, Postmark, or Resend",
      url: "/docs/guides/migration",
      group: "Resources",
      icon: ArrowRightLeft,
    },
    {
      title: "Context7 (AI Docs)",
      description: "Use Wraps docs with AI coding assistants",
      url: "/docs/guides/context7",
      group: "Resources",
      icon: Bot,
    },
    {
      title: "CDK Construct",
      description: "AWS CDK construct for Wraps infrastructure",
      url: "/docs/cdk-reference",
      group: "Resources",
      icon: Layers,
    },
    {
      title: "Pulumi Component",
      description: "Pulumi component for Wraps infrastructure",
      url: "/docs/pulumi-reference",
      group: "Resources",
      icon: Box,
    },

    // Tools & Pages
    {
      title: "SES Pricing Calculator",
      description: "Estimate your AWS SES costs by volume",
      url: "/tools/ses-calculator",
      group: "Tools",
      icon: Wrench,
    },
    {
      title: "SPF Record Builder",
      description: "Generate valid SPF DNS records",
      url: "/tools/spf-builder",
      group: "Tools",
      icon: Wrench,
    },
    {
      title: "Infrastructure Overview",
      description: "All deployed resources across services",
      url: "/docs/infrastructure",
      group: "Reference",
      icon: Server,
    },
  ];

  // Auto-append any docs-nav route not already curated above, so the palette
  // can never drift out of sync with the sidebar. Curated entries keep their
  // rich descriptions; derived entries are still matchable by title and section.
  const curatedUrls = new Set(searchItems.map((item) => item.url));
  const flattenNav = (
    items: NavItem[],
    group: string,
    fallbackIcon: React.ComponentType<{ className?: string }>
  ): SearchItem[] =>
    items.flatMap((item) => {
      const icon = item.icon ?? fallbackIcon;
      const self: SearchItem[] =
        curatedUrls.has(item.href) || item.disabled
          ? []
          : [
              {
                title: item.title,
                description: "",
                url: item.href,
                group,
                icon,
              },
            ];
      const children = item.children
        ? flattenNav(item.children, group, icon)
        : [];
      return [...self, ...children];
    });
  const derivedItems = navItems.flatMap((section) =>
    flattenNav(section.items, section.title, FileCode2)
  );
  const allItems = [...searchItems, ...derivedItems];

  const groupedItems = allItems.reduce(
    (acc, item) => {
      if (!acc[item.group]) {
        acc[item.group] = [];
      }
      acc[item.group].push(item);
      return acc;
    },
    {} as Record<string, SearchItem[]>
  );

  const handleSelect = (url: string) => {
    router.push(url);
    onOpenChange(false);
    // Bounce effect like Vercel
    if (commandRef.current) {
      commandRef.current.style.transform = "scale(0.96)";
      setTimeout(() => {
        if (commandRef.current) {
          commandRef.current.style.transform = "";
        }
      }, 100);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-[640px] overflow-hidden border border-zinc-200 p-0 shadow-2xl dark:border-zinc-800">
        <DialogTitle className="sr-only">Command Search</DialogTitle>
        <Command
          className="transition-transform duration-100 ease-out"
          ref={commandRef}
        >
          <CommandInput autoFocus placeholder="What do you need?" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            {Object.entries(groupedItems).map(([group, items]) => (
              <CommandGroup heading={group} key={group}>
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem
                      key={item.url}
                      keywords={[
                        item.title,
                        item.description,
                        item.group,
                      ].filter(Boolean)}
                      onSelect={() => handleSelect(item.url)}
                      value={item.url}
                    >
                      {Icon && (
                        <Icon className="mr-2 h-4 w-4 shrink-0 self-start mt-0.5" />
                      )}
                      <div className="flex min-w-0 flex-col">
                        <span>{item.title}</span>
                        <span className="line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
                          {item.description}
                        </span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export function SearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="relative inline-flex h-8 w-full items-center justify-start gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 py-1 font-medium text-muted-foreground text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 sm:pr-12 md:w-36 lg:w-56"
      onClick={onClick}
    >
      <Search className="mr-2 h-3.5 w-3.5" />
      <span className="hidden lg:inline-flex">Search...</span>
      <span className="inline-flex lg:hidden">Search...</span>
      <kbd className="pointer-events-none absolute top-1.5 right-1.5 hidden h-4 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium font-mono text-[10px] opacity-100 sm:flex">
        <span className="text-xs">⌘</span>K
      </kbd>
    </button>
  );
}
