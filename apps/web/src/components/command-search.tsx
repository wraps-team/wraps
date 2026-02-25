"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Command as CommandPrimitive } from "cmdk";
import {
  BarChart3,
  Building2,
  Cloud,
  CreditCard,
  FilePlus,
  FileText,
  Filter,
  GitBranch,
  Key,
  Loader2,
  type LucideIcon,
  Mail,
  Palette,
  Search,
  Send,
  SendHorizontal,
  Settings,
  Shield,
  Tag,
  UserPlus,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import {
  type ComponentPropsWithoutRef,
  type ElementRef,
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { getContact } from "@/actions/contacts";
import type { SearchEntityType, SearchResultItem } from "@/actions/search";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useActiveOrganization } from "@/contexts/organization-context";
import { useCommandSearch } from "@/hooks/use-command-search";
import { useRecentItems } from "@/hooks/use-recent-items";
import { cn } from "@/lib/utils";

// ─── Styled cmdk wrappers ────────────────────────────────────────────

const Command = forwardRef<
  ElementRef<typeof CommandPrimitive>,
  ComponentPropsWithoutRef<typeof CommandPrimitive>
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

const CommandInput = forwardRef<
  ElementRef<typeof CommandPrimitive.Input>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Input> & {
    isLoading?: boolean;
  }
>(({ className, isLoading, ...props }, ref) => (
  <div className="relative flex items-center border-zinc-200 border-b px-4 dark:border-zinc-800">
    {isLoading ? (
      <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin text-zinc-400" />
    ) : (
      <Search className="mr-2 h-4 w-4 shrink-0 text-zinc-400" />
    )}
    <CommandPrimitive.Input
      className={cn(
        "flex h-12 w-full bg-transparent py-3 text-[17px] outline-none placeholder:text-zinc-500 dark:placeholder:text-zinc-400",
        className
      )}
      ref={ref}
      {...props}
    />
  </div>
));
CommandInput.displayName = CommandPrimitive.Input.displayName;

const CommandList = forwardRef<
  ElementRef<typeof CommandPrimitive.List>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.List>
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

const CommandEmpty = forwardRef<
  ElementRef<typeof CommandPrimitive.Empty>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    className="flex h-12 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400"
    ref={ref}
    {...props}
  />
));
CommandEmpty.displayName = CommandPrimitive.Empty.displayName;

const CommandGroup = forwardRef<
  ElementRef<typeof CommandPrimitive.Group>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    className={cn(
      "overflow-hidden px-2 [&:not(:first-child)]:mt-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-zinc-500 dark:[&_[cmdk-group-heading]]:text-zinc-400",
      className
    )}
    ref={ref}
    {...props}
  />
));
CommandGroup.displayName = CommandPrimitive.Group.displayName;

const CommandItem = forwardRef<
  ElementRef<typeof CommandPrimitive.Item>,
  ComponentPropsWithoutRef<typeof CommandPrimitive.Item> & {
    shortcut?: string;
  }
>(({ className, shortcut, children, ...props }, ref) => (
  <CommandPrimitive.Item
    className={cn(
      "relative flex h-12 cursor-pointer select-none items-center gap-2 rounded-lg px-4 text-sm text-zinc-700 outline-none transition-colors data-[disabled=true]:pointer-events-none data-[selected=true]:bg-zinc-100 data-[selected=true]:text-zinc-900 data-[disabled=true]:opacity-50 dark:text-zinc-300 dark:data-[selected=true]:bg-zinc-800 dark:data-[selected=true]:text-zinc-100 [&+[cmdk-item]]:mt-1",
      className
    )}
    ref={ref}
    {...props}
  >
    {children}
    {shortcut && (
      <kbd className="pointer-events-none ml-auto hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium font-mono text-[10px] opacity-100 sm:flex">
        {shortcut}
      </kbd>
    )}
  </CommandPrimitive.Item>
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

// ─── Entity type config ──────────────────────────────────────────────

const ENTITY_CONFIG: Record<
  SearchEntityType,
  { label: string; icon: LucideIcon }
> = {
  contact: { label: "Contacts", icon: Users },
  template: { label: "Templates", icon: FileText },
  broadcast: { label: "Broadcasts", icon: Send },
  workflow: { label: "Automations", icon: GitBranch },
  segment: { label: "Segments", icon: Filter },
  topic: { label: "Topics", icon: Tag },
  brandKit: { label: "Brand Kits", icon: Palette },
};

function getStatusStyle(status: string | null): string | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s === "draft")
    return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
  if (s === "published" || s === "enabled" || s === "completed")
    return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  if (s === "archived" || s === "paused")
    return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  if (s === "scheduled")
    return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  if (s === "default")
    return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400";
  if (s === "failed")
    return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
  return null;
}

