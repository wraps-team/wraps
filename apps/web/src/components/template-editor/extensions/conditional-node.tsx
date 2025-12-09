"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import {
  NodeViewContent,
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { GitBranch, Settings2 } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DragHandle } from "./drag-handle";

export type ConditionalOperator =
  | "equals"
  | "notEquals"
  | "exists"
  | "notExists"
  | "contains"
  | "greaterThan"
  | "lessThan";

export type ConditionalAttributes = {
  variable: string;
  operator: ConditionalOperator;
  value: string;
};

declare module "@tiptap/core" {
  // biome-ignore lint/style/useConsistentTypeDefinitions: interface required for module augmentation
  interface Commands<ReturnType> {
    conditional: {
      insertConditional: (
        attributes?: Partial<ConditionalAttributes>
      ) => ReturnType;
      updateConditional: (
        attributes: Partial<ConditionalAttributes>
      ) => ReturnType;
    };
  }
}

const operatorLabels: Record<ConditionalOperator, string> = {
  equals: "equals",
  notEquals: "does not equal",
  exists: "exists",
  notExists: "does not exist",
  contains: "contains",
  greaterThan: "is greater than",
  lessThan: "is less than",
};

const ConditionalNodeView = ({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const attrs = node.attrs as ConditionalAttributes;

  const needsValue = !["exists", "notExists"].includes(attrs.operator);

  // Build condition label
  const conditionLabel = `{{${attrs.variable}}} ${operatorLabels[attrs.operator]}${needsValue && attrs.value ? ` "${attrs.value}"` : ""}`;

  return (
    <NodeViewWrapper
      className={`conditional-wrapper group relative my-4 ${selected ? "rounded ring-2 ring-primary ring-offset-2" : ""}`}
    >
      {/* Condition header */}
      <div className="flex items-center gap-2 rounded-t-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950">
        <GitBranch className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <span className="font-medium text-amber-800 text-sm dark:text-amber-200">
          If {conditionLabel}
        </span>

        {/* Drag handle and settings button */}
        <div className="ml-auto flex gap-1">
          <DragHandle className="text-amber-600 opacity-100 hover:bg-amber-100 dark:hover:bg-amber-900" />
          <Popover onOpenChange={setIsEditing} open={isEditing}>
            <PopoverTrigger asChild>
              <Button
                className="h-6 w-6 text-amber-600 hover:text-amber-800"
                size="icon"
                variant="ghost"
              >
                <Settings2 className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <div className="space-y-4">
                <h4 className="flex items-center gap-2 font-medium">
                  <GitBranch className="h-4 w-4" />
                  Conditional Settings
                </h4>

                <div className="space-y-2">
                  <Label htmlFor="variable">Variable</Label>
                  <Input
                    id="variable"
                    onChange={(e) =>
                      updateAttributes({ variable: e.target.value })
                    }
                    placeholder="isPremium"
                    value={attrs.variable}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="operator">Condition</Label>
                  <Select
                    onValueChange={(value: ConditionalOperator) =>
                      updateAttributes({ operator: value })
                    }
                    value={attrs.operator}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.entries(operatorLabels) as [
                          ConditionalOperator,
                          string,
                        ][]
                      ).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {needsValue && (
                  <div className="space-y-2">
                    <Label htmlFor="value">Value</Label>
                    <Input
                      id="value"
                      onChange={(e) =>
                        updateAttributes({ value: e.target.value })
                      }
                      placeholder="true"
                      value={attrs.value}
                    />
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Content area */}
      <div className="conditional-content rounded-b-lg border-amber-200 border-x border-b bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-950/50">
        <NodeViewContent />
      </div>
    </NodeViewWrapper>
  );
};

export const ConditionalNode = Node.create({
  name: "conditional",
  group: "block",
  content: "block+",
  draggable: true,
  defining: true,

  addAttributes() {
    return {
      variable: { default: "condition" },
      operator: { default: "equals" as ConditionalOperator },
      value: { default: "true" },
    };
  },

  parseHTML() {
    return [{ tag: "conditional-block" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["conditional-block", mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ConditionalNodeView);
  },

  addCommands() {
    return {
      insertConditional:
        (attributes = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: {
              variable: attributes.variable || "isPremium",
              operator: attributes.operator || "equals",
              value: attributes.value || "true",
            },
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Content shown when condition is true",
                  },
                ],
              },
            ],
          }),
      updateConditional:
        (attributes) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attributes),
    };
  },
});
