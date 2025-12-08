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

export interface EmailColumnAttributes {
  width: string;
  padding: string;
  verticalAlign: "top" | "middle" | "bottom";
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    emailColumn: {
      updateEmailColumn: (
        attributes: Partial<EmailColumnAttributes>
      ) => ReturnType;
    };
  }
}

const EmailColumnNodeView = ({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const attrs = node.attrs as EmailColumnAttributes;

  return (
    <NodeViewWrapper
      className={`email-column-wrapper group relative ${selected ? "rounded ring-2 ring-primary ring-offset-2" : ""}`}
      style={{
        width: attrs.width,
        flex: attrs.width === "auto" ? 1 : "none",
        padding: attrs.padding,
      }}
    >
      <div
        className="email-column min-h-[60px] rounded border border-muted-foreground/20 border-dashed p-2"
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent:
            attrs.verticalAlign === "top"
              ? "flex-start"
              : attrs.verticalAlign === "bottom"
                ? "flex-end"
                : "center",
        }}
      >
        <NodeViewContent />
      </div>

      <Popover onOpenChange={setIsEditing} open={isEditing}>
        <PopoverTrigger asChild>
          <Button
            className="absolute top-1 right-1 z-10 h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100"
            size="icon"
            variant="secondary"
          >
            <Settings2 className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <div className="space-y-4">
            <h4 className="font-medium">Column Settings</h4>

            <div className="space-y-2">
              <Label htmlFor="width">Width</Label>
              <Input
                id="width"
                onChange={(e) => updateAttributes({ width: e.target.value })}
                placeholder="50%"
                value={attrs.width}
              />
              <div className="mt-2 flex gap-2">
                {["25%", "33%", "50%", "66%", "75%", "100%"].map((w) => (
                  <Button
                    className="px-2 text-xs"
                    key={w}
                    onClick={() => updateAttributes({ width: w })}
                    size="sm"
                    variant={attrs.width === w ? "default" : "outline"}
                  >
                    {w}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="padding">Padding</Label>
              <Input
                id="padding"
                onChange={(e) => updateAttributes({ padding: e.target.value })}
                placeholder="0px"
                value={attrs.padding}
              />
            </div>

            <div className="space-y-2">
              <Label>Vertical Align</Label>
              <div className="flex gap-2">
                {(["top", "middle", "bottom"] as const).map((align) => (
                  <Button
                    className="flex-1 capitalize"
                    key={align}
                    onClick={() => updateAttributes({ verticalAlign: align })}
                    size="sm"
                    variant={
                      attrs.verticalAlign === align ? "default" : "outline"
                    }
                  >
                    {align}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
};

export const EmailColumnNode = Node.create({
  name: "emailColumn",
  group: "block",
  content: "block+",
  draggable: false,
  defining: true,

  addAttributes() {
    return {
      width: { default: "50%" },
      padding: { default: "0px" },
      verticalAlign: { default: "top" },
    };
  },

  parseHTML() {
    return [{ tag: "email-column" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["email-column", mergeAttributes(HTMLAttributes), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmailColumnNodeView);
  },

  addCommands() {
    return {
      updateEmailColumn:
        (attributes) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attributes),
    };
  },
});
