"use client";

import {
  AlertCircle,
  Archive,
  ArchiveX,
  File,
  Inbox,
  MessagesSquare,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  Users2,
} from "lucide-react";
import * as React from "react";
import { AccountSwitcher } from "@/app/mail/components/account-switcher";
import { MailDisplay } from "@/app/mail/components/mail-display";
import { MailList } from "@/app/mail/components/mail-list";
import { Nav } from "@/app/mail/components/nav";
import type { Mail } from "@/app/mail/data";
import { useMail } from "@/app/mail/use-mail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface MailProps {
  accounts: {
    label: string;
    email: string;
    icon: React.ReactNode;
  }[];
  mails: Mail[];
  defaultLayout?: number[];
  defaultCollapsed?: boolean;
  navCollapsedSize: number;
}

export function Mail({
  accounts,
  mails,
  defaultLayout = [20, 32, 48],
  defaultCollapsed = false,
  navCollapsedSize,
}: MailProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(defaultCollapsed);
  const [mail] = useMail();

  return (
    <TooltipProvider delayDuration={0}>
      <ResizablePanelGroup
        className="h-full items-stretch overflow-hidden rounded-lg border"
        direction="horizontal"
        onLayout={(sizes: number[]) => {
          document.cookie = `react-resizable-panels:layout:mail=${JSON.stringify(sizes)}`;
        }}
      >
        <ResizablePanel
          className={cn(
            isCollapsed && "w-full transition-all duration-300 ease-in-out"
          )}
          collapsedSize={navCollapsedSize}
          collapsible={true}
          defaultSize={defaultLayout[0]}
          maxSize={20}
          minSize={15}
          onCollapse={() => {
            setIsCollapsed(true);
            document.cookie = `react-resizable-panels:collapsed=${JSON.stringify(true)}`;
          }}
          onResize={() => {
            setIsCollapsed(false);
            document.cookie = `react-resizable-panels:collapsed=${JSON.stringify(false)}`;
          }}
        >
          <div
            className={cn(
              "flex h-[52px] items-center justify-center",
              isCollapsed ? "h-[52px]" : "px-2"
            )}
          >
            <AccountSwitcher accounts={accounts} isCollapsed={isCollapsed} />
          </div>
          <Separator className="mx-0" />
          <div className="m-3">
            <Button className="w-full cursor-pointer">
              {isCollapsed ? "" : "Compose"}
              <Send className="size-4" />
            </Button>
          </div>
          <Separator className="mx-0" />
          <Nav
            isCollapsed={isCollapsed}
            links={[
              {
                title: "Inbox",
                label: "128",
                icon: Inbox,
                variant: "default",
              },
              {
                title: "Drafts",
                label: "9",
                icon: File,
                variant: "ghost",
              },
              {
                title: "Sent",
                label: "",
                icon: Send,
                variant: "ghost",
              },
              {
                title: "Junk",
                label: "23",
                icon: ArchiveX,
                variant: "ghost",
              },
              {
                title: "Trash",
                label: "",
                icon: Trash2,
                variant: "ghost",
              },
              {
                title: "Archive",
                label: "",
                icon: Archive,
                variant: "ghost",
              },
            ]}
          />
          <Separator className="mx-0" />
          <Nav
            isCollapsed={isCollapsed}
            links={[
              {
                title: "Social",
                label: "972",
                icon: Users2,
                variant: "ghost",
              },
              {
                title: "Updates",
                label: "342",
                icon: AlertCircle,
                variant: "ghost",
              },
              {
                title: "Forums",
                label: "128",
                icon: MessagesSquare,
                variant: "ghost",
              },
              {
                title: "Shopping",
                label: "8",
                icon: ShoppingCart,
                variant: "ghost",
              },
              {
                title: "Promotions",
                label: "21",
                icon: Archive,
                variant: "ghost",
              },
            ]}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={defaultLayout[1]} minSize={30}>
          <Tabs className="gap-1" defaultValue="all">
            <div className="flex items-center px-4 py-1.5">
              <h1 className="font-bold text-foreground text-xl">Inbox</h1>
              <TabsList className="ml-auto">
                <TabsTrigger className="cursor-pointer" value="all">
                  All mail
                </TabsTrigger>
                <TabsTrigger className="cursor-pointer" value="unread">
                  Unread
                </TabsTrigger>
              </TabsList>
            </div>
            <Separator />
            <div className="bg-background/95 p-4 backdrop-blur supports-backdrop-filter:bg-background/60">
              <form>
                <div className="relative">
                  <Search className="absolute top-2.5 left-2 size-4 cursor-pointer text-muted-foreground" />
                  <Input className="cursor-text pl-8" placeholder="Search" />
                </div>
              </form>
            </div>
            <TabsContent className="m-0" value="all">
              <MailList items={mails} />
            </TabsContent>
            <TabsContent className="m-0" value="unread">
              <MailList items={mails.filter((item) => !item.read)} />
            </TabsContent>
          </Tabs>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={defaultLayout[2]} minSize={30}>
          <MailDisplay
            mail={mails.find((item) => item.id === mail.selected) || null}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </TooltipProvider>
  );
}
