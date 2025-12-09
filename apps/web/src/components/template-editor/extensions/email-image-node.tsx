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
import {
  getImageWithPlaceholder,
  isVariablePlaceholder,
} from "@/lib/brand-kit/placeholders";
import { DragHandle } from "./drag-handle";

export type EmailImageAttributes = {
  src: string;
  alt: string;
  width: number | null;
  height: number | null;
  align: "left" | "center" | "right";
};

declare module "@tiptap/core" {
  // biome-ignore lint/style/useConsistentTypeDefinitions: interface required for module augmentation
  interface Commands<ReturnType> {
    emailImage: {
      insertEmailImage: (
        attributes?: Partial<EmailImageAttributes>
      ) => ReturnType;
      updateEmailImage: (
        attributes: Partial<EmailImageAttributes>
      ) => ReturnType;
    };
  }
}

const EmailImageNodeView = ({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const attrs = node.attrs as EmailImageAttributes;

  // Check if src is empty or an unresolved variable
  const hasValidSrc = attrs.src && !isVariablePlaceholder(attrs.src);
  // Get the display src (original or placeholder)
  const displaySrc = getImageWithPlaceholder(attrs.src, "generic");
  // Show placeholder indicator if using a placeholder
  const isUsingPlaceholder = !hasValidSrc;

  return (
    <NodeViewWrapper
      className={`email-image-wrapper my-4 ${selected ? "ring-2 ring-primary ring-offset-2" : ""}`}
      style={{ textAlign: attrs.align }}
    >
      <div className="group relative inline-block">
        <div className="relative">
          <img
            alt={attrs.alt || "Image placeholder"}
            className={`h-auto max-w-full ${isUsingPlaceholder ? "opacity-75" : ""}`}
            height={attrs.height || undefined}
            src={displaySrc}
            style={{ maxWidth: "100%" }}
            width={attrs.width || undefined}
          />
          {isUsingPlaceholder && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-md bg-black/50 px-2 py-1 font-medium text-white text-xs">
                {attrs.src ? "Set image URL" : "Click to add image"}
              </span>
            </div>
          )}
        </div>

        {/* Drag handle and edit button */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <DragHandle />
          <Popover onOpenChange={setIsEditing} open={isEditing}>
            <PopoverTrigger asChild>
              <Button className="h-6 w-6" size="icon" variant="secondary">
                <Pencil className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <div className="space-y-4">
                <h4 className="font-medium">Image Settings</h4>

                <div className="space-y-2">
                  <Label htmlFor="src">Image URL</Label>
                  <Input
                    id="src"
                    onChange={(e) => updateAttributes({ src: e.target.value })}
                    placeholder="https://example.com/image.png"
                    value={attrs.src}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="alt">Alt Text</Label>
                  <Input
                    id="alt"
                    onChange={(e) => updateAttributes({ alt: e.target.value })}
                    placeholder="Describe the image"
                    value={attrs.alt}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="width">Width (px)</Label>
                    <Input
                      id="width"
                      onChange={(e) =>
                        updateAttributes({
                          width: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      placeholder="Auto"
                      type="number"
                      value={attrs.width || ""}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="height">Height (px)</Label>
                    <Input
                      id="height"
                      onChange={(e) =>
                        updateAttributes({
                          height: e.target.value
                            ? Number(e.target.value)
                            : null,
                        })
                      }
                      placeholder="Auto"
                      type="number"
                      value={attrs.height || ""}
                    />
                  </div>
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
      </div>
    </NodeViewWrapper>
  );
};

export const EmailImageNode = Node.create({
  name: "emailImage",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: "" },
      width: { default: null },
      height: { default: null },
      align: { default: "center" },
    };
  },

  parseHTML() {
    return [{ tag: "email-image" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["email-image", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmailImageNodeView);
  },

  addCommands() {
    return {
      insertEmailImage:
        (attributes = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: attributes,
          }),
      updateEmailImage:
        (attributes) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attributes),
    };
  },
});
