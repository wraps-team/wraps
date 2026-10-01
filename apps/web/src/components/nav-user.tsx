"use client";

import { Avatar, AvatarFallback } from "@wraps/ui/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@wraps/ui/components/ui/dropdown-menu";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { useTheme } from "@wraps/ui/hooks/use-theme";
import {
  CircleUser,
  EllipsisVertical,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useSession } from "@/contexts/session-context";
import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth-client";

export function NavUser() {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const session = useSession();
  const { theme, setTheme } = useTheme();
  const hydrated = useHydrated();
  const user = session.data?.user;

  if (!hydrated || session.isPending) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton className="pointer-events-none" size="lg">
            <Skeleton className="size-8" />
            <div className="grid flex-1 gap-1 text-left">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  if (!user) {
    return null;
  }

  const handleSignOut = async () => {
    try {
      await authClient.signOut();
      toast.success("Signed out successfully");
      router.push("/auth");
    } catch (_error) {
      toast.error("Failed to sign out");
    }
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="group-data-[collapsible=icon]:overflow-visible! cursor-pointer"
              size="lg"
            >
              <Avatar className="size-8">
                <AvatarFallback>
                  {user.name
                    .split(" ")
                    .map((word) => word[0]?.toUpperCase() || "")
                    .join("")
                    .slice(0, 2)}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {user.email}
                </span>
              </div>
              <EllipsisVertical className="ml-auto size-4 group-data-[collapsible=icon]:hidden data-[state=open]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel>
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="size-8">
                  <AvatarFallback>
                    {user.name
                      .split(" ")
                      .map((word) => word[0]?.toUpperCase() || "")
                      .join("")
                      .slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-muted-foreground text-xs">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/settings/account">
                  <CircleUser />
                  Account
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="cursor-pointer">
                <Link href="/settings/security">
                  <ShieldCheck />
                  Security
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer gap-2 [&_svg:not([class*='size-'])]:size-4">
                  {theme === "dark" ? (
                    <Moon />
                  ) : theme === "light" ? (
                    <Sun />
                  ) : (
                    <Monitor />
                  )}
                  Theme
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup
                    onValueChange={(value) =>
                      setTheme(value as "light" | "dark" | "system")
                    }
                    value={theme}
                  >
                    <DropdownMenuRadioItem
                      className="cursor-pointer"
                      value="light"
                    >
                      <Sun />
                      Light
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem
                      className="cursor-pointer"
                      value="dark"
                    >
                      <Moon />
                      Dark
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem
                      className="cursor-pointer"
                      value="system"
                    >
                      <Monitor />
                      System
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer"
              onClick={handleSignOut}
            >
              <LogOut />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
