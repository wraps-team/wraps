"use client";

import { Command as CommandPrimitive } from "cmdk";
import {
  AlertTriangle,
  Bell,
  Calendar,
  CheckSquare,
  CreditCard,
  HelpCircle,
  LayoutDashboard,
  LayoutPanelLeft,
  Link2,
  type LucideIcon,
  Mail,
  MessageCircle,
  Palette,
  Search,
  Settings,
  Shield,
  User,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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
      "overflow-hidden px-2 [&:not(:first-child)]:mt-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-zinc-500 dark:[&_[cmdk-group-heading]]:text-zinc-400",
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
      "relative flex h-12 cursor-pointer select-none items-center gap-2 rounded-lg px-4 text-sm text-zinc-700 outline-none transition-colors data-[disabled=true]:pointer-events-none data-[selected=true]:bg-zinc-100 data-[selected=true]:text-zinc-900 data-[disabled=true]:opacity-50 dark:text-zinc-300 dark:data-[selected=true]:bg-zinc-800 dark:data-[selected=true]:text-zinc-100 [&+[cmdk-item]]:mt-1",
      className
    )}
    ref={ref}
    {...props}
  />
));
CommandItem.displayName = CommandPrimitive.Item.displayName;

type SearchItem = {
  title: string;
  url: string;
  group: string;
  icon?: LucideIcon;
};

type CommandSearchProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CommandSearch({ open, onOpenChange }: CommandSearchProps) {
  const router = useRouter();
  const commandRef = React.useRef<HTMLDivElement>(null);

  const searchItems: SearchItem[] = [
    // Dashboards
    {
      title: "Dashboard 1",
      url: "/dashboard",
      group: "Dashboards",
      icon: LayoutDashboard,
    },
    {
      title: "Dashboard 2",
      url: "/dashboard-2",
      group: "Dashboards",
      icon: LayoutPanelLeft,
    },

    // Apps
    { title: "Mail", url: "/mail", group: "Apps", icon: Mail },
    { title: "Tasks", url: "/tasks", group: "Apps", icon: CheckSquare },
    { title: "Chat", url: "/chat", group: "Apps", icon: MessageCircle },
    { title: "Calendar", url: "/calendar", group: "Apps", icon: Calendar },

    // Auth Pages
    {
      title: "Sign In 1",
      url: "/auth/sign-in",
      group: "Auth Pages",
      icon: Shield,
    },
    {
      title: "Sign In 2",
      url: "/auth/sign-in-2",
      group: "Auth Pages",
      icon: Shield,
    },
    {
      title: "Sign Up 1",
      url: "/auth/sign-up",
      group: "Auth Pages",
      icon: Shield,
    },
    {
      title: "Sign Up 2",
      url: "/auth/sign-up-2",
      group: "Auth Pages",
      icon: Shield,
    },
    {
      title: "Forgot Password 1",
      url: "/auth/forgot-password",
      group: "Auth Pages",
      icon: Shield,
    },
    {
      title: "Forgot Password 2",
      url: "/auth/forgot-password-2",
      group: "Auth Pages",
      icon: Shield,
    },

    // Errors
    {
      title: "Unauthorized",
      url: "/errors/unauthorized",
      group: "Errors",
      icon: AlertTriangle,
    },
    {
      title: "Forbidden",
      url: "/errors/forbidden",
      group: "Errors",
      icon: AlertTriangle,
    },
    {
      title: "Not Found",
      url: "/errors/not-found",
      group: "Errors",
      icon: AlertTriangle,
    },
    {
      title: "Internal Server Error",
      url: "/errors/internal-server-error",
      group: "Errors",
      icon: AlertTriangle,
    },
    {
      title: "Under Maintenance",
      url: "/errors/under-maintenance",
      group: "Errors",
      icon: AlertTriangle,
    },

    // Settings
    {
      title: "User Settings",
      url: "/settings/user",
      group: "Settings",
      icon: User,
    },
    {
      title: "Account Settings",
      url: "/settings/account",
      group: "Settings",
      icon: Settings,
    },
    {
      title: "Plans & Billing",
      url: "/settings/billing",
      group: "Settings",
      icon: CreditCard,
    },
    {
      title: "Appearance",
      url: "/settings/appearance",
      group: "Settings",
      icon: Palette,
    },
    {
      title: "Notifications",
      url: "/settings/notifications",
      group: "Settings",
      icon: Bell,
    },
    {
      title: "Connections",
      url: "/settings/connections",
      group: "Settings",
      icon: Link2,
    },

    // Pages
    { title: "FAQs", url: "/faqs", group: "Pages", icon: HelpCircle },
    { title: "Pricing", url: "/pricing", group: "Pages", icon: CreditCard },
  ];

  const groupedItems = searchItems.reduce(
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
                      onSelect={() => handleSelect(item.url)}
                      value={item.title}
                    >
                      {Icon && <Icon className="mr-2 h-4 w-4" />}
                      {item.title}
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
