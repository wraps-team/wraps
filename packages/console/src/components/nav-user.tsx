"use client";

import {
  BadgeCheck,
  Bell,
  ChevronsUpDown,
  CreditCard,
  Moon,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useTheme } from "@/hooks/use-theme";

type UserInfo = {
  accountId: string;
  accountAlias: string;
  region: string;
  provider: string;
  domain: string | null;
  preset: string | null;
};

export function NavUser({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatar: string;
  };
}) {
  const { isMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const [userInfo, setUserInfo] = React.useState<UserInfo | null>(null);
  const [retryCount, setRetryCount] = React.useState(0);

  React.useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        // Wait for token to be available (handle race condition with App.tsx)
        const token = sessionStorage.getItem("wraps-auth-token");
        if (!token) {
          console.log("No auth token found yet, will retry...");
          // Retry after a short delay if we haven't exceeded max retries
          if (retryCount < 5) {
            setTimeout(() => {
              setRetryCount((prev) => prev + 1);
            }, 200);
          }
          return;
        }

        console.log("Fetching user info from /api/user");
        const response = await fetch(`/api/user?token=${token}`);
        console.log("User API response status:", response.status);

        if (response.ok) {
          const data = await response.json();
          console.log("User info received:", data);
          setUserInfo(data);
        } else {
          const errorText = await response.text();
          console.error(
            "Failed to fetch user info:",
            response.status,
            errorText
          );
        }
      } catch (error) {
        console.error("Error fetching user info:", error);
      }
    };

    fetchUserInfo().catch((err) => {
      console.error("Failed to fetch user info:", err);
    });
  }, [retryCount]);

  const handleCloseConsole = () => {
    // biome-ignore lint: User confirmation needed for closing console
    const shouldClose = window.confirm(
      "Are you sure you want to close the console?"
    );
    if (shouldClose) {
      window.close();
    }
  };

  const accountName =
    userInfo?.accountAlias || userInfo?.accountId || "Loading...";
  const regionDisplay = userInfo?.region || "...";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground md:h-8 md:p-0"
              size="lg"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage alt={accountName} src={user.avatar} />
                <AvatarFallback className="rounded-lg bg-orange-500 text-white">
                  AWS
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{accountName}</span>
                <span className="truncate text-xs">{regionDisplay}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage alt={accountName} src={user.avatar} />
                  <AvatarFallback className="rounded-lg bg-orange-500 text-white">
                    AWS
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{accountName}</span>
                  <span className="truncate text-xs">{regionDisplay}</span>
                  {userInfo?.accountId &&
                    userInfo.accountId !== userInfo.accountAlias && (
                      <span className="truncate font-mono text-[10px] text-muted-foreground">
                        {userInfo.accountId}
                      </span>
                    )}
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() =>
                  window.open("https://wraps.dev/pricing", "_blank")
                }
              >
                <Sparkles />
                Upgrade Plan
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() =>
                  window.open("https://wraps.dev/account", "_blank")
                }
              >
                <BadgeCheck />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  window.open("https://wraps.dev/billing", "_blank")
                }
              >
                <CreditCard />
                Billing
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  window.open("https://wraps.dev/changelog", "_blank")
                }
              >
                <Bell />
                Product Updates
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun /> : <Moon />}
              {theme === "dark" ? "Light Mode" : "Dark Mode"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleCloseConsole}>
              <X />
              Close Console
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
