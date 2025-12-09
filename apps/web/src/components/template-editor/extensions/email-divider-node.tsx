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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  PresetSelector,
  paddingPresets,
  TailwindColorPicker,
} from "@/components/ui/tailwind-color-picker";
import { DragHandle } from "./drag-handle";

export type EmailDividerAttributes = {
  borderColor: string;
  borderWidth: string;
  margin: string;
};

declare module "@tiptap/core" {
  // biome-ignore lint/style/useConsistentTypeDefinitions: interface required for module augmentation
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

      {/* Drag handle and settings button */}
      <div className="-translate-y-1/2 absolute top-1/2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <DragHandle />
        <Popover onOpenChange={setIsEditing} open={isEditing}>
          <PopoverTrigger asChild>
            <Button className="h-6 w-6" size="icon" variant="secondary">
              <Settings2 className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <div className="space-y-4">
              <h4 className="font-medium">Divider Settings</h4>

              <TailwindColorPicker
                label="Color"
                onChange={(v) => updateAttributes({ borderColor: v })}
                value={attrs.borderColor}
              />

              <PresetSelector
                label="Thickness"
                onChange={(v) => updateAttributes({ borderWidth: v })}
                presets={[
                  { label: "Thin", value: "1px" },
                  { label: "Medium", value: "2px" },
                  { label: "Thick", value: "4px" },
                ]}
                value={attrs.borderWidth}
              />

              <PresetSelector
                label="Margin"
                onChange={(v) => updateAttributes({ margin: v })}
                presets={paddingPresets}
                value={attrs.margin}
              />
            </div>
          </PopoverContent>
        </Popover>
      </div>
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
