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

export type EmailAvatarAttributes = {
  src: string;
  alt: string;
  size: number;
  shape: "circle" | "rounded" | "square";
  align: "left" | "center" | "right";
};

declare module "@tiptap/core" {
  // biome-ignore lint/style/useConsistentTypeDefinitions: interface required for module augmentation
  interface Commands<ReturnType> {
    emailAvatar: {
      insertEmailAvatar: (
        attributes?: Partial<EmailAvatarAttributes>
      ) => ReturnType;
      updateEmailAvatar: (
        attributes: Partial<EmailAvatarAttributes>
      ) => ReturnType;
    };
  }
}

const shapeStyles: Record<EmailAvatarAttributes["shape"], string> = {
  circle: "9999px",
  rounded: "8px",
  square: "0",
};

const EmailAvatarNodeView = ({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const attrs = node.attrs as EmailAvatarAttributes;
  const [localAttrs, setLocalAttrs] = useState(attrs);

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setLocalAttrs(attrs);
    } else {
      updateAttributes(localAttrs);
    }
    setIsEditing(open);
  };

  const updateLocal = (
    key: keyof EmailAvatarAttributes,
    value: string | number
  ) => {
    setLocalAttrs((prev) => ({ ...prev, [key]: value }));
  };

  // Check if src is empty or an unresolved variable
  const hasValidSrc = attrs.src && !isVariablePlaceholder(attrs.src);
  // Get the display src (original or placeholder)
  const displaySrc = getImageWithPlaceholder(attrs.src, "avatar");
  const borderRadius = shapeStyles[attrs.shape];

  return (
    <NodeViewWrapper
      className={`email-avatar-wrapper my-2 ${selected ? "ring-2 ring-primary ring-offset-2" : ""}`}
      style={{ textAlign: attrs.align }}
    >
      <div className="group relative inline-block">
        <img
          alt={attrs.alt || "Avatar"}
          className={hasValidSrc ? "" : "opacity-60"}
          src={displaySrc}
          style={{
            width: attrs.size,
            height: attrs.size,
            borderRadius,
            objectFit: "cover",
          }}
        />

        {/* Drag handle and edit button */}
        <div className="-top-1 -right-1 absolute flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <DragHandle />
          <Popover onOpenChange={handleOpenChange} open={isEditing}>
            <PopoverTrigger asChild>
              <Button className="h-6 w-6" size="icon" variant="secondary">
                <Pencil className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <div className="space-y-4">
                <h4 className="font-medium">Avatar Settings</h4>

                <div className="space-y-2">
                  <Label htmlFor="avatar-src">Image URL</Label>
                  <Input
                    id="avatar-src"
                    onChange={(e) => updateLocal("src", e.target.value)}
                    placeholder="https://example.com/avatar.png"
                    value={localAttrs.src}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="avatar-alt">Alt Text</Label>
                  <Input
                    id="avatar-alt"
                    onChange={(e) => updateLocal("alt", e.target.value)}
                    placeholder="Person's name"
                    value={localAttrs.alt}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Size</Label>
                  <div className="flex gap-2">
                    {[32, 48, 64, 80, 96].map((size) => (
                      <Button
                        className="flex-1"
                        key={size}
                        onClick={() => updateLocal("size", size)}
                        size="sm"
                        variant={
                          localAttrs.size === size ? "default" : "outline"
                        }
                      >
                        {size}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Shape</Label>
                  <div className="flex gap-2">
                    {(["circle", "rounded", "square"] as const).map((shape) => (
                      <Button
                        className="flex-1 capitalize"
                        key={shape}
                        onClick={() => updateLocal("shape", shape)}
                        size="sm"
                        variant={
                          localAttrs.shape === shape ? "default" : "outline"
                        }
                      >
                        {shape}
                      </Button>
                    ))}
                  </div>
                </div>

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

export const EmailAvatarNode = Node.create({
  name: "emailAvatar",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: "" },
      size: { default: 64 },
      shape: { default: "circle" },
      align: { default: "center" },
    };
  },

  parseHTML() {
    return [{ tag: "email-avatar" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["email-avatar", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmailAvatarNodeView);
  },

  addCommands() {
    return {
      insertEmailAvatar:
        (attributes = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: attributes,
          }),
      updateEmailAvatar:
        (attributes) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attributes),
    };
  },
});
