"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import {
  Facebook,
  Github,
  Instagram,
  Linkedin,
  type LucideIcon,
  Pencil,
  Plus,
  Twitter,
  X,
  Youtube,
} from "lucide-react";
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
import { TailwindColorPicker } from "@/components/ui/tailwind-color-picker";
import { DragHandle } from "./drag-handle";

export type SocialPlatform =
  | "twitter"
  | "linkedin"
  | "instagram"
  | "facebook"
  | "youtube"
  | "github";

export type SocialLink = {
  platform: SocialPlatform;
  url: string;
};

export type EmailSocialLinksAttributes = {
  links: SocialLink[];
  iconSize: number;
  iconColor: string;
  iconSpacing: string;
  align: "left" | "center" | "right";
  style: "icons" | "text" | "both";
};

declare module "@tiptap/core" {
  // biome-ignore lint/style/useConsistentTypeDefinitions: interface required for module augmentation
  interface Commands<ReturnType> {
    emailSocialLinks: {
      insertEmailSocialLinks: (
        attributes?: Partial<EmailSocialLinksAttributes>
      ) => ReturnType;
      updateEmailSocialLinks: (
        attributes: Partial<EmailSocialLinksAttributes>
      ) => ReturnType;
    };
  }
}

const PLATFORM_CONFIG: Record<
  SocialPlatform,
  { icon: LucideIcon; label: string; placeholder: string }
> = {
  twitter: {
    icon: Twitter,
    label: "Twitter / X",
    placeholder: "https://twitter.com/username",
  },
  linkedin: {
    icon: Linkedin,
    label: "LinkedIn",
    placeholder: "https://linkedin.com/in/username",
  },
  instagram: {
    icon: Instagram,
    label: "Instagram",
    placeholder: "https://instagram.com/username",
  },
  facebook: {
    icon: Facebook,
    label: "Facebook",
    placeholder: "https://facebook.com/username",
  },
  youtube: {
    icon: Youtube,
    label: "YouTube",
    placeholder: "https://youtube.com/@channel",
  },
  github: {
    icon: Github,
    label: "GitHub",
    placeholder: "https://github.com/username",
  },
};

