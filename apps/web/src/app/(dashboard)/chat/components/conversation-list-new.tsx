"use client";

import { format, isThisWeek, isThisYear, isToday, isYesterday } from "date-fns";
import {
  Hash,
  MoreHorizontal,
  Pin,
  Search,
  Users,
  VolumeX,
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { type Conversation, useChat } from "../use-chat";

interface ConversationListProps {
  conversations: Conversation[];
  selectedConversation: string | null;
  onSelectConversation: (conversationId: string) => void;
}

// Enhanced time formatting function
function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);

  if (isToday(date)) {
    return format(date, "h:mm a"); // 3:30 PM
  }
  if (isYesterday(date)) {
    return "Yesterday";
  }
  if (isThisWeek(date)) {
    return format(date, "EEEE"); // Day name
  }
  if (isThisYear(date)) {
    return format(date, "MMM d"); // Jan 15
  }
  return format(date, "dd/MM/yy"); // 15/01/24
}

export function ConversationList({
  conversations,
  selectedConversation,
  onSelectConversation,
}: ConversationListProps) {
  const { searchQuery, setSearchQuery, togglePin, toggleMute } = useChat();

  const filteredConversations = conversations.filter((conversation) =>
    conversation.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedConversations = filteredConversations.sort((a, b) => {
    // Pinned conversations first
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;

    // Then by last message timestamp
    return (
      new Date(b.lastMessage.timestamp).getTime() -
      new Date(a.lastMessage.timestamp).getTime()
    );
  });

  const getOnlineStatus = (conversation: Conversation) => {
    if (
      conversation.type === "direct" &&
      conversation.participants.length === 1
    ) {
      // In a real app, you'd check user online status
      return Math.random() > 0.5; // Mock online status
    }
    return false;
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b p-4">
        <h2 className="font-semibold text-lg">Messages</h2>
      </div>

      {/* Search */}
      <div className="flex-shrink-0 border-b p-4">
        <div className="relative">
          <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 transform text-muted-foreground" />
          <Input
            className="cursor-text pl-9"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            type="text"
            value={searchQuery}
          />
        </div>
      </div>

      {/* Conversations */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {sortedConversations.map((conversation) => (
            <div
              className={cn(
                "group relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-lg p-3 transition-colors hover:bg-accent/50",
                selectedConversation === conversation.id
                  ? "bg-accent text-accent-foreground"
                  : ""
              )}
              key={conversation.id}
              onClick={() => onSelectConversation(conversation.id)}
            >
              {/* Avatar with online indicator */}
              <div className="relative flex-shrink-0">
                <Avatar
                  className={cn(
                    "h-12 w-12",
                    selectedConversation === conversation.id &&
                      "ring-2 ring-background"
                  )}
                >
                  <AvatarImage
                    alt={conversation.name}
                    src={conversation.avatar}
                  />
                  <AvatarFallback className="text-sm">
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

                {/* Online indicator for direct messages */}
                {conversation.type === "direct" &&
                  getOnlineStatus(conversation) && (
                    <div className="-bottom-1 -right-1 absolute h-4 w-4 rounded-full border-2 border-background bg-green-500" />
                  )}

                {/* Group indicator */}
                {conversation.type === "group" && (
                  <div className="-bottom-1 -right-1 absolute flex h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-blue-500">
                    <Hash className="h-2 w-2 text-white" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="mb-1 flex min-w-0 items-center justify-between">
                  <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                    <h3 className="min-w-0 max-w-[180px] truncate font-medium">
                      {conversation.name}
                    </h3>
                    {conversation.isPinned && (
                      <Pin className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                    )}
                    {conversation.isMuted && (
                      <VolumeX className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                    )}
                  </div>
                  <span className="ml-2 flex-shrink-0 whitespace-nowrap text-muted-foreground text-xs">
                    {formatMessageTime(conversation.lastMessage.timestamp)}
                  </span>
                </div>

                <div className="flex min-w-0 items-center justify-between gap-2">
                  <p className="min-w-0 max-w-[200px] flex-1 truncate text-muted-foreground text-sm">
                    {conversation.lastMessage.content}
                  </p>

                  {/* Unread count */}
                  {conversation.unreadCount > 0 && (
                    <Badge
                      className="ml-2 h-5 min-w-[20px] flex-shrink-0 cursor-pointer text-xs"
                      variant="default"
                    >
                      {conversation.unreadCount > 99
                        ? "99+"
                        : conversation.unreadCount}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Actions menu */}
              <div className="ml-2 flex-shrink-0 opacity-0 group-hover:opacity-100">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="h-8 w-8 cursor-pointer p-0"
                      onClick={(e) => e.stopPropagation()}
                      size="sm"
                      variant="ghost"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(conversation.id);
                      }}
                    >
                      <Pin className="mr-2 h-4 w-4" />
                      {conversation.isPinned ? "Unpin" : "Pin"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMute(conversation.id);
                      }}
                    >
                      <VolumeX className="mr-2 h-4 w-4" />
                      {conversation.isMuted ? "Unmute" : "Mute"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="cursor-pointer text-destructive">
                      Delete conversation
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
