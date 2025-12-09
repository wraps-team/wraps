"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { Eye, Pencil } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { DragHandle } from "./drag-handle";

export type EmailPreviewAttributes = {
  text: string;
};

declare module "@tiptap/core" {
  // biome-ignore lint/style/useConsistentTypeDefinitions: interface required for module augmentation
  interface Commands<ReturnType> {
    emailPreview: {
      insertEmailPreview: (
        attributes?: Partial<EmailPreviewAttributes>
      ) => ReturnType;
      updateEmailPreview: (
        attributes: Partial<EmailPreviewAttributes>
      ) => ReturnType;
    };
  }
}

const EmailPreviewNodeView = ({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const attrs = node.attrs as EmailPreviewAttributes;
  const [localText, setLocalText] = useState(attrs.text);

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setLocalText(attrs.text);
    } else {
      updateAttributes({ text: localText });
    }
    setIsEditing(open);
  };

  return (
    <NodeViewWrapper
      className={`email-preview-wrapper my-2 ${selected ? "ring-2 ring-primary ring-offset-2" : ""}`}
    >
      <div className="group relative rounded-lg border border-muted-foreground/30 border-dashed bg-muted/30 p-3">
        <div className="flex items-start gap-2">
          <Eye className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="mb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
              Preview Text (Preheader)
            </div>
            <p className="text-muted-foreground text-sm">
              {attrs.text || "Add preview text that appears in inbox..."}
            </p>
          </div>
        </div>

        {/* Drag handle and edit button */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <DragHandle />
          <Popover onOpenChange={handleOpenChange} open={isEditing}>
            <PopoverTrigger asChild>
              <Button className="h-6 w-6" size="icon" variant="secondary">
                <Pencil className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-96">
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium">Preview Text</h4>
                  <p className="text-muted-foreground text-xs">
                    This text appears in the inbox preview before the email is
                    opened. Keep it under 150 characters.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="preview-text">Preview Text</Label>
                  <Textarea
                    className="min-h-[80px]"
                    id="preview-text"
                    maxLength={150}
                    onChange={(e) => setLocalText(e.target.value)}
                    placeholder="Enter preview text..."
                    value={localText}
                  />
                  <div className="text-right text-muted-foreground text-xs">
                    {localText.length}/150 characters
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export const EmailPreviewNode = Node.create({
  name: "emailPreview",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      text: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "email-preview" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["email-preview", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmailPreviewNodeView);
  },

  addCommands() {
    return {
      insertEmailPreview:
        (attributes = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: attributes,
          }),
      updateEmailPreview:
        (attributes) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attributes),
    };
  },
});
