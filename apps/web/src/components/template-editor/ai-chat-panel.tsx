"use client";

import { useChat } from "@ai-sdk/react";
import { useThrottler } from "@tanstack/react-pacer";
import type { JSONContent } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { DefaultChatTransport } from "ai";
import {
  Bot,
  Check,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  User,
  Wand2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useBrandKits } from "@/hooks/use-brand-kit-queries";
import { extractTipTapJson } from "@/lib/ai/validator";
import { cn } from "@/lib/utils";
import { useTemplateStore } from "@/stores/template-store";

type AIChatPanelProps = {
  editor: Editor | null;
  orgSlug: string;
  templateId: string;
  asSidePanel?: boolean;
};

const QUICK_PROMPTS = [
  { label: "Welcome Email", prompt: "Create a welcome email for new users" },
  {
    label: "Password Reset",
    prompt: "Create a password reset email with a reset button",
  },
  {
    label: "Newsletter",
    prompt: "Create a newsletter template with multiple sections",
  },
  {
    label: "Order Confirmation",
    prompt: "Create an order confirmation email with order details",
  },
  { label: "Promotional", prompt: "Create a promotional email for a sale" },
];

export function AIChatPanel({
  editor,
  orgSlug,
  templateId,
  asSidePanel,
}: AIChatPanelProps) {
  const [input, setInput] = useState("");
  const [pendingContent, setPendingContent] = useState<JSONContent | null>(
    null
  );
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { selectedBrandKitId } = useTemplateStore((state) => state.localState);
  const { setIsGenerating, setLastGeneratedContent } = useTemplateStore(
    (state) => state.actions
  );

  // Fetch brand kits for this organization
  const { data: brandKits } = useBrandKits(orgSlug);

  // Get the selected brand kit from store
  const selectedBrandKit = useMemo(() => {
    if (!brandKits?.length) {
      return null;
    }
    if (selectedBrandKitId) {
      return brandKits.find((kit) => kit.id === selectedBrandKitId) ?? null;
    }
    // Fallback to default brand kit or first one
    return brandKits.find((kit) => kit.isDefault) ?? brandKits[0];
  }, [brandKits, selectedBrandKitId]);

  // Use the Vercel AI SDK v5's useChat hook
  const { messages, sendMessage, status, stop, regenerate, error } = useChat({
    transport: new DefaultChatTransport({
      api: `/api/${orgSlug}/templates/ai/generate`,
      body: {
        templateId,
        brandKitId: selectedBrandKit?.id,
        existingContent: editor?.getJSON(),
      },
    }),
    onError: (error) => {
      setIsGenerating(false);
      toast.error("Failed to generate content", {
        description: error.message,
      });
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Throttle AI requests to max 1 every 5 seconds to prevent spam
  const sendMessageThrottler = useThrottler(
    (text: string) => {
      sendMessage({ text });
    },
    {
      wait: 5000, // 5 seconds between requests
      leading: true, // Execute immediately on first call
      trailing: false, // Don't execute after wait period if called during cooldown
    }
  );

  // Track generating state
  useEffect(() => {
    setIsGenerating(isLoading);
  }, [isLoading, setIsGenerating]);

  // Extract TipTap JSON from the latest assistant message
  useEffect(() => {
    const lastMessage = messages.at(-1);
    if (lastMessage?.role === "assistant" && !isLoading) {
      // Get the text content from message parts
      const textContent = lastMessage.parts
        .filter(
          (part): part is { type: "text"; text: string } => part.type === "text"
        )
        .map((part) => part.text)
        .join("");

      const content = extractTipTapJson(textContent);
      if (content) {
        setPendingContent(content);
        setLastGeneratedContent(content);
      }
    }
  }, [messages, isLoading, setLastGeneratedContent]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, []);

  const handleApplyContent = useCallback(() => {
    if (!(editor && pendingContent)) {
      return;
    }

    editor.commands.setContent(pendingContent);
    setPendingContent(null);
    toast.success("Content applied to editor");
  }, [editor, pendingContent]);

  const handleRejectContent = useCallback(() => {
    setPendingContent(null);
  }, []);

  const handleSendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || isLoading) {
        return;
      }
      sendMessageThrottler.maybeExecute(text.trim());
      setInput("");
    },
    [isLoading, sendMessageThrottler]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(input);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage(input);
  };

  // Helper to get text content from a message
  const getMessageText = (message: (typeof messages)[number]) =>
    message.parts
      .filter(
        (part): part is { type: "text"; text: string } => part.type === "text"
      )
      .map((part) => part.text)
      .join("");

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col bg-background",
        asSidePanel ? "h-full w-80 border-l" : "h-full"
      )}
    >
      {/* Header - Compact */}
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-medium">AI Assistant</span>
        </div>
        {isLoading && (
          <Button
            className="h-8 w-8 p-0"
            onClick={stop}
            size="sm"
            title="Stop generating"
            variant="ghost"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="min-h-0 flex-1" ref={scrollAreaRef}>
        <div className="p-3">
          {messages.length === 0 ? (
            <div className="space-y-3">
              {/* Compact welcome - hidden on very small screens when as side panel */}
              <div className="py-4 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Wand2 className="h-5 w-5 text-primary" />
                </div>
                <h4 className="mb-1 font-medium text-sm">AI Assistant</h4>
                <p className="text-muted-foreground text-xs">
                  Describe your email to generate it
                </p>
              </div>

              {/* Quick prompts as compact chips */}
              <div className="space-y-2">
                <p className="px-1 font-medium text-muted-foreground text-xs">
                  Quick prompts
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_PROMPTS.map((qp) => (
                    <Button
                      className="h-7 px-2.5 text-xs"
                      key={qp.label}
                      onClick={() => handleSendMessage(qp.prompt)}
                      size="sm"
                      variant="outline"
                    >
                      {qp.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <div
                  className={cn(
                    "flex gap-2",
                    message.role === "user" && "flex-row-reverse"
                  )}
                  key={message.id}
                >
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarFallback
                      className={cn(
                        "text-xs",
                        message.role === "assistant"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      {message.role === "assistant" ? (
                        <Bot className="h-3 w-3" />
                      ) : (
                        <User className="h-3 w-3" />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={cn(
                      "min-w-0 flex-1",
                      message.role === "user" && "text-right"
                    )}
                  >
                    <div
                      className={cn(
                        "inline-block max-w-full rounded-lg px-2.5 py-1.5 text-xs",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      {message.role === "assistant" ? (
                        <AssistantMessage content={getMessageText(message)} />
                      ) : (
                        getMessageText(message)
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {isLoading && messages.at(-1)?.role === "user" && (
                <div className="flex gap-2">
                  <Avatar className="h-6 w-6 shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      <Bot className="h-3 w-3" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Generating...
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Error Display */}
      {error && (
        <div className="border-t bg-destructive/10 px-3 py-2">
          <p className="text-destructive text-xs">{error.message}</p>
          <Button
            className="mt-1.5 h-7"
            onClick={() => regenerate()}
            size="sm"
            variant="outline"
          >
            <RefreshCw className="mr-1.5 h-3 w-3" />
            Retry
          </Button>
        </div>
      )}

      {/* Pending Content Actions */}
      {pendingContent && !isLoading && !error && (
        <div className="border-t bg-muted/50 px-3 py-2">
          <p className="mb-1.5 font-medium text-xs">Apply generated content?</p>
          <div className="flex gap-1.5">
            <Button
              className="h-7 flex-1 text-xs"
              onClick={handleApplyContent}
              size="sm"
            >
              <Check className="mr-1 h-3 w-3" />
              Apply
            </Button>
            <Button
              className="h-7 flex-1 text-xs"
              onClick={handleRejectContent}
              size="sm"
              variant="outline"
            >
              <X className="mr-1 h-3 w-3" />
              Discard
            </Button>
          </div>
        </div>
      )}

      {/* Input */}
      <form className="border-t px-3 py-2" onSubmit={handleSubmit}>
        <div className="flex gap-1.5">
          <Textarea
            className="min-h-[44px] flex-1 resize-none text-xs"
            disabled={isLoading}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your email..."
            ref={textareaRef}
            rows={2}
            value={input}
          />
          <div className="flex flex-col gap-1">
            <Button
              className="h-8 w-8"
              disabled={!input.trim() || isLoading}
              size="icon"
              type="submit"
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
            {messages.length > 0 && !isLoading && (
              <Button
                className="h-8 w-8"
                onClick={() => regenerate()}
                size="icon"
                type="button"
                variant="outline"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

// Helper component to render assistant messages with code block handling
function AssistantMessage({ content }: { content: string }) {
  // Split content into text and code blocks
  const parts = content.split(/(```json[\s\S]*?```)/g);

  return (
    <div className="space-y-2 whitespace-pre-wrap">
      {parts.map((part, index) => {
        if (part.startsWith("```json")) {
          // Show a collapsed indicator for JSON blocks
          return (
            <div
              className="rounded bg-background/50 px-2 py-1 text-muted-foreground text-xs"
              key={`${index}-${part.slice(0, 20)}`}
            >
              [Template JSON generated]
            </div>
          );
        }
        const trimmed = part.trim();
        return trimmed ? (
          <span key={`${index}-${trimmed.slice(0, 20)}`}>{trimmed}</span>
        ) : null;
      })}
    </div>
  );
}