// ─── Static navigation items ─────────────────────────────────────────

type StaticItem = {
  title: string;
  url: string;
  group: string;
  icon?: LucideIcon;
  shortcut?: string;
  keywords?: string[];
};

// ─── CommandSearch ────────────────────────────────────────────────────

type CommandSearchProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CommandSearch({ open, onOpenChange }: CommandSearchProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const commandRef = useRef<HTMLDivElement>(null);
  const { activeOrganization } = useActiveOrganization();
  const hasTrackedSearch = useRef(false);

  const orgSlug = activeOrganization?.slug;
  const orgId = activeOrganization?.id;

  const { inputValue, setInputValue, results, isSearching, isServerMode } =
    useCommandSearch(orgId);
  const { recentItems, addRecentItem } = useRecentItems(orgId);

  // Reset input when dialog closes
  useEffect(() => {
    if (!open) {
      setInputValue("");
      hasTrackedSearch.current = false;
    }
  }, [open, setInputValue]);

  // Track search when entering server mode
  useEffect(() => {
    if (isServerMode && !hasTrackedSearch.current) {
      hasTrackedSearch.current = true;
      posthog.capture("cmd_k_searched");
    }
  }, [isServerMode]);

  // Build static items
  const staticItems: StaticItem[] = useMemo(() => {
    const items: StaticItem[] = [];
    if (orgSlug) {
      items.push(
        {
          title: "Emails",
          url: `/${orgSlug}/emails`,
          group: "Navigation",
          icon: Mail,
          shortcut: "G E",
          keywords: ["inbox", "sent", "messages"],
        },
        {
          title: "Templates",
          url: `/${orgSlug}/emails/templates`,
          group: "Navigation",
          icon: FileText,
          shortcut: "G T",
          keywords: ["email templates", "editor"],
        },
        {
          title: "Analytics",
          url: `/${orgSlug}/emails/analytics`,
          group: "Navigation",
          icon: BarChart3,
          shortcut: "G A",
          keywords: ["metrics", "stats", "dashboard", "reports"],
        }
      );
    }
    if (orgSlug) {
      items.push(
        {
          title: "General Settings",
          url: `/${orgSlug}/settings`,
          group: "Settings",
          icon: Building2,
          shortcut: "G S",
          keywords: ["org", "workspace", "organization"],
        },
        {
          title: "AWS Accounts",
          url: `/${orgSlug}/settings/aws-accounts`,
          group: "Settings",
          icon: Cloud,
          keywords: ["amazon", "ses", "infrastructure", "connect"],
        },
        {
          title: "API Keys",
          url: `/${orgSlug}/settings/api-keys`,
          group: "Settings",
          icon: Key,
          keywords: ["developer", "access", "token"],
        },
        {
          title: "Team Members",
          url: `/${orgSlug}/settings/members`,
          group: "Settings",
          icon: Users,
          keywords: ["invite", "permissions", "roles"],
        },
        {
          title: "Billing",
          url: `/${orgSlug}/settings/billing`,
          group: "Settings",
          icon: CreditCard,
          keywords: ["subscription", "plan", "payment"],
        }
      );
    }
    items.push(
      {
        title: "Security",
        url: "/settings/security",
        group: "Account",
        icon: Shield,
        keywords: ["password", "2fa", "passkey", "sessions"],
      },
      {
        title: "Account Settings",
        url: "/settings/account",
        group: "Account",
        icon: Settings,
        keywords: ["delete", "preferences"],
      }
    );
    return items;
  }, [orgSlug]);

  const groupedStatic = useMemo(() => {
    const groups: Record<string, StaticItem[]> = {};
    for (const item of staticItems) {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    }
    return groups;
  }, [staticItems]);

  // Quick actions
  const quickActions = useMemo(() => {
    if (!orgSlug) return [];
    return [
      {
        title: "New Contact",
        url: `/${orgSlug}/contacts?new=true`,
        icon: UserPlus,
      },
      {
        title: "New Template",
        url: `/${orgSlug}/emails/templates?new=true`,
        icon: FilePlus,
      },
      {
        title: "New Broadcast",
        url: `/${orgSlug}/emails/broadcasts?new=true`,
        icon: SendHorizontal,
      },
      {
        title: "New Automation",
        url: `/${orgSlug}/automations?new=true`,
        icon: GitBranch,
      },
    ];
  }, [orgSlug]);

  const handleSelect = useCallback(
    (url: string, item?: SearchResultItem) => {
      // Prefetch contact data so the detail sheet opens instantly
      if (item?.type === "contact" && orgId) {
        queryClient.prefetchQuery({
          queryKey: ["contact", "detail", item.id],
          queryFn: () =>
            getContact(item.id, orgId).then((r) =>
              r.success ? r.contact : null
            ),
          staleTime: 30_000,
        });
      }
      router.push(url);
      onOpenChange(false);
      if (item) {
        addRecentItem(item);
        posthog.capture("cmd_k_selected", {
          type: item.type,
          id: item.id,
        });
      }
      // Bounce effect
      if (commandRef.current) {
        commandRef.current.style.transform = "scale(0.96)";
        setTimeout(() => {
          if (commandRef.current) {
            commandRef.current.style.transform = "";
          }
        }, 100);
      }
    },
    [router, onOpenChange, addRecentItem, orgId, queryClient]
  );

  // Count total server results
  const totalResults = isServerMode
    ? Object.values(results).reduce((sum, arr) => sum + arr.length, 0)
    : 0;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-[640px] overflow-hidden border border-zinc-200 p-0 shadow-2xl dark:border-zinc-800">
        <DialogTitle className="sr-only">Command Search</DialogTitle>
        <Command
          className="transition-transform duration-100 ease-out"
          ref={commandRef}
          shouldFilter={!isServerMode}
        >
          <CommandInput
            autoFocus
            isLoading={isSearching}
            onValueChange={setInputValue}
            placeholder="Search everything..."
            value={inputValue}
          />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>

            {isServerMode ? (
              // ── Server results ──
              (
                Object.entries(results) as [
                  SearchEntityType,
                  SearchResultItem[],
                ][]
              ).map(([type, items]) => {
                if (items.length === 0) return null;
                const config = ENTITY_CONFIG[type];
                const GroupIcon = config.icon;
                return (
                  <CommandGroup heading={config.label} key={type}>
                    {items.map((item) => (
                      <CommandItem
                        key={item.id}
                        onSelect={() => handleSelect(item.url, item)}
                        value={`${item.title} ${item.subtitle ?? ""}`}
                      >
                        <GroupIcon className="mr-2 h-4 w-4 shrink-0 text-zinc-400" />
                        <span className="truncate">{item.title}</span>
                        {item.subtitle && (
                          <span className="ml-1 truncate text-zinc-400 text-xs">
                            {item.subtitle}
                          </span>
                        )}
                        {item.status && <StatusBadge status={item.status} />}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })
            ) : (
              // ── Client mode ──
              <>
                {/* Recent Items */}
                {recentItems.length > 0 && (
                  <CommandGroup heading="Recent">
                    {recentItems.map((item) => {
                      const config = ENTITY_CONFIG[item.type];
                      const Icon = config.icon;
                      return (
                        <CommandItem
                          key={`recent-${item.id}`}
                          onSelect={() => handleSelect(item.url, item)}
                          value={`recent ${item.title}`}
                        >
                          <Icon className="mr-2 h-4 w-4 shrink-0 text-zinc-400" />
                          <span className="truncate">{item.title}</span>
                          {item.subtitle && (
                            <span className="ml-1 truncate text-zinc-400 text-xs">
                              {item.subtitle}
                            </span>
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}

                {/* Quick Actions */}
                {quickActions.length > 0 && (
                  <CommandGroup heading="Quick Actions">
                    {quickActions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <CommandItem
                          key={action.url}
                          keywords={[action.title.toLowerCase()]}
                          onSelect={() => handleSelect(action.url)}
                          value={action.title}
                        >
                          <Icon className="mr-2 h-4 w-4" />
                          {action.title}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}

                {/* Navigation / Settings / Account */}
                {Object.entries(groupedStatic).map(([group, items]) => (
                  <CommandGroup heading={group} key={group}>
                    {items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <CommandItem
                          key={item.url}
                          keywords={item.keywords}
                          onSelect={() => handleSelect(item.url)}
                          shortcut={item.shortcut}
                          value={item.title}
                        >
                          {Icon && <Icon className="mr-2 h-4 w-4" />}
                          {item.title}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ))}
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style = getStatusStyle(status);
  if (!style) return null;
  return (
    <span
      className={cn(
        "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
        style
      )}
    >
      {status.toLowerCase()}
    </span>
  );
}

export function SearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="relative inline-flex h-8 w-full items-center justify-start gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 py-1 font-medium text-muted-foreground text-sm shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 sm:pr-12 md:w-36 lg:w-56"
      onClick={onClick}
      type="button"
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
