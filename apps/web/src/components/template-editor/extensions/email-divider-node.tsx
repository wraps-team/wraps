"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import {
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

export interface EmailDividerAttributes {
  borderColor: string;
  borderWidth: string;
  margin: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    emailDivider: {
      insertEmailDivider: (
        attributes?: Partial<EmailDividerAttributes>
      ) => ReturnType;
    };
  }
}

const EmailDividerNodeView = ({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const attrs = node.attrs as EmailDividerAttributes;

  return (
    <NodeViewWrapper
      className={`email-divider-wrapper group relative ${selected ? "rounded ring-2 ring-primary ring-offset-2" : ""}`}
    >
      <hr
        className="border-0"
        style={{
          borderTop: `${attrs.borderWidth} solid ${attrs.borderColor}`,
          margin: attrs.margin,
        }}
      />

      <Popover onOpenChange={setIsEditing} open={isEditing}>
        <PopoverTrigger asChild>
          <Button
            className="-translate-y-1/2 absolute top-1/2 right-2 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
            size="icon"
            variant="secondary"
          >
            <Settings2 className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <div className="space-y-4">
            <h4 className="font-medium">Divider Settings</h4>

            <div className="space-y-2">
              <Label htmlFor="borderColor">Color</Label>
              <div className="flex gap-2">
                <Input
                  className="h-10 w-10 cursor-pointer p-1"
                  id="borderColor"
                  onChange={(e) =>
                    updateAttributes({ borderColor: e.target.value })
                  }
                  type="color"
                  value={attrs.borderColor}
                />
                <Input
                  className="flex-1"
                  onChange={(e) =>
                    updateAttributes({ borderColor: e.target.value })
                  }
                  value={attrs.borderColor}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="borderWidth">Thickness</Label>
              <Input
                id="borderWidth"
                onChange={(e) =>
                  updateAttributes({ borderWidth: e.target.value })
                }
                placeholder="1px"
                value={attrs.borderWidth}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="margin">Margin</Label>
              <Input
                id="margin"
                onChange={(e) => updateAttributes({ margin: e.target.value })}
                placeholder="24px 0"
                value={attrs.margin}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
};

export const EmailDividerNode = Node.create({
  name: "emailDivider",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      borderColor: { default: "#e5e7eb" },
      borderWidth: { default: "1px" },
      margin: { default: "24px 0" },
    };
  },

  parseHTML() {
    return [{ tag: "email-divider" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["email-divider", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmailDividerNodeView);
  },

  addCommands() {
    return {
      insertEmailDivider:
        (attributes = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: attributes,
          }),
    };
  },
});
