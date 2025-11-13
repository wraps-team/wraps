"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  type Conversation,
  type Message,
  type User,
  useChat,
} from "../use-chat";
import { ChatHeader } from "./chat-header";
import { ConversationList } from "./conversation-list";
import { MessageInput } from "./message-input";
import { MessageList } from "./message-list";

type ChatProps = {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  users: User[];
};

export function Chat({ conversations, messages, users }: ChatProps) {
  const {
    selectedConversation,
    setSelectedConversation,
    setConversations,
    setMessages,
    setUsers,
    addMessage,
    toggleMute,
  } = useChat();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Close sidebar when clicking outside on mobile
  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== "undefined" ? window.innerWidth : 0 >= 1024) {
        // lg breakpoint
        setIsSidebarOpen(false);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("resize", handleResize);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("resize", handleResize);
      }
    };
  }, []);

  // Initialize data
  useEffect(() => {
    setConversations(conversations);
    setUsers(users);

    // Set messages for all conversations
    Object.entries(messages).forEach(
      ([conversationId, conversationMessages]) => {
        setMessages(conversationId, conversationMessages);
      }
    );

    // Auto-select first conversation if none selected
    if (!selectedConversation && conversations.length > 0) {
      setSelectedConversation(conversations[0].id);
    }
  }, [
    conversations,
    messages,
    users,
    selectedConversation,
    setConversations,
    setMessages,
    setUsers,
    setSelectedConversation,
  ]);

  const currentConversation = conversations.find(
    (conv) => conv.id === selectedConversation
  );
  const currentMessages = selectedConversation
    ? messages[selectedConversation] || []
    : [];

  const handleSendMessage = (content: string) => {
    if (!selectedConversation) {
      return;
    }

    const newMessage = {
      id: `msg-${Date.now()}`,
      content,
      timestamp: new Date().toISOString(),
      senderId: "current-user",
      type: "text" as const,
      isEdited: false,
      reactions: [],
      replyTo: null,
    };

    addMessage(selectedConversation, newMessage);
  };

  const handleToggleMute = () => {
    if (selectedConversation) {
      toggleMute(selectedConversation);
    }
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-full max-h-[calc(100vh-200px)] min-h-[600px] overflow-hidden rounded-lg border bg-background">
        {/* Mobile Sidebar Overlay */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Conversations Sidebar - Responsive */}
        <div
          className={`w-100 flex-shrink-0 border-r bg-background ${isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}lg:relative fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out lg:block`}
        >
          {/* Sidebar Header with Close Button (Mobile Only) */}
          <div className="flex items-center justify-between border-b bg-background p-4 lg:hidden">
            <h2 className="font-semibold text-lg">Messages</h2>
            <Button
              className="cursor-pointer"
              onClick={() => setIsSidebarOpen(false)}
              size="sm"
              variant="ghost"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ConversationList
            conversations={conversations}
            onSelectConversation={(id) => {
              setSelectedConversation(id);
              setIsSidebarOpen(false); // Close sidebar on mobile after selection
            }}
            selectedConversation={selectedConversation}
          />
        </div>

        {/* Chat Panel - Flexible Width */}
        <div className="flex min-w-0 flex-1 flex-col bg-background">
          {/* Chat Header with Hamburger Menu */}
          <div className="flex h-16 items-center border-b bg-background px-4">
            {/* Hamburger Menu Button - Only visible when sidebar is hidden on mobile */}
            <Button
              className="mr-2 cursor-pointer lg:hidden"
              onClick={() => setIsSidebarOpen(true)}
              size="sm"
              variant="ghost"
            >
              <Menu className="h-4 w-4" />
            </Button>

            <div className="flex-1">
              <ChatHeader
                conversation={currentConversation || null}
                onToggleMute={handleToggleMute}
                users={users}
              />
            </div>
          </div>

          {/* Messages */}
          <div className="flex min-h-0 flex-1 flex-col">
            {selectedConversation ? (
              <>
                <MessageList messages={currentMessages} users={users} />

                {/* Message Input */}
                <MessageInput
                  onSendMessage={handleSendMessage}
                  placeholder={`Message ${currentConversation?.name || ""}...`}
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center">
                  <h3 className="mb-2 font-semibold text-lg">
                    Welcome to Chat
                  </h3>
                  <p className="text-muted-foreground">
                    Select a conversation to start messaging
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
