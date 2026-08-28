"use client";

import { useChat } from "@ai-sdk/react";
import { Textarea } from "@wraps/ui/components/ui/textarea";
import { DefaultChatTransport } from "ai";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ASSISTANT_TOOL_RENDERERS } from "@/components/assistant/tool-renderers";
import { AssistantConversation } from "@/components/ui/assistant-conversation";
import { Button } from "@/components/ui/button";

type AskPanelProps = {
  orgSlug: string;
  initialQuestion: string;
  onExit: () => void;
};

export function AskPanel({ orgSlug, initialQuestion, onExit }: AskPanelProps) {
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: `/api/${orgSlug}/ai/assistant`,
    }),
  });
  const isLoading = status === "streaming" || status === "submitted";

  const [followUp, setFollowUp] = useState("");
  const hasSentInitial = useRef(false);

  useEffect(() => {
    if (initialQuestion && !hasSentInitial.current) {
      hasSentInitial.current = true;
      sendMessage({ text: initialQuestion });
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: send-once guard is intentional
  }, [initialQuestion]);

  const handleSend = () => {
    const text = followUp.trim();
    if (!text || isLoading) {
      return;
    }
    sendMessage({ text });
    setFollowUp("");
  };

  const errorMessage = error
    ? error.message?.includes("limit reached")
      ? "You've used all your AI messages this month."
      : "The assistant isn't available right now."
    : null;

  return (
    <div className="flex h-[min(70vh,480px)] flex-col">
      <div className="flex items-center border-border border-b px-4 py-2">
        <Button onClick={onExit} size="sm" variant="ghost">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to search
        </Button>
      </div>
      {errorMessage ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
          <p className="text-destructive text-sm">{errorMessage}</p>
          <Button onClick={onExit} size="sm" variant="outline">
            Back to search
          </Button>
        </div>
      ) : (
        <>
          <AssistantConversation
            isLoading={isLoading}
            loadingLabel="Thinking..."
            messages={messages}
            toolRenderers={ASSISTANT_TOOL_RENDERERS}
          />
          <div className="border-border border-t p-3">
            <Textarea
              disabled={isLoading}
              onChange={(event) => setFollowUp(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask a follow-up..."
              value={followUp}
            />
          </div>
        </>
      )}
    </div>
  );
}
