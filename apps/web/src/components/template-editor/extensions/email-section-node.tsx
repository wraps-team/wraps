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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  borderRadiusPresets,
  PresetSelector,
  paddingPresets,
  TailwindColorPicker,
} from "@/components/ui/tailwind-color-picker";
import { DragHandle } from "./drag-handle";

export type EmailSectionAttributes = {
  backgroundColor: string;
  padding: string;
  maxWidth: string;
  borderRadius: string;
};

declare module "@tiptap/core" {
  // biome-ignore lint/style/useConsistentTypeDefinitions: interface required for module augmentation
  interface Commands<ReturnType> {
    emailSection: {
      insertEmailSection: (
        attributes?: Partial<EmailSectionAttributes>
      ) => ReturnType;
      updateEmailSection: (
        attributes: Partial<EmailSectionAttributes>
      ) => ReturnType;
    };
  }
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

      {/* Drag handle and settings button */}
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <DragHandle />
        <Popover onOpenChange={setIsEditing} open={isEditing}>
          <PopoverTrigger asChild>
            <Button className="h-6 w-6" size="icon" variant="secondary">
              <Settings2 className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <div className="space-y-4">
              <h4 className="font-medium">Section Settings</h4>

              <TailwindColorPicker
                label="Background Color"
                onChange={(v) => updateAttributes({ backgroundColor: v })}
                value={attrs.backgroundColor}
              />

              <PresetSelector
                label="Padding"
                onChange={(v) => updateAttributes({ padding: v })}
                presets={paddingPresets}
                value={attrs.padding}
              />

              <PresetSelector
                label="Max Width"
                onChange={(v) => updateAttributes({ maxWidth: v })}
                presets={[
                  { label: "SM", value: "480px" },
                  { label: "MD", value: "600px" },
                  { label: "LG", value: "720px" },
                  { label: "Full", value: "100%" },
                ]}
                value={attrs.maxWidth}
              />

              <PresetSelector
                label="Border Radius"
                onChange={(v) => updateAttributes({ borderRadius: v })}
                presets={borderRadiusPresets}
                value={attrs.borderRadius}
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>
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
