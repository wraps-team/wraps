"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewContent,
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
import {
  borderRadiusPresets,
  fontSizePresets,
  fontWeightPresets,
  PresetSelector,
  TailwindColorPicker,
} from "@/components/ui/tailwind-color-picker";
import { DragHandle } from "./drag-handle";

export type EmailButtonAttributes = {
  href: string;
  backgroundColor: string;
  color: string;
  borderRadius: string;
  padding: string;
  fontSize: string;
  fontWeight: string;
  align: "left" | "center" | "right";
};

declare module "@tiptap/core" {
  // biome-ignore lint/style/useConsistentTypeDefinitions: interface required for module augmentation
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
  const attrs = node.attrs as EmailButtonAttributes;

  // Local state for form fields to prevent cursor jumping
  const [localAttrs, setLocalAttrs] = useState<EmailButtonAttributes>(attrs);

  // Sync local state when popover opens
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setLocalAttrs(attrs);
    } else {
      // Apply changes when closing
      updateAttributes(localAttrs);
    }
    setIsEditing(open);
  };

  const updateLocal = (key: keyof EmailButtonAttributes, value: string) => {
    setLocalAttrs((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <NodeViewWrapper
      className={`email-button-wrapper my-2 ${selected ? "ring-2 ring-primary ring-offset-2" : ""}`}
      style={{ textAlign: attrs.align }}
    >
      <div className="group relative inline-block">
        <NodeViewContent
          className="inline-block cursor-text no-underline outline-none"
          style={{
            backgroundColor: attrs.backgroundColor,
            color: attrs.color,
            borderRadius: attrs.borderRadius,
            padding: attrs.padding,
            fontSize: attrs.fontSize,
            fontWeight: attrs.fontWeight,
            textDecoration: "none",
            display: "inline-block",
          }}
        />

        {/* Drag handle and edit button */}
        <div className="-top-2 -right-2 absolute flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <DragHandle />
          <Popover onOpenChange={handleOpenChange} open={isEditing}>
            <PopoverTrigger asChild>
              <Button className="h-6 w-6" size="icon" variant="secondary">
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
                    onChange={(e) => updateLocal("href", e.target.value)}
                    placeholder="https://example.com"
                    value={localAttrs.href}
                  />
                </div>

                <TailwindColorPicker
                  label="Background"
                  onChange={(v) => updateLocal("backgroundColor", v)}
                  value={localAttrs.backgroundColor}
                />

                <TailwindColorPicker
                  label="Text Color"
                  onChange={(v) => updateLocal("color", v)}
                  value={localAttrs.color}
                />

                <PresetSelector
                  label="Font Size"
                  onChange={(v) => updateLocal("fontSize", v)}
                  presets={fontSizePresets}
                  value={localAttrs.fontSize}
                />

                <PresetSelector
                  label="Font Weight"
                  onChange={(v) => updateLocal("fontWeight", v)}
                  presets={fontWeightPresets}
                  value={localAttrs.fontWeight}
                />

                <PresetSelector
                  label="Padding"
                  onChange={(v) => updateLocal("padding", v)}
                  presets={[
                    { label: "SM", value: "8px 16px" },
                    { label: "MD", value: "12px 24px" },
                    { label: "LG", value: "16px 32px" },
                    { label: "XL", value: "20px 40px" },
                  ]}
                  value={localAttrs.padding}
                />

                <PresetSelector
                  label="Border Radius"
                  onChange={(v) => updateLocal("borderRadius", v)}
                  presets={borderRadiusPresets}
                  value={localAttrs.borderRadius}
                />

                <div className="space-y-2">
                  <Label>Alignment</Label>
                  <div className="flex gap-2">
                    {(["left", "center", "right"] as const).map((alignment) => (
                      <Button
                        className="flex-1 capitalize"
                        key={alignment}
                        onClick={() => updateLocal("align", alignment)}
                        size="sm"
                        variant={
                          localAttrs.align === alignment ? "default" : "outline"
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
