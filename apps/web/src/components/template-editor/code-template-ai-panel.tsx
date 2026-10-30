"use client";

import { useChat } from "@ai-sdk/react";
import { useThrottler } from "@tanstack/react-pacer";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@wraps/ui/components/ui/dropdown-menu";
import { Textarea } from "@wraps/ui/components/ui/textarea";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  AlertTriangle,
  Check,
  Heart,
  Loader2,
  MessageSquarePlus,
  Palette,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Wand2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AssistantConversation } from "@/components/ui/assistant-conversation";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { getAiUsageQueryKey, useAiUsage } from "@/hooks/use-ai-usage";
import { useAutoResizeTextarea } from "@/hooks/use-auto-resize-textarea";
import { useBrandKits } from "@/hooks/use-brand-kit-queries";
import { templateKeys } from "@/hooks/use-template-queries";
import { extractTsxCode } from "@/lib/ai/extract-tsx-code";
import { type CompileResult, compileTemplate } from "@/lib/compile-template";
import { cn } from "@/lib/utils";
import { useTemplateStore } from "@/stores/template-store";
import { AIAttachmentChips } from "./ai-attachment-chips";
import {
  AIImageUrlPopover,
  type ImageAttachment,
} from "./ai-image-url-popover";

type CodeTemplateAIPanelProps = {
  orgSlug: string;
  templateId: string;
  aiConversationId: string | null;
  currentSource: string;
  onApply: (source: string, compiled: CompileResult) => void;
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

const FAVORITE_PROMPTS_KEY = "wraps:ai:code:favorite-prompts";

type FavoritePrompt = {
  id: string;
  label: string;
  prompt: string;
};

function useFavoritePrompts() {
  const [favorites, setFavorites] = useState<FavoritePrompt[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(FAVORITE_PROMPTS_KEY);
      if (stored) {
        setFavorites(JSON.parse(stored));
      }
    } catch {
      // Ignore parse errors
    }
  }, []);

  const saveFavorite = useCallback((prompt: string) => {
    const newFavorite: FavoritePrompt = {
      id: Date.now().toString(),
      label: prompt.slice(0, 30) + (prompt.length > 30 ? "..." : ""),
      prompt,
    };
    setFavorites((prev) => {
      const updated = [...prev, newFavorite];
      localStorage.setItem(FAVORITE_PROMPTS_KEY, JSON.stringify(updated));
      return updated;
    });
    toast.success("Prompt saved to favorites");
    return newFavorite;
  }, []);

  const removeFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const updated = prev.filter((f) => f.id !== id);
      localStorage.setItem(FAVORITE_PROMPTS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  return { favorites, saveFavorite, removeFavorite };
}

