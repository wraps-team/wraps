"use client";

import {
  Bell,
  BellOff,
  Info,
  MoreVertical,
  Phone,
  Search,
  Users,
  Video,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Conversation, User } from "../use-chat";

type ChatHeaderProps = {
  conversation: Conversation | null;
  users: User[];
  onToggleMute?: () => void;
  onToggleInfo?: () => void;
};

export function ChatHeader({
  conversation,
  users,
  onToggleMute,
  onToggleInfo,
}: ChatHeaderProps) {
  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">
          Select a conversation to start chatting
        </p>
      </div>
    );
  }

  const getConversationUsers = () => {
    if (conversation.type === "direct") {
      return users.filter((user) =>
        conversation.participants.includes(user.id)
      );
    }
    return users.filter((user) => conversation.participants.includes(user.id));
  };

  const conversationUsers = getConversationUsers();
  const primaryUser = conversationUsers[0];

  const getStatusText = () => {
    if (conversation.type === "group") {
      const onlineCount = conversationUsers.filter(
        (user) => user.status === "online"
      ).length;
      return `${conversation.participants.length} members, ${onlineCount} online`;
    }
    if (primaryUser) {
      switch (primaryUser.status) {
        case "online":
          return "Active now";
        case "away":
          return "Away";
        case "offline":
          return `Last seen ${new Date(primaryUser.lastSeen).toLocaleDateString()}`;
        default:
          return "";
      }
    }
    return "";
  };

  const getStatusColor = () => {
    if (conversation.type === "group") {
      return "text-muted-foreground";
    }

    switch (primaryUser?.status) {
      case "online":
        return "text-green-600";
      case "away":
        return "text-yellow-600";
      case "offline":
        return "text-muted-foreground";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <div className="flex h-full items-center justify-between">
      {/* Left side - Avatar and info */}
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10 cursor-pointer">
          <AvatarImage alt={conversation.name} src={conversation.avatar} />
          <AvatarFallback>
            {conversation.type === "group" ? (
              <Users className="h-5 w-5" />
            ) : (
              conversation.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
            )}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-semibold">{conversation.name}</h2>
            {conversation.isMuted && (
              <BellOff className="h-4 w-4 text-muted-foreground" />
            )}
            {conversation.type === "group" && (
              <Badge className="cursor-pointer text-xs" variant="secondary">
                Group
              </Badge>
            )}
          </div>
          <p className={`text-sm ${getStatusColor()}`}>{getStatusText()}</p>
        </div>
      </div>

      {/* Right side - Action buttons */}
      <div className="flex items-center gap-1">
        <TooltipProvider>
          {/* Search */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button className="cursor-pointer" size="icon" variant="ghost">
                <Search className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Search in conversation</p>
            </TooltipContent>
          </Tooltip>

          {/* Phone call */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button className="cursor-pointer" size="icon" variant="ghost">
                <Phone className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Voice call</p>
            </TooltipContent>
          </Tooltip>

          {/* Video call */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button className="cursor-pointer" size="icon" variant="ghost">
                <Video className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Video call</p>
            </TooltipContent>
          </Tooltip>

          {/* Info */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="cursor-pointer"
                onClick={onToggleInfo}
                size="icon"
                variant="ghost"
              >
                <Info className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Conversation info</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* More options */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="cursor-pointer" size="icon" variant="ghost">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="cursor-pointer" onClick={onToggleMute}>
              {conversation.isMuted ? (
                <>
                  <Bell className="mr-2 h-4 w-4" />
                  Unmute conversation
                </>
              ) : (
                <>
                  <BellOff className="mr-2 h-4 w-4" />
                  Mute conversation
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              <Search className="mr-2 h-4 w-4" />
              Search messages
            </DropdownMenuItem>
            {conversation.type === "group" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer">
                  <Users className="mr-2 h-4 w-4" />
                  Manage members
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer text-destructive">
              Delete conversation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
