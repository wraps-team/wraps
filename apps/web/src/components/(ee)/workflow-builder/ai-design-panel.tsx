"use client";

import { useChat } from "@ai-sdk/react";
import { useThrottler } from "@tanstack/react-pacer";
import { useQueryClient } from "@tanstack/react-query";
import type { WorkflowStep, WorkflowTransition } from "@wraps/db";
import { Textarea } from "@wraps/ui/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@wraps/ui/components/ui/tooltip";
import { DefaultChatTransport } from "ai";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Send,
  Sparkles,
  Square,
  Wand2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AssistantConversation } from "@/components/ui/assistant-conversation";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { getAiUsageQueryKey, useAiUsage } from "@/hooks/use-ai-usage";
import { useAutoResizeTextarea } from "@/hooks/use-auto-resize-textarea";
import { extractWorkflowFromMessage } from "@/lib/ai/(ee)/workflow-parser";
import { useWorkflowStore } from "./use-workflow-store";

type ExistingWorkflow = {
  name: string;
  steps: unknown[];
  transitions: unknown[];
};

type PendingWorkflow = {
  steps: WorkflowStep[];
  transitions: WorkflowTransition[];
};

type AIDesignPanelProps = {
  orgSlug: string;
  workflowId: string;
};

const QUICK_PROMPTS = [
  {
    label: "Welcome Series",
    prompt:
      "Create a welcome series for new signups. Send an immediate welcome email, wait 2 days, then send a follow-up with tips on getting started.",
  },
  {
    label: "Cart Abandonment",
    prompt:
      "Create a cart abandonment flow. When a cart is abandoned, wait 1 hour then send a reminder. If they don't purchase within 24 hours, send a second reminder with a discount offer.",
  },
  {
    label: "Re-engagement",
    prompt:
      "Create a re-engagement flow for inactive users. When a user hasn't opened emails in 30 days, send a 'we miss you' email. If they still don't engage after 7 days, send a final offer before unsubscribing.",
  },
  {
    label: "Post-Purchase",
    prompt:
      "Create a post-purchase flow. After an order is completed, wait 3 days and ask for a review. Wait another week and recommend related products.",
  },
  {
    label: "Birthday Email",
    prompt:
      "Create a birthday email flow that sends a special birthday discount email on the contact's birthday.",
  },
];