// Extract TSX code from AI response (from ```tsx code block or raw code)
export function CodeTemplateAIPanel({
  orgSlug,
  templateId,
  aiConversationId,
  currentSource,
  onApply,
}: CodeTemplateAIPanelProps) {
  const [input, setInput] = useState("");
  const [imageAttachment, setImageAttachment] =
    useState<ImageAttachment | null>(null);
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [autoFixAttempted, setAutoFixAttempted] = useState(false);
  const lastAppliedSourceRef = useRef<string | null>(currentSource);
  const [hasShownWarningToast, setHasShownWarningToast] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 44,
    maxHeight: 360,
  });
  const queryClient = useQueryClient();

  // Track current conversationId — loaded from API or set after first message
  const [conversationId, setConversationId] = useState<string | null>(
    aiConversationId
  );

  // Sync conversationId when template cache updates (e.g. after first AI message)
  useEffect(() => {
    if (aiConversationId) {
      setConversationId(aiConversationId);
    }
  }, [aiConversationId]);

  // Load saved conversation messages
  const { data: savedConversation } = useQuery<{
    conversationId?: string;
    messages: UIMessage[];
  }>({
    queryKey: templateKeys.conversation(orgSlug, templateId),
    queryFn: async () => {
      const resp = await fetch(
        `/api/${orgSlug}/emails/templates/${templateId}/conversation`
      );
      if (!resp.ok) {
        return { messages: [] };
      }
      return resp.json();
    },
    enabled: !!aiConversationId,
    staleTime: 60_000,
  });

  // Fetch AI usage
  const { data: aiUsage, refetch: refetchUsage } = useAiUsage(orgSlug);

  // Favorite prompts
  const { favorites, saveFavorite, removeFavorite } = useFavoritePrompts();

  const { selectedBrandKitId } = useTemplateStore((state) => state.localState);
  const { setSelectedBrandKitId: setStoreKitId } = useTemplateStore(
    (state) => state.actions
  );
  const { data: brandKits } = useBrandKits(orgSlug);

  // Persist brand kit to template when changed
  const prevBrandKitRef = useRef<string | null>(selectedBrandKitId);
  const setSelectedBrandKitId = useCallback(
    (id: string | null) => {
      const prevId = prevBrandKitRef.current;
      prevBrandKitRef.current = id;
      setStoreKitId(id);
      fetch(`/api/${orgSlug}/emails/templates/${templateId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandKitId: id === "none" ? null : id }),
      }).catch((err) => {
        // Revert to previous value on failure
        prevBrandKitRef.current = prevId;
        setStoreKitId(prevId);
        toast.error("Failed to save brand kit selection", {
          description: err instanceof Error ? err.message : undefined,
        });
      });
    },
    [setStoreKitId, orgSlug, templateId]
  );

  const selectedBrandKit = useMemo(() => {
    if (!brandKits?.length || selectedBrandKitId === "none") {
      return null;
    }
    if (selectedBrandKitId) {
      return brandKits.find((kit) => kit.id === selectedBrandKitId) ?? null;
    }
    // Default: return default brand kit or first one
    return brandKits.find((kit) => kit.isDefault) ?? brandKits[0];
  }, [brandKits, selectedBrandKitId]);

  // Use the AI SDK's useChat hook
  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    regenerate,
    error,
  } = useChat({
    transport: new DefaultChatTransport({
      api: `/api/${orgSlug}/emails/templates/ai/generate-code`,
      body: {
        templateId,
        conversationId: conversationId ?? undefined,
        brandKitId: selectedBrandKit?.id,
        existingSource: currentSource || undefined,
        imageUrl: imageAttachment?.url,
        imageBase64: imageAttachment?.base64,
        imageMediaType: imageAttachment?.base64
          ? imageAttachment.contentType
          : undefined,
      },
    }),
    onError: (error) => {
      if (error.message?.includes("limit reached")) {
        toast.error("AI message limit reached", {
          description: "Upgrade your plan for more AI messages.",
        });
        refetchUsage();
      } else {
        toast.error("Failed to generate content", {
          description: error.message,
        });
      }
    },
    onFinish: () => {
      queryClient.invalidateQueries({ queryKey: getAiUsageQueryKey(orgSlug) });
      // Refresh template cache so aiConversationId is picked up
      queryClient.invalidateQueries({
        queryKey: templateKeys.detail(orgSlug, templateId),
      });
    },
  });

  // Hydrate chat with saved messages once loaded
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (
      savedConversation?.messages?.length &&
      !hydratedRef.current &&
      messages.length === 0
    ) {
      setMessages(savedConversation.messages);
      if (savedConversation.conversationId) {
        setConversationId(savedConversation.conversationId);
      }
      hydratedRef.current = true;
    }
  }, [savedConversation, messages.length, setMessages]);

  const isLoading = status === "streaming" || status === "submitted";

  // Throttle AI requests
  const sendMessageThrottler = useThrottler(
    (text: string) => {
      sendMessage({ text });
    },
    { wait: 5000, leading: true, trailing: false }
  );

  // Show warning toast
  useEffect(() => {
    if (aiUsage?.warning && !hasShownWarningToast) {
      toast.warning("AI Usage Warning", {
        description: aiUsage.warning,
        duration: 6000,
      });
      setHasShownWarningToast(true);
    }
  }, [aiUsage?.warning, hasShownWarningToast]);

  // Extract TSX from the latest assistant message
  // If auto-fix was attempted, try compiling automatically
  useEffect(() => {
    const lastMessage = messages.at(-1);
    if (lastMessage?.role === "assistant" && !isLoading) {
      const textContent = lastMessage.parts
        .filter(
          (part): part is { type: "text"; text: string } => part.type === "text"
        )
        .map((part) => part.text)
        .join("");

      const code = extractTsxCode(textContent);
      if (code && code !== lastAppliedSourceRef.current) {
        if (autoFixAttempted) {
          // Auto-fix response — try compiling directly
          setIsCompiling(true);
          compileTemplate(code)
            .then((compiled) => {
              lastAppliedSourceRef.current = code;
              onApply(code, compiled);
              setPendingSource(null);
              setAutoFixAttempted(false);
              toast.success("AI fixed the code successfully");
            })
            .catch((err) => {
              // Auto-fix failed too — show error, let user decide
              setPendingSource(code);
              setAutoFixAttempted(false);
              const msg =
                err instanceof Error ? err.message : "Compilation failed";
              toast.error("Auto-fix failed to compile", {
                description: msg,
              });
            })
            .finally(() => setIsCompiling(false));
        } else {
          setPendingSource(code);
        }
      }
    }
  }, [messages, isLoading, autoFixAttempted, onApply]);

  // Apply: compile first, then call onApply. On failure, ask AI to fix (once).
  const handleApply = useCallback(async () => {
    if (!pendingSource) {
      return;
    }

    setIsCompiling(true);
    try {
      const compiled = await compileTemplate(pendingSource);
      lastAppliedSourceRef.current = pendingSource;
      onApply(pendingSource, compiled);
      setPendingSource(null);
      setAutoFixAttempted(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Compilation failed";

      if (autoFixAttempted) {
        toast.error("Failed to compile generated code", {
          description: message,
        });
      } else {
        // Ask the AI to fix the compilation error (one attempt)
        setAutoFixAttempted(true);
        setPendingSource(null);
        toast.info("Compilation failed — asking AI to fix it...");
        sendMessage({
          text: `The code you generated failed to compile with this error:\n\n${message}\n\nPlease fix the code and output the complete corrected TSX file.`,
        });
      }
    } finally {
      setIsCompiling(false);
    }
  }, [pendingSource, onApply, autoFixAttempted, sendMessage]);

  const handleReject = useCallback(() => {
    setPendingSource(null);
  }, []);

  const handleSendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || isLoading) {
        return;
      }
      sendMessageThrottler.maybeExecute(text.trim());
      setInput("");
      setImageAttachment(null);
      adjustHeight(true);
    },
    [isLoading, sendMessageThrottler, adjustHeight]
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-medium">AI Code Assistant</span>
          {aiUsage && aiUsage.limit !== -1 && (
            <span className="text-muted-foreground text-xs">
              ({aiUsage.current}/{aiUsage.limit})
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {messages.length > 0 && !isLoading && (
            <Button
              onClick={async () => {
                // Snapshot current state for rollback
                const prevMessages = [...messages];
                const prevConversationId = conversationId;
                const prevPendingSource = pendingSource;

                // Optimistically clear UI
                setMessages([]);
                setPendingSource(null);
                setConversationId(null);
                setAutoFixAttempted(false);
                lastAppliedSourceRef.current = null;
                hydratedRef.current = false;
                queryClient.setQueryData(
                  templateKeys.conversation(orgSlug, templateId),
                  { messages: [] }
                );

                try {
                  const resp = await fetch(
                    `/api/${orgSlug}/emails/templates/${templateId}/conversation`,
                    { method: "DELETE" }
                  );
                  if (!resp.ok) {
                    throw new Error("Delete failed");
                  }
                  queryClient.invalidateQueries({
                    queryKey: templateKeys.detail(orgSlug, templateId),
                  });
                } catch {
                  // Restore previous state on failure
                  setMessages(prevMessages);
                  setConversationId(prevConversationId);
                  setPendingSource(prevPendingSource);
                  queryClient.invalidateQueries({
                    queryKey: templateKeys.conversation(orgSlug, templateId),
                  });
                  toast.error("Failed to clear conversation");
                }
              }}
              size="icon-sm"
              title="New chat"
              variant="ghost"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
            </Button>
          )}
          {isLoading && (
            <Button
              onClick={stop}
              size="icon-sm"
              title="Stop generating"
              variant="ghost"
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Usage Warning */}
      {aiUsage?.warning && (
        <div className="flex items-center gap-2 border-b bg-warning/15 px-3 py-2 text-warning">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <p className="text-xs">{aiUsage.warning}</p>
        </div>
      )}

      {/* Messages */}
      <AssistantConversation
        className="min-h-0 flex-1"
        emptyState={
          aiUsage && aiUsage.remaining === 0 && messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-warning/15">
                <AlertTriangle className="h-6 w-6 text-warning" />
              </div>
              <h4 className="mb-1 font-medium text-sm">
                Monthly Limit Reached
              </h4>
              <p className="mb-4 max-w-[200px] text-muted-foreground text-xs">
                You've used all {aiUsage.limit} AI messages this month. Upgrade
                your plan for more AI assistance.
              </p>
              <Button asChild className="h-8" size="sm">
                <a href={`/${orgSlug}/settings/billing`}>Upgrade Plan</a>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="py-4 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Wand2 className="h-5 w-5 text-primary" />
                </div>
                <h4 className="mb-1 font-medium text-sm">AI Code Assistant</h4>
                <p className="text-muted-foreground text-xs">
                  Describe your email to generate React Email TSX
                </p>
              </div>

              <div className="space-y-2">
                <p className="px-1 font-medium text-muted-foreground text-xs">
                  Quick prompts
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_PROMPTS.map((qp) => (
                    <Button
                      className="h-7"
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

              {favorites.length > 0 && (
                <div className="space-y-2">
                  <p className="flex items-center gap-1 px-1 font-medium text-muted-foreground text-xs">
                    <Heart className="h-3 w-3" />
                    Your favorites
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {favorites.map((fav) => (
                      <div className="group relative" key={fav.id}>
                        <Button
                          className="h-7"
                          onClick={() => handleSendMessage(fav.prompt)}
                          size="sm"
                          variant="secondary"
                        >
                          {fav.label}
                        </Button>
                        <button
                          aria-label="Remove from favorites"
                          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-sm p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFavorite(fav.id);
                          }}
                          type="button"
                        >
                          <X className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        }
        isLoading={isLoading}
        loadingLabel="Generating your email code..."
        messages={messages}
        renderAssistantText={(text, isStreaming) => (
          <AssistantCodeMessage content={text} isStreaming={isStreaming} />
        )}
      />

      {/* Error */}
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
      {pendingSource && !isLoading && !error && (
        <div className="border-t bg-muted/50 px-3 py-2">
          <p className="mb-1.5 font-medium text-xs">
            Apply generated template?
          </p>
          <div className="flex gap-1.5">
            <Button
              className="h-7 flex-1"
              disabled={isCompiling}
              onClick={handleApply}
              size="sm"
            >
              {isCompiling ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Check className="mr-1 h-3 w-3" />
              )}
              Apply
            </Button>
            <Button
              className="h-7 flex-1"
              disabled={isCompiling}
              onClick={handleReject}
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
      <form className="border-t p-3" onSubmit={handleSubmit}>
        <div
          className={cn(
            "relative flex flex-col rounded-xl transition-all duration-200",
            "ring-1 ring-foreground/10",
            isFocused && "ring-foreground/20"
          )}
        >
          <div>
            <Textarea
              className="w-full resize-none overflow-y-auto px-3 py-2.5 text-xs leading-relaxed [field-sizing:normal]"
              disabled={isLoading || aiUsage?.remaining === 0}
              onBlur={() => setIsFocused(false)}
              onChange={(e) => {
                setInput(e.target.value);
                adjustHeight();
              }}
              onFocus={() => setIsFocused(true)}
              onKeyDown={handleKeyDown}
              placeholder={
                aiUsage?.remaining === 0
                  ? "Message limit reached"
                  : "Describe your email..."
              }
              ref={textareaRef}
              value={input}
              variant="seamless"
            />
          </div>

          <div className="flex min-h-10 items-center gap-1.5 rounded-b-xl bg-foreground/5 px-2.5 py-1.5">
            <AIImageUrlPopover
              disabled={
                !!imageAttachment || isLoading || aiUsage?.remaining === 0
              }
              onAttach={setImageAttachment}
              orgSlug={orgSlug}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label="Brand kit"
                  className="h-7 w-7"
                  size="icon"
                  title="Brand kit"
                  type="button"
                  variant="ghost"
                >
                  {selectedBrandKit ? (
                    <div
                      className="h-3.5 w-3.5 rounded-full border"
                      style={{
                        backgroundColor:
                          selectedBrandKit.primaryColor ?? undefined,
                      }}
                    />
                  ) : (
                    <Palette className="h-3.5 w-3.5" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top">
                <DropdownMenuItem onClick={() => setSelectedBrandKitId("none")}>
                  <Palette className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                  None
                  {selectedBrandKitId === "none" && (
                    <Check className="ml-auto h-3.5 w-3.5" />
                  )}
                </DropdownMenuItem>
                {brandKits?.map((kit) => (
                  <DropdownMenuItem
                    key={kit.id}
                    onClick={() => setSelectedBrandKitId(kit.id)}
                  >
                    <div
                      className="mr-2 h-3.5 w-3.5 rounded-full border"
                      style={{
                        backgroundColor: kit.primaryColor ?? "#5046e5",
                      }}
                    />
                    <span className="truncate">{kit.name}</span>
                    {selectedBrandKitId === kit.id && (
                      <Check className="ml-auto h-3.5 w-3.5" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <AIAttachmentChips
              imageAttachment={imageAttachment}
              onRemoveBrandKit={() => setSelectedBrandKitId("none")}
              onRemoveImage={() => setImageAttachment(null)}
              selectedBrandKit={
                selectedBrandKit
                  ? {
                      name: selectedBrandKit.companyName || "Brand Kit",
                      primaryColor: selectedBrandKit.primaryColor,
                    }
                  : null
              }
            />
            <div className="flex-1" />
            {messages.length > 0 && !isLoading && (
              <Button
                aria-label="Regenerate"
                className="h-7 w-7"
                disabled={aiUsage?.remaining === 0}
                onClick={() => regenerate()}
                size="icon"
                title="Regenerate"
                type="button"
                variant="ghost"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
            {input.trim().length > 10 && (
              <Button
                aria-label="Save to favorites"
                className="h-7 w-7"
                onClick={() => saveFavorite(input.trim())}
                size="icon"
                title="Save to favorites"
                type="button"
                variant="ghost"
              >
                <Heart className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              aria-label="Send message"
              className="h-7 w-7"
              disabled={!input.trim() || isLoading || aiUsage?.remaining === 0}
              size="icon"
              type="submit"
              variant={input.trim() && !isLoading ? "default" : "ghost"}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

// Render assistant messages, collapsing TSX code blocks
function AssistantCodeMessage({
  content,
  isStreaming,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  const parts = content.split(/(```(?:tsx|typescript|ts)?[\s\S]*?```)/g);
  const hasCodeBlock = parts.some((p) => p.startsWith("```"));
  let lastCodeIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i].startsWith("```")) {
      lastCodeIdx = i;
      break;
    }
  }
  const hasTextAfterCode =
    hasCodeBlock &&
    lastCodeIdx >= 0 &&
    parts.slice(lastCodeIdx + 1).some((p) => p.trim().length > 0);

  return (
    <div className="space-y-2">
      {parts.map((part, index) => {
        if (part.startsWith("```")) {
          return (
            <div
              className="rounded bg-background/50 px-2 py-1 text-muted-foreground text-xs"
              key={`${index}-${part.slice(0, 20)}`}
            >
              [TSX code generated]
            </div>
          );
        }
        const trimmed = part.trim();
        return trimmed ? (
          <Markdown key={`${index}-${trimmed.slice(0, 20)}`}>
            {trimmed}
          </Markdown>
        ) : null;
      })}
      {isStreaming && hasCodeBlock && !hasTextAfterCode && (
        <div className="flex items-center gap-1.5 pt-1 text-muted-foreground text-xs">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Reviewing changes...</span>
        </div>
      )}
    </div>
  );
}
