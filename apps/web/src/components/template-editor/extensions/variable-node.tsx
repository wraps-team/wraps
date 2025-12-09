"use client";

import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { Braces } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type VariableAttributes = {
  name: string;
  label: string;
  fallback: string;
  format: string | null;
};

declare module "@tiptap/core" {
  // biome-ignore lint/style/useConsistentTypeDefinitions: interface required for module augmentation
  interface Commands<ReturnType> {
    variable: {
      insertVariable: (attributes: Partial<VariableAttributes>) => ReturnType;
    };
  }
}

const VariableNodeView = ({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const attrs = node.attrs as VariableAttributes;

  return (
    <NodeViewWrapper
      as="span"
      className={`variable-wrapper inline ${selected ? "rounded ring-2 ring-primary ring-offset-1" : ""}`}
    >
      <Popover onOpenChange={setIsEditing} open={isEditing}>
        <PopoverTrigger asChild>
          <span
            className="variable-chip inline-flex cursor-pointer items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-800 text-xs transition-colors hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:hover:bg-blue-800"
            contentEditable={false}
          >
            <Braces className="h-3 w-3" />
            {attrs.label || attrs.name}
            {attrs.fallback && (
              <span className="text-blue-600 dark:text-blue-400">
                | "{attrs.fallback}"
              </span>
            )}
          </span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <div className="space-y-4">
            <h4 className="flex items-center gap-2 font-medium">
              <Braces className="h-4 w-4" />
              Variable Settings
            </h4>

            <div className="space-y-2">
              <Label htmlFor="name">Variable Name</Label>
              <Input
                id="name"
                onChange={(e) => updateAttributes({ name: e.target.value })}
                placeholder="firstName"
                value={attrs.name}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="label">Display Label</Label>
              <Input
                id="label"
                onChange={(e) => updateAttributes({ label: e.target.value })}
                placeholder="First Name"
                value={attrs.label}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fallback">Fallback Value</Label>
              <Input
                id="fallback"
                onChange={(e) => updateAttributes({ fallback: e.target.value })}
                placeholder="there"
                value={attrs.fallback}
              />
              <p className="text-muted-foreground text-xs">
                Used when the variable is not provided
              </p>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
};

// Suggestion items for autocomplete
export type VariableSuggestionItem = {
  name: string;
  label: string;
  type: string;
};

export const VariableNode = Node.create({
  name: "variable",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      name: { default: "" },
      label: { default: "" },
      fallback: { default: "" },
      format: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-variable]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-variable": HTMLAttributes.name,
        class: "variable-node",
      }),
      `{{${HTMLAttributes.name}}}`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VariableNodeView);
  },

  addCommands() {
    return {
      insertVariable:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              name: attributes.name || "variable",
              label: attributes.label || attributes.name || "Variable",
              fallback: attributes.fallback || "",
              format: attributes.format || null,
            },
          }),
    };
  },

  // Input rule: type {{variableName}} to create a variable
  addInputRules() {
    return [
      new InputRule({
        find: /\{\{([a-zA-Z0-9_]+)(?:\s*\|\|\s*"([^"]*)")?\}\}$/,
        handler: ({ state, range, match }) => {
          const [, name, fallback] = match;

          const node = this.type.create({
            name,
            label: name,
            fallback: fallback || "",
          });

          state.tr.replaceWith(range.from, range.to, node);
        },
      }),
    ];
  },
});
