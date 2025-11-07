"use client";

import { useEffect, useState } from "react";

import { BaseLayout } from "@/components/layouts/base-layout";
import { Chat } from "./components/chat";
// Import static data
import conversationsData from "./data/conversations.json";
import messagesData from "./data/messages.json";
import usersData from "./data/users.json";
import type { Conversation, Message, User } from "./use-chat";

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        // In a real app, these would be API calls
        setConversations(conversationsData as Conversation[]);
        setMessages(messagesData as Record<string, Message[]>);
        setUsers(usersData as User[]);
      } catch (error) {
        console.error("Failed to load chat data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <BaseLayout description="Team communication and messaging" title="Chat">
        <div className="flex h-96 items-center justify-center">
          <div className="text-muted-foreground">Loading chat...</div>
        </div>
      </BaseLayout>
    );
  }

  return (
    <BaseLayout description="Team communication and messaging" title="Chat">
      <div className="px-4 md:px-6">
        <Chat conversations={conversations} messages={messages} users={users} />
      </div>
    </BaseLayout>
  );
}
