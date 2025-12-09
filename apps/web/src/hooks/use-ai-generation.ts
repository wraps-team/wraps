"use client";

import { useChat } from "@ai-sdk/react";
import type { JSONContent } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useMemo, useState } from "react";
import { extractTipTapJson } from "@/lib/ai/validator";

type UseAIGenerationOptions = {
  orgSlug: string;
  templateId?: string;
  editor: Editor | null;
  onGenerate?: (content: JSONContent) => void;
};

type QuickPrompt = {
  label: string;
  prompt: string;
};

export function useAIGeneration({
  orgSlug,
  templateId,
  editor,
  onGenerate,
}: UseAIGenerationOptions) {
  const [isApplying, setIsApplying] = useState(false);
  const [lastGeneratedContent, setLastGeneratedContent] =
    useState<JSONContent | null>(null);
  const [inputValue, setInputValue] = useState("");

  // Create transport with memoization to avoid recreation on every render
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/${orgSlug}/templates/ai/generate`,
        body: {
          templateId,
          existingContent: editor?.getJSON(),
        },
      }),
    [orgSlug, templateId, editor]
  );

  const { messages, sendMessage, status, error, stop } = useChat({
    transport,
    onFinish: ({ message }) => {
      // Extract TipTap JSON from response
      // Get text content from message parts
      const textContent = message.parts
        .filter(
          (part): part is { type: "text"; text: string } => part.type === "text"
        )
        .map((part) => part.text)
        .join("");

      const content = extractTipTapJson(textContent);
      if (content) {
        setLastGeneratedContent(content);
      }
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Apply generated content to editor
  const applyToEditor = useCallback(() => {
    if (!(lastGeneratedContent && editor)) {
      return;
    }

    setIsApplying(true);
    try {
      editor.commands.setContent(lastGeneratedContent);
      onGenerate?.(lastGeneratedContent);
    } finally {
      setIsApplying(false);
    }
  }, [lastGeneratedContent, editor, onGenerate]);

  // Clear generated content
  const clearGeneratedContent = useCallback(() => {
    setLastGeneratedContent(null);
  }, []);

  // Handle input change
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInputValue(e.target.value);
    },
    []
  );

  // Handle form submit
  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!inputValue.trim()) {
        return;
      }
      sendMessage({ text: inputValue });
      setInputValue("");
    },
    [inputValue, sendMessage]
  );

  // Quick prompts for common actions
  const quickPrompts: QuickPrompt[] = [
    {
      label: "Welcome Email",
      prompt: "Create a welcome email for new users",
    },
    {
      label: "Password Reset",
      prompt: "Create a password reset email with a reset button",
    },
    {
      label: "Order Confirmation",
      prompt: "Create an order confirmation email with order details",
    },
    {
      label: "Newsletter",
      prompt: "Create a newsletter template with multiple sections",
    },
    {
      label: "Invoice",
      prompt: "Create an invoice email with line items",
    },
  ];

  return {
    messages,
    input: inputValue,
    setInput: setInputValue,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    stop,
    sendMessage,
    lastGeneratedContent,
    applyToEditor,
    clearGeneratedContent,
    isApplying,
    quickPrompts,
  };
}