const EmailSocialLinksNodeView = ({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const attrs = node.attrs as EmailSocialLinksAttributes;
  const [localAttrs, setLocalAttrs] = useState(attrs);

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setLocalAttrs({
        ...attrs,
        links: [...(attrs.links || [])],
      });
    } else {
      updateAttributes(localAttrs);
    }
    setIsEditing(open);
  };

  const updateLocal = (
    key: keyof EmailSocialLinksAttributes,
    value: unknown
  ) => {
    setLocalAttrs((prev) => ({ ...prev, [key]: value }));
  };

  const addLink = (platform: SocialPlatform) => {
    const newLinks = [...localAttrs.links, { platform, url: "" }];
    updateLocal("links", newLinks);
  };

  const removeLink = (index: number) => {
    const newLinks = localAttrs.links.filter((_, i) => i !== index);
    updateLocal("links", newLinks);
  };

  const updateLink = (index: number, url: string) => {
    const newLinks = localAttrs.links.map((link, i) =>
      i === index ? { ...link, url } : link
    );
    updateLocal("links", newLinks);
  };

  const links = attrs.links || [];
  const hasLinks = links.length > 0;

  return (
    <NodeViewWrapper
      className={`email-social-links-wrapper my-4 ${selected ? "ring-2 ring-primary ring-offset-2" : ""}`}
      style={{ textAlign: attrs.align }}
    >
      <div className="group relative inline-block">
        {hasLinks ? (
          <div
            className="flex items-center"
            style={{
              gap: attrs.iconSpacing,
              justifyContent:
                attrs.align === "center"
                  ? "center"
                  : attrs.align === "right"
                    ? "flex-end"
                    : "flex-start",
            }}
          >
            {links.map((link) => {
              const config = PLATFORM_CONFIG[link.platform];
              const Icon = config.icon;
              return (
                <a
                  className="inline-flex items-center gap-1 no-underline transition-opacity hover:opacity-80"
                  href={link.url || "#"}
                  key={link.platform}
                  style={{ color: attrs.iconColor }}
                >
                  <Icon
                    style={{ width: attrs.iconSize, height: attrs.iconSize }}
                  />
                  {attrs.style === "text" || attrs.style === "both" ? (
                    <span className="text-sm">{config.label}</span>
                  ) : null}
                </a>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-lg border-2 border-muted-foreground/25 border-dashed bg-muted px-6 py-4">
            <span className="text-muted-foreground text-sm">
              Click to add social links
            </span>
          </div>
        )}

        {/* Drag handle and edit button */}
        <div className="absolute top-0 right-0 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <DragHandle />
          <Popover onOpenChange={handleOpenChange} open={isEditing}>
            <PopoverTrigger asChild>
              <Button className="h-6 w-6" size="icon" variant="secondary">
                <Pencil className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-96">
              <div className="space-y-4">
                <h4 className="font-medium">Social Links</h4>

                {/* Existing Links */}
                <div className="space-y-2">
                  {localAttrs.links.map((link, index) => {
                    const config = PLATFORM_CONFIG[link.platform];
                    const Icon = config.icon;
                    return (
                      <div
                        className="flex items-center gap-2"
                        key={link.platform}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <Input
                          className="flex-1"
                          onChange={(e) => updateLink(index, e.target.value)}
                          placeholder={config.placeholder}
                          value={link.url}
                        />
                        <Button
                          onClick={() => removeLink(index)}
                          size="icon"
                          variant="ghost"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>

                {/* Add New Link */}
                <div className="space-y-2">
                  <Label>Add Platform</Label>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(PLATFORM_CONFIG).map(
                      ([platform, config]) => {
                        const Icon = config.icon;
                        const isAdded = localAttrs.links.some(
                          (l) => l.platform === platform
                        );
                        return (
                          <Button
                            className="h-8 gap-1"
                            disabled={isAdded}
                            key={platform}
                            onClick={() => addLink(platform as SocialPlatform)}
                            size="sm"
                            variant="outline"
                          >
                            <Icon className="h-3 w-3" />
                            <Plus className="h-3 w-3" />
                          </Button>
                        );
                      }
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Icon Size</Label>
                    <Select
                      onValueChange={(v) => updateLocal("iconSize", Number(v))}
                      value={String(localAttrs.iconSize)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="16">Small (16px)</SelectItem>
                        <SelectItem value="20">Medium (20px)</SelectItem>
                        <SelectItem value="24">Large (24px)</SelectItem>
                        <SelectItem value="32">XL (32px)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Display Style</Label>
                    <Select
                      onValueChange={(v) =>
                        updateLocal("style", v as "icons" | "text" | "both")
                      }
                      value={localAttrs.style}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="icons">Icons Only</SelectItem>
                        <SelectItem value="text">Text Only</SelectItem>
                        <SelectItem value="both">Icons + Text</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <TailwindColorPicker
                  label="Icon Color"
                  onChange={(v) => updateLocal("iconColor", v)}
                  value={localAttrs.iconColor}
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

export const EmailSocialLinksNode = Node.create({
  name: "emailSocialLinks",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      links: { default: [] },
      iconSize: { default: 24 },
      iconColor: { default: "#6b7280" },
      iconSpacing: { default: "16px" },
      align: { default: "center" },
      style: { default: "icons" },
    };
  },

  parseHTML() {
    return [{ tag: "email-social-links" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["email-social-links", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmailSocialLinksNodeView);
  },

  addCommands() {
    return {
      insertEmailSocialLinks:
        (attributes = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: attributes,
          }),
      updateEmailSocialLinks:
        (attributes) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attributes),
    };
  },
});
