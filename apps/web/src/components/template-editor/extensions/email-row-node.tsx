"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewContent,
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { Columns, Settings2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type EmailRowAttributes = {
  gap: string;
};

declare module "@tiptap/core" {
  type Commands<ReturnType> = {
    emailRow: {
      insertEmailRow: (
        attributes?: Partial<EmailRowAttributes>,
        columns?: number
      ) => ReturnType;
    };
  };
}

const EmailRowNodeView = ({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const attrs = node.attrs as EmailRowAttributes;

  return (
    <NodeViewWrapper
      className={`email-row-wrapper group relative my-4 ${selected ? "rounded ring-2 ring-primary ring-offset-2" : ""}`}
    >
      <div className="email-row flex" style={{ gap: attrs.gap }}>
        <NodeViewContent />
      </div>

      <Popover onOpenChange={setIsEditing} open={isEditing}>
        <PopoverTrigger asChild>
          <Button
            className="-top-2 absolute right-2 z-10 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
            size="icon"
            variant="secondary"
          >
            <Settings2 className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64">
          <div className="space-y-4">
            <h4 className="font-medium">Row Settings</h4>

            <div className="space-y-2">
              <Label htmlFor="gap">Column Gap</Label>
              <Input
                id="gap"
                onChange={(e) => updateAttributes({ gap: e.target.value })}
                placeholder="16px"
                value={attrs.gap}
              />
            </div>

            <div className="flex gap-2">
              {["8px", "16px", "24px", "32px"].map((g) => (
                <Button
                  key={g}
                  onClick={() => updateAttributes({ gap: g })}
                  size="sm"
                  variant={attrs.gap === g ? "default" : "outline"}
                >
                  {g}
                </Button>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Visual indicator for row */}
      <div className="-left-4 absolute top-0 bottom-0 flex items-center">
        <div className="flex items-center gap-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          <Columns className="h-3 w-3" />
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export const EmailRowNode = Node.create({
  name: "emailRow",
  group: "block",
  content: "emailColumn+",
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      gap: { default: "16px" },
    };
  },

  parseHTML() {
    return [{ tag: "email-row" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["email-row", mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmailRowNodeView);
  },

  addCommands() {
    return {
      insertEmailRow:
        (attributes = {}, columns = 2) =>
        ({ commands }) => {
          const columnContent = Array.from({ length: columns }, () => ({
            type: "emailColumn",
            attrs: { width: `${100 / columns}%` },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Column content" }],
              },
            ],
          }));

          return commands.insertContent({
            type: this.name,
            attrs: attributes,
            content: columnContent,
          });
        },
    };
  },
});