export function AIDesignPanel({ orgSlug, workflowId }: AIDesignPanelProps) {
  const [input, setInput] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [hasShownWarningToast, setHasShownWarningToast] = useState(false);
  const [pendingWorkflow, setPendingWorkflow] =
    useState<PendingWorkflow | null>(null);
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight: 44,
    maxHeight: 200,
  });
  const queryClient = useQueryClient();

  // Fetch AI usage to show warnings
  const { data: aiUsage, refetch: refetchUsage } = useAiUsage(orgSlug);

  // Get the applyAIFlow action and workflow definition from the store
  const applyAIFlow = useWorkflowStore((state) => state.applyAIFlow);
  const getWorkflowDefinition = useWorkflowStore(
    (state) => state.getWorkflowDefinition
  );
  const workflowName = useWorkflowStore((state) => state.workflow?.name ?? "");

  // Get existing workflow content from the store (like Template AI does with editor.getJSON())
  const getExistingWorkflow = (): ExistingWorkflow | undefined => {
    const definition = getWorkflowDefinition();
    // Only include if there are steps beyond the default trigger
    if (definition.steps.length <= 1) {
      return;
    }
    return {
      name: workflowName,
      steps: definition.steps,
      transitions: definition.transitions,
    };
  };

  // Use the Vercel AI SDK's useChat hook
  const { messages, sendMessage, status, stop, error } = useChat({
    transport: new DefaultChatTransport({
      api: `/api/${orgSlug}/workflows/ai/generate`,
      body: {
        workflowId,
        existingWorkflow: getExistingWorkflow(),
      },
    }),
    onError: (error) => {
      // Check if this is a rate limit error
      if (error.message?.includes("limit reached")) {
        toast.error("AI message limit reached", {
          description: "Upgrade your plan for more AI messages.",
        });
        refetchUsage();
      } else {
        toast.error("Failed to generate workflow", {
          description: error.message,
        });
      }
    },
    onFinish: () => {
      // Refetch usage after successful request
      queryClient.invalidateQueries({ queryKey: getAiUsageQueryKey(orgSlug) });
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Throttle AI requests to max 1 every 5 seconds
  const sendMessageThrottler = useThrottler(
    (text: string) => {
      sendMessage({ text });
    },
    {
      wait: 5000,
      leading: true,
      trailing: false,
    }
  );

  // Show warning toast when approaching limit
  useEffect(() => {
    if (aiUsage?.warning && !hasShownWarningToast) {
      toast.warning("AI Usage Warning", {
        description: aiUsage.warning,
        duration: 6000,
      });
      setHasShownWarningToast(true);
    }
  }, [aiUsage?.warning, hasShownWarningToast]);

  // Extract workflow from the latest assistant message and store as pending
  useEffect(() => {
    const lastMessage = messages.at(-1);
    if (lastMessage?.role === "assistant" && !isLoading) {
      const textContent = lastMessage.parts
        .filter(
          (part): part is { type: "text"; text: string } => part.type === "text"
        )
        .map((part) => part.text)
        .join("");

      const workflow = extractWorkflowFromMessage(textContent);
      if (workflow) {
        // Store as pending instead of auto-applying
        setPendingWorkflow({
          steps: workflow.steps,
          transitions: workflow.transitions,
        });
      }
    }
  }, [messages, isLoading]);

  // Handle applying the pending workflow
  const handleApplyWorkflow = useCallback(() => {
    if (!pendingWorkflow) {
      return;
    }

    applyAIFlow(pendingWorkflow.steps, pendingWorkflow.transitions);
    toast.success("Workflow applied to canvas", {
      description: `Created ${pendingWorkflow.steps.length} steps with ${pendingWorkflow.transitions.length} connections.`,
    });
    setPendingWorkflow(null);
  }, [pendingWorkflow, applyAIFlow]);

  // Handle discarding the pending workflow
  const handleDiscardWorkflow = useCallback(() => {
    setPendingWorkflow(null);
  }, []);

  const handleSendMessage = useCallback(
    (text: string) => {
      if (!text.trim() || isLoading) {
        return;
      }
      sendMessageThrottler.maybeExecute(text.trim());
      setInput("");
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

  // Collapsed state - just show a toggle button
  if (isCollapsed) {
    return (
      <div className="flex h-full w-10 flex-col items-center border-r bg-muted/30 py-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={() => setIsCollapsed(false)}
              size="icon-sm"
              variant="ghost"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>Open AI Assistant</p>
          </TooltipContent>
        </Tooltip>
        <div className="mt-2">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-80 min-w-80 flex-col border-r bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-medium">AI Assistant</span>
          {aiUsage && aiUsage.limit !== -1 && (
            <span className="text-muted-foreground text-xs">
              ({aiUsage.current}/{aiUsage.limit})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
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
          <Button
            onClick={() => setIsCollapsed(true)}
            size="icon-sm"
            variant="ghost"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Usage Warning Banner */}
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
                You've used all {aiUsage.limit} AI messages this month.
              </p>
              <Button asChild className="h-8" size="sm">
                <a href={`/${orgSlug}/settings/billing`}>Upgrade Plan</a>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Welcome */}
              <div className="py-4 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Wand2 className="h-5 w-5 text-primary" />
                </div>
                <h4 className="mb-1 font-medium text-sm">AI Assistant</h4>
                <p className="text-muted-foreground text-xs">
                  Describe your automation and I'll build it
                </p>
              </div>

              {/* Quick prompts */}
              <div className="space-y-2">
                <p className="px-1 font-medium text-muted-foreground text-xs">
                  Quick prompts
                </p>
                <div className="flex flex-col gap-1.5">
                  {QUICK_PROMPTS.map((qp) => (
                    <Button
                      className="h-auto justify-start text-left"
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
          )
        }
        isLoading={isLoading}
        loadingLabel="Generating your workflow..."
        messages={messages}
        renderAssistantText={(text) => (
          <Markdown>
            {text.replace(/```json[\s\S]*?```/g, "[Workflow generated]")}
          </Markdown>
        )}
      />

      {/* Pending Workflow Actions */}
      {pendingWorkflow && !isLoading && (
        <div className="border-t bg-muted/50 px-3 py-2">
          <p className="mb-1.5 font-medium text-xs">
            Apply generated workflow?
          </p>
          <p className="mb-2 text-muted-foreground text-xs">
            {pendingWorkflow.steps.length} step
            {pendingWorkflow.steps.length !== 1 ? "s" : ""},{" "}
            {pendingWorkflow.transitions.length} connection
            {pendingWorkflow.transitions.length !== 1 ? "s" : ""}
          </p>
          <div className="flex gap-1.5">
            <Button
              className="h-7 flex-1"
              onClick={handleApplyWorkflow}
              size="sm"
            >
              <Check className="mr-1 h-3 w-3" />
              Apply
            </Button>
            <Button
              className="h-7 flex-1"
              onClick={handleDiscardWorkflow}
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
        <div className="relative">
          <Textarea
            className="min-h-[44px] resize-none pr-10 text-sm"
            disabled={isLoading || aiUsage?.remaining === 0}
            onChange={(e) => {
              setInput(e.target.value);
              adjustHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Describe your automation..."
            ref={textareaRef}
            rows={1}
            value={input}
          />
          <Button
            className="absolute right-1.5 bottom-1.5 h-7 w-7"
            disabled={!input.trim() || isLoading}
            size="sm"
            type="submit"
            variant="ghost"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
