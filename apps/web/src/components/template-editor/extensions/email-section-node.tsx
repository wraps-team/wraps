"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewContent,
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { Settings2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type EmailSectionAttributes = {
  backgroundColor: string;
  padding: string;
  maxWidth: string;
  borderRadius: string;
};

declare module "@tiptap/core" {
  type Commands<ReturnType> = {
    emailSection: {
      insertEmailSection: (
        attributes?: Partial<EmailSectionAttributes>
      ) => ReturnType;
      updateEmailSection: (
        attributes: Partial<EmailSectionAttributes>
      ) => ReturnType;
    };
  };
}

const EmailSectionNodeView = ({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const attrs = node.attrs as EmailSectionAttributes;

  return (
    <NodeViewWrapper
      className={`email-section-wrapper group relative my-4 ${selected ? "ring-2 ring-primary ring-offset-2" : ""}`}
    >
      <div
        className="email-section"
        style={{
          backgroundColor: attrs.backgroundColor,
          padding: attrs.padding,
          maxWidth: attrs.maxWidth,
          borderRadius: attrs.borderRadius,
          margin: "0 auto",
        }}
      >
        <NodeViewContent />
      </div>

      <Popover onOpenChange={setIsEditing} open={isEditing}>
        <PopoverTrigger asChild>
          <Button
            className="absolute top-2 right-2 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
            size="icon"
            variant="secondary"
          >
            <Settings2 className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <div className="space-y-4">
            <h4 className="font-medium">Section Settings</h4>

            <div className="space-y-2">
              <Label htmlFor="backgroundColor">Background Color</Label>
              <div className="flex gap-2">
                <Input
                  className="h-10 w-10 cursor-pointer p-1"
                  id="backgroundColor"
                  onChange={(e) =>
                    updateAttributes({ backgroundColor: e.target.value })
                  }
                  type="color"
                  value={attrs.backgroundColor}
                />
                <Input
                  className="flex-1"
                  onChange={(e) =>
                    updateAttributes({ backgroundColor: e.target.value })
                  }
                  value={attrs.backgroundColor}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="padding">Padding</Label>
              <Input
                id="padding"
                onChange={(e) => updateAttributes({ padding: e.target.value })}
                placeholder="32px 24px"
                value={attrs.padding}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxWidth">Max Width</Label>
              <Input
                id="maxWidth"
                onChange={(e) => updateAttributes({ maxWidth: e.target.value })}
                placeholder="600px"
                value={attrs.maxWidth}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="borderRadius">Border Radius</Label>
              <Input
                id="borderRadius"
                onChange={(e) =>
                  updateAttributes({ borderRadius: e.target.value })
                }
                placeholder="0px"
                value={attrs.borderRadius}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
};

export const EmailSectionNode = Node.create({
  name: "emailSection",
  group: "block",
  content: "block+",
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      backgroundColor: { default: "#ffffff" },
      padding: { default: "32px 24px" },
      maxWidth: { default: "600px" },
      borderRadius: { default: "0px" },
    };
  },

  parseHTML() {
    return [{ tag: "email-section" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["email-section", mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmailSectionNodeView);
  },

  addCommands() {
    return {
      insertEmailSection:
        (attributes = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: attributes,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Add content here..." }],
              },
            ],
          }),
      updateEmailSection:
        (attributes) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attributes),
    };
  },
});
