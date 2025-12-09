"use client";

import { useDebouncer } from "@tanstack/react-pacer";
import type { JSONContent } from "@tiptap/core";
import Blockquote from "@tiptap/extension-blockquote";
import BulletList from "@tiptap/extension-bullet-list";
import { Color } from "@tiptap/extension-color";
import Heading from "@tiptap/extension-heading";
import OrderedList from "@tiptap/extension-ordered-list";
import Paragraph from "@tiptap/extension-paragraph";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useCallback, useEffect, useMemo, useRef } from "react";

// Import custom extensions
import {
  ConditionalNode,
  EmailAvatarNode,
  EmailButtonNode,
  EmailCodeBlockNode,
  EmailCodeInlineMark,
  EmailColumnNode,
  EmailDividerNode,
  EmailImageNode,
  EmailPreviewNode,
  EmailRowNode,
  EmailSectionNode,
  EmailSocialLinksNode,
  EmailSpacerNode,
  KeyboardShortcuts,
  VariableNode,
  VariableSuggestion,
} from "@/components/template-editor/extensions";

type UseTemplateEditorOptions = {
  templateId: string;
  initialContent?: JSONContent;
  onSave?: (content: JSONContent) => Promise<void>;
  onUpdate?: (content: JSONContent) => void;
  onToggleBlockLibrary?: () => void;
  collaborative?: boolean;
  /** Auto-save delay in milliseconds (default: 60000 = 1 minute) */
  autoSaveDelay?: number;
};

export function useTemplateEditor({
  templateId,
  initialContent,
  onSave,
  onUpdate,
  onToggleBlockLibrary,
  collaborative = false,
  autoSaveDelay = 60_000, // 1 minute default
}: UseTemplateEditorOptions) {
  const lastSavedContentRef = useRef<string>("");

  // Save function that checks for changes
  const saveContent = useCallback(
    async (content: JSONContent) => {
      const contentStr = JSON.stringify(content);

      // Only save if content has changed
      if (contentStr !== lastSavedContentRef.current) {
        lastSavedContentRef.current = contentStr;
        await onSave?.(content);
      }
    },
    [onSave]
  );

  // Use TanStack Pacer for debounced auto-save (1 minute by default)
  const saveDebouncer = useDebouncer(saveContent, {
    wait: autoSaveDelay,
  });

  // Default empty document structure with Preview for inbox preview text
  const defaultContent: JSONContent = useMemo(
    () => ({
      type: "doc",
      content: [
        {
          type: "emailPreview",
          attrs: {
            text: "Preview text shown in inbox",
          },
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Start typing or add blocks..." }],
        },
      ],
    }),
    []
  );

  const editor = useEditor({
    // Required for Next.js SSR compatibility
    immediatelyRender: false,

    extensions: [
      StarterKit.configure({
        // Disable extensions we're replacing with draggable versions
        paragraph: false,
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        // Disable code extensions we don't need
        codeBlock: false,
        code: false,
        // Note: history is handled by StarterKit by default
        // When collaboration is enabled, we'll need to add Yjs extensions separately
      }),

      // Text blocks with draggable enabled
      Paragraph.extend({ draggable: true }),
      Heading.extend({ draggable: true }),
      Blockquote.extend({ draggable: true }),
      BulletList.extend({ draggable: true }),
      OrderedList.extend({ draggable: true }),

      Placeholder.configure({
        placeholder:
          "Start typing or use the block palette to add email components...",
        showOnlyWhenEditable: true,
      }),

      // Text styling extensions (required for block examples with colors and alignment)
      TextStyle,
      Color,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),

      // React Email nodes
      EmailButtonNode,
      EmailSectionNode,
      EmailImageNode,
      EmailDividerNode,
      EmailSpacerNode,
      EmailRowNode,
      EmailColumnNode,
      EmailPreviewNode,
      EmailAvatarNode,
      EmailCodeBlockNode,
      EmailSocialLinksNode,

      // Marks
      EmailCodeInlineMark,

      // Dynamic content
      VariableNode,
      ConditionalNode,

      // Variable autocomplete (type {{ to trigger)
      VariableSuggestion,

      // Keyboard shortcuts (Cmd+S to save, Cmd+K for block palette)
      KeyboardShortcuts.configure({
        onSave: (editorInstance) => {
          // Trigger manual save - editor instance is passed from the shortcut handler
          if (onSave) {
            const content = editorInstance.getJSON();
            onSave(content);
          }
        },
        onToggleBlockLibrary,
      }),

      // Future: Collaboration extensions
      // ...(collaborative && ydoc ? [
      //   Collaboration.configure({ document: ydoc }),
      //   CollaborationCursor.configure({ provider })
      // ] : [])
    ],

    content: initialContent || defaultContent,

    editorProps: {
      attributes: {
        class:
          "prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-[400px]",
      },
    },

    onUpdate: ({ editor }) => {
      const content = editor.getJSON();
      onUpdate?.(content);

      // Trigger auto-save via Pacer debouncer
      if (onSave) {
        saveDebouncer.maybeExecute(content);
      }
    },

    // Track selection for properties panel
    onSelectionUpdate: ({ editor }) => {
      // Could emit selected node info here for properties panel
      const { from, to } = editor.state.selection;
      const _node = editor.state.doc.nodeAt(from);
      // Emit node info if needed
    },
  });

  // Initialize lastSavedContentRef when editor is ready
  useEffect(() => {
    if (editor && initialContent) {
      lastSavedContentRef.current = JSON.stringify(initialContent);
    }
  }, [editor, initialContent]);

  // Manual save function - flushes any pending debounced save and saves immediately
  const saveNow = useCallback(async () => {
    if (!(editor && onSave)) {
      return;
    }

    // Cancel any pending debounced save
    saveDebouncer.cancel();

    const content = editor.getJSON();
    lastSavedContentRef.current = JSON.stringify(content);
    await onSave(content);
  }, [editor, onSave, saveDebouncer]);

  // Helper to insert blocks
  const insertBlock = useCallback(
    (
      type:
        | "emailButton"
        | "emailSection"
        | "emailImage"
        | "emailDivider"
        | "emailSpacer"
        | "emailRow"
        | "conditional"
        | "variable",
      attrs?: Record<string, unknown>
    ) => {
      if (!editor) {
        return;
      }

      switch (type) {
        case "emailButton":
          editor.commands.insertEmailButton(attrs);
          break;
        case "emailSection":
          editor.commands.insertEmailSection(attrs);
          break;
        case "emailImage":
          editor.commands.insertEmailImage(attrs);
          break;
        case "emailDivider":
          editor.commands.insertEmailDivider(attrs);
          break;
        case "emailSpacer":
          editor.commands.insertEmailSpacer(attrs);
          break;
        case "emailRow":
          editor.commands.insertEmailRow(attrs, 2);
          break;
        case "conditional":
          editor.commands.insertConditional(attrs);
          break;
        case "variable":
          editor.commands.insertVariable(
            attrs as { name?: string; label?: string }
          );
          break;
      }
    },
    [editor]
  );

  return {
    editor,
    saveNow,
    insertBlock,
    isReady: !!editor,
  };
}
