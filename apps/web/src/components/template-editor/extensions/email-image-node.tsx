"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { ImageIcon, Pencil } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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

  const hasImage = attrs.src && attrs.src.length > 0;

  return (
    <NodeViewWrapper
      className={`email-image-wrapper my-4 ${selected ? "ring-2 ring-primary ring-offset-2" : ""}`}
      style={{ textAlign: attrs.align }}
    >
      <div className="group relative inline-block">
        {hasImage ? (
          <img
            alt={attrs.alt}
            className="h-auto max-w-full"
            height={attrs.height || undefined}
            src={attrs.src}
            style={{ maxWidth: "100%" }}
            width={attrs.width || undefined}
          />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-muted-foreground/25 border-dashed bg-muted p-8">
            <ImageIcon className="mb-2 h-12 w-12 text-muted-foreground" />
            <span className="text-muted-foreground text-sm">
              Click to add image
            </span>
          </div>
        )}

        <Popover onOpenChange={setIsEditing} open={isEditing}>
          <PopoverTrigger asChild>
            <Button
              className="absolute top-2 right-2 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
              size="icon"
              variant="secondary"
            >
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
                        height: e.target.value ? Number(e.target.value) : null,
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
