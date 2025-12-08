"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface EmailButtonAttributes {
  href: string;
  backgroundColor: string;
  color: string;
  borderRadius: string;
  padding: string;
  fontSize: string;
  fontWeight: string;
  align: "left" | "center" | "right";
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    emailButton: {
      insertEmailButton: (
        attributes?: Partial<EmailButtonAttributes>
      ) => ReturnType;
      updateEmailButton: (
        attributes: Partial<EmailButtonAttributes>
      ) => ReturnType;
    };
  }
}

const EmailButtonNodeView = ({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const attrs = node.attrs as EmailButtonAttributes & { text?: string };

  const buttonText = node.textContent || "Click me";

  return (
    <NodeViewWrapper
      className={`email-button-wrapper my-2 ${selected ? "ring-2 ring-primary ring-offset-2" : ""}`}
      style={{ textAlign: attrs.align }}
    >
      <div className="group relative inline-block">
        <a
          className="pointer-events-none inline-block no-underline"
          href={attrs.href}
          style={{
            backgroundColor: attrs.backgroundColor,
            color: attrs.color,
            borderRadius: attrs.borderRadius,
            padding: attrs.padding,
            fontSize: attrs.fontSize,
            fontWeight: attrs.fontWeight,
            textDecoration: "none",
          }}
        >
          {buttonText}
        </a>

        <Popover onOpenChange={setIsEditing} open={isEditing}>
          <PopoverTrigger asChild>
            <Button
              className="-top-2 -right-2 absolute h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
              size="icon"
              variant="secondary"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80">
            <div className="space-y-4">
              <h4 className="font-medium">Edit Button</h4>

              <div className="space-y-2">
                <Label htmlFor="href">URL</Label>
                <Input
                  id="href"
                  onChange={(e) => updateAttributes({ href: e.target.value })}
                  placeholder="https://example.com"
                  value={attrs.href}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="backgroundColor">Background</Label>
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
                  <Label htmlFor="color">Text Color</Label>
                  <div className="flex gap-2">
                    <Input
                      className="h-10 w-10 cursor-pointer p-1"
                      id="color"
                      onChange={(e) =>
                        updateAttributes({ color: e.target.value })
                      }
                      type="color"
                      value={attrs.color}
                    />
                    <Input
                      className="flex-1"
                      onChange={(e) =>
                        updateAttributes({ color: e.target.value })
                      }
                      value={attrs.color}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="borderRadius">Border Radius</Label>
                <Input
                  id="borderRadius"
                  onChange={(e) =>
                    updateAttributes({ borderRadius: e.target.value })
                  }
                  placeholder="4px"
                  value={attrs.borderRadius}
                />
              </div>

              <div className="space-y-2">
                <Label>Alignment</Label>
                <div className="flex gap-2">
                  {(["left", "center", "right"] as const).map((alignment) => (
                    <Button
                      className="flex-1 capitalize"
                      key={alignment}
                      onClick={() => updateAttributes({ align: alignment })}
                      size="sm"
                      variant={
                        attrs.align === alignment ? "default" : "outline"
                      }
                    >
                      {alignment}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </NodeViewWrapper>
  );
};

export const EmailButtonNode = Node.create({
  name: "emailButton",
  group: "block",
  content: "inline*",
  draggable: true,

  addAttributes() {
    return {
      href: { default: "https://example.com" },
      backgroundColor: { default: "#5046e5" },
      color: { default: "#ffffff" },
      borderRadius: { default: "4px" },
      padding: { default: "12px 24px" },
      fontSize: { default: "16px" },
      fontWeight: { default: "600" },
      align: { default: "left" },
    };
  },

  parseHTML() {
    return [{ tag: "email-button" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["email-button", mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmailButtonNodeView);
  },

  addCommands() {
    return {
      insertEmailButton:
        (attributes = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: attributes,
            content: [{ type: "text", text: "Click me" }],
          }),
      updateEmailButton:
        (attributes) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attributes),
    };
  },
});
