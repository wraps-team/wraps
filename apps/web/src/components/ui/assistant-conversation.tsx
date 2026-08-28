"use client";

import { Avatar, AvatarFallback } from "@wraps/ui/components/ui/avatar";
import { getToolName, isToolUIPart, type ToolUIPart, type UIMessage } from "ai";
import { AlertCircle, Bot, Check, Loader2, User } from "lucide-react";
import type { ReactNode } from "react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ui/reasoning";
import { cn } from "@/lib/utils";

export type ToolPartRenderer = (part: ToolUIPart) => ReactNode;

type AssistantConversationProps = {
  messages: UIMessage[];
  isLoading: boolean;
  loadingLabel?: string;
  className?: string;
  // Panel-specific assistant-text renderer (e.g. JSON/TSX code-block
  // stripping). Receives whether this specific text part is still streaming.
  // Defaults to rendering the text verbatim when omitted.
  renderAssistantText?: (text: string, isStreaming: boolean) => ReactNode;
  // Rendered inside the scroller when there are no messages yet. Each panel
  // owns its own empty state (limit reached, welcome, quick prompts, etc.).
  emptyState?: ReactNode;
  // Maps a tool name (no `tool-` prefix) to the component that renders that
  // tool's invocation. A tool with no entry falls back to a compact status
  // line — never a raw dump of the tool output, which is frequently large and
  // sometimes contains data the surrounding page is not meant to show.
  toolRenderers?: Record<string, ToolPartRenderer>;
};

// Helper to get concatenated text content from a message
function getMessageText(message: UIMessage) {
  return message.parts
    .filter(
      (part): part is { type: "text"; text: string } => part.type === "text"
    )
    .map((part) => part.text)
    .join("");
}

// Shown for a tool the caller registered no renderer for. Deliberately shows
// the tool's name and lifecycle only: tool outputs are unbounded in size and
// not guaranteed to be safe to paint into the page, so an unregistered tool
// degrades to a status line rather than a JSON dump.
function ToolPartFallback({ part }: { part: ToolUIPart }) {
  const name = getToolName(part);

  if (part.state === "output-error") {
    return (
      <Marker role="status">
        <MarkerIcon>
          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
        </MarkerIcon>
        <MarkerContent>{`${name} failed`}</MarkerContent>
      </Marker>
    );
  }

  const done = part.state === "output-available";
  return (
    <Marker role="status">
      <MarkerIcon>
        {done ? (
          <Check className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        )}
      </MarkerIcon>
      <MarkerContent>
        {done ? `Ran ${name}` : `Running ${name}...`}
      </MarkerContent>
    </Marker>
  );
}

export function AssistantConversation({
  messages,
  isLoading,
  loadingLabel = "Generating...",
  className,
  renderAssistantText,
  emptyState,
  toolRenderers,
}: AssistantConversationProps) {
  // A part is still streaming if it's the last part of the last message and
  // generation is in progress.
  const isPartStreaming = (message: UIMessage, partIndex: number) =>
    isLoading &&
    partIndex === message.parts.length - 1 &&
    message.id === messages.at(-1)?.id;

  return (
    <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor">
      <MessageScroller className={cn("min-h-0 flex-1", className)}>
        <MessageScrollerViewport>
          <MessageScrollerContent className="p-3">
            {messages.length === 0 ? (
              emptyState
            ) : (
              <>
                {messages.map((message) => (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    scrollAnchor={message.role === "user"}
                  >
                    <Message align={message.role === "user" ? "end" : "start"}>
                      <MessageAvatar>
                        <Avatar className="h-6 w-6">
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
                      </MessageAvatar>
                      <MessageContent>
                        {message.role === "assistant" ? (
                          message.parts.map((part, partIndex) => {
                            if (part.type === "reasoning") {
                              const streaming = isPartStreaming(
                                message,
                                partIndex
                              );
                              return (
                                <Reasoning
                                  defaultOpen={streaming}
                                  isStreaming={streaming}
                                  key={`${message.id}-${partIndex}`}
                                >
                                  <ReasoningTrigger />
                                  <ReasoningContent>
                                    {part.text}
                                  </ReasoningContent>
                                </Reasoning>
                              );
                            }

                            if (part.type === "text") {
                              const streaming = isPartStreaming(
                                message,
                                partIndex
                              );
                              return (
                                <Bubble
                                  align="start"
                                  key={`${message.id}-${partIndex}`}
                                  variant="muted"
                                >
                                  <BubbleContent>
                                    {renderAssistantText
                                      ? renderAssistantText(
                                          part.text,
                                          streaming
                                        )
                                      : part.text}
                                  </BubbleContent>
                                </Bubble>
                              );
                            }

                            if (isToolUIPart(part)) {
                              const renderer =
                                toolRenderers?.[getToolName(part)];
                              return (
                                <div
                                  className="w-full"
                                  key={`${message.id}-${partIndex}`}
                                >
                                  {renderer ? (
                                    renderer(part)
                                  ) : (
                                    <ToolPartFallback part={part} />
                                  )}
                                </div>
                              );
                            }

                            return null;
                          })
                        ) : (
                          <Bubble align="end" variant="default">
                            <BubbleContent>
                              {getMessageText(message)}
                            </BubbleContent>
                          </Bubble>
                        )}
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                ))}

                {isLoading && messages.at(-1)?.role === "user" && (
                  <Marker role="status">
                    <MarkerIcon>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    </MarkerIcon>
                    <MarkerContent>{loadingLabel}</MarkerContent>
                  </Marker>
                )}
              </>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton />
      </MessageScroller>
    </MessageScrollerProvider>
  );
}
