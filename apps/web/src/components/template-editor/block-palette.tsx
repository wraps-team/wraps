"use client";

import type { JSONContent } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import {
  Braces,
  Code,
  Columns,
  Eye,
  FileText,
  GitBranch,
  Heading1,
  Heading2,
  Image,
  LayoutTemplate,
  List,
  ListOrdered,
  MessageSquareQuote,
  Minus,
  MousePointerClick,
  MoveVertical,
  Quote,
  Share2,
  ShoppingCart,
  Square,
  Star,
  Type,
  User,
} from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBrandKits } from "@/hooks/use-brand-kit-queries";
import { ALL_BLOCK_EXAMPLES } from "@/lib/ai/block-examples";
import {
  applyBrandKitToContent,
  type BrandKitValues,
} from "@/lib/brand-kit/apply-to-content";
import { useTemplateStore } from "@/stores/template-store";

type BlockPaletteProps = {
  editor: Editor | null;
  orgSlug: string;
};

type BlockItem = {
  name: string;
  description: string;
  icon: React.ReactNode;
  action: (editor: Editor, brandKit?: BrandKitValues | null) => void;
  category: "email" | "text" | "layout" | "dynamic" | "templates";
};

// Helper to insert a block example by ID with optional brand kit
function insertBlockExample(
  editor: Editor,
  exampleId: string,
  brandKit?: BrandKitValues | null
) {
  const example = ALL_BLOCK_EXAMPLES.find((e) => e.id === exampleId);
  if (example) {
    let content = example.tiptapJson as JSONContent;
    // Apply brand kit if available
    if (brandKit) {
      content = applyBrandKitToContent(content, brandKit);
    }
    editor.commands.insertContent(content);
  }
}

const blocks: BlockItem[] = [
  // Email components
  {
    name: "Button",
    description: "CTA button with link",
    icon: <MousePointerClick className="h-5 w-5" />,
    action: (editor) => editor.commands.insertEmailButton(),
    category: "email",
  },
  {
    name: "Section",
    description: "Container with styling",
    icon: <Square className="h-5 w-5" />,
    action: (editor) => editor.commands.insertEmailSection(),
    category: "email",
  },
  {
    name: "Image",
    description: "Image with alt text",
    icon: <Image className="h-5 w-5" />,
    action: (editor) => editor.commands.insertEmailImage(),
    category: "email",
  },
  {
    name: "Divider",
    description: "Horizontal line",
    icon: <Minus className="h-5 w-5" />,
    action: (editor) => editor.commands.insertEmailDivider(),
    category: "email",
  },
  {
    name: "Spacer",
    description: "Vertical spacing",
    icon: <MoveVertical className="h-5 w-5" />,
    action: (editor) => editor.commands.insertEmailSpacer(),
    category: "email",
  },
  {
    name: "Preview",
    description: "Inbox preview text",
    icon: <Eye className="h-5 w-5" />,
    action: (editor) => editor.commands.insertEmailPreview(),
    category: "email",
  },
  {
    name: "Avatar",
    description: "Circular profile image",
    icon: <User className="h-5 w-5" />,
    action: (editor) => editor.commands.insertEmailAvatar(),
    category: "email",
  },
  {
    name: "Code Block",
    description: "Syntax highlighted code",
    icon: <Code className="h-5 w-5" />,
    action: (editor) => editor.commands.insertEmailCodeBlock(),
    category: "email",
  },
  {
    name: "Social Links",
    description: "Social media icons",
    icon: <Share2 className="h-5 w-5" />,
    action: (editor) => editor.commands.insertEmailSocialLinks(),
    category: "email",
  },

  // Layout
  {
    name: "2 Columns",
    description: "Two column layout",
    icon: <Columns className="h-5 w-5" />,
    action: (editor) => editor.commands.insertEmailRow({}, 2),
    category: "layout",
  },
  {
    name: "3 Columns",
    description: "Three column layout",
    icon: <Columns className="h-5 w-5" />,
    action: (editor) => editor.commands.insertEmailRow({}, 3),
    category: "layout",
  },

  // Text
  {
    name: "Text",
    description: "Paragraph text",
    icon: <Type className="h-5 w-5" />,
    action: (editor) =>
      editor.commands.insertContent({
        type: "paragraph",
        content: [{ type: "text", text: "Enter text here..." }],
      }),
    category: "text",
  },
  {
    name: "Heading 1",
    description: "Large heading",
    icon: <Heading1 className="h-5 w-5" />,
    action: (editor) =>
      editor.commands.insertContent({
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Heading" }],
      }),
    category: "text",
  },
  {
    name: "Heading 2",
    description: "Medium heading",
    icon: <Heading2 className="h-5 w-5" />,
    action: (editor) =>
      editor.commands.insertContent({
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Heading" }],
      }),
    category: "text",
  },
  {
    name: "Bullet List",
    description: "Unordered list",
    icon: <List className="h-5 w-5" />,
    action: (editor) =>
      editor.commands.insertContent({
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "List item" }],
              },
            ],
          },
        ],
      }),
    category: "text",
  },
  {
    name: "Numbered List",
    description: "Ordered list",
    icon: <ListOrdered className="h-5 w-5" />,
    action: (editor) =>
      editor.commands.insertContent({
        type: "orderedList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "List item" }],
              },
            ],
          },
        ],
      }),
    category: "text",
  },
  {
    name: "Quote",
    description: "Blockquote",
    icon: <Quote className="h-5 w-5" />,
    action: (editor) =>
      editor.commands.insertContent({
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Quote text..." }],
          },
        ],
      }),
    category: "text",
  },

  // Dynamic
  {
    name: "Variable",
    description: "Type {{ or press ⌘/",
    icon: <Braces className="h-5 w-5" />,
    action: (editor) => editor.commands.insertContent("{{"),
    category: "dynamic",
  },
  {
    name: "Conditional",
    description: "If/else block",
    icon: <GitBranch className="h-5 w-5" />,
    action: (editor) => editor.commands.insertConditional(),
    category: "dynamic",
  },

  // Pre-built Templates (these use brand kit when available)
  {
    name: "Header",
    description: "Centered logo header",
    icon: <LayoutTemplate className="h-5 w-5" />,
    action: (editor, brandKit) =>
      insertBlockExample(editor, "header-logo-centered", brandKit),
    category: "templates",
  },
  {
    name: "Footer",
    description: "With social links",
    icon: <LayoutTemplate className="h-5 w-5" />,
    action: (editor, brandKit) =>
      insertBlockExample(editor, "footer-with-social", brandKit),
    category: "templates",
  },
  {
    name: "Hero",
    description: "Welcome section with CTA",
    icon: <Star className="h-5 w-5" />,
    action: (editor, brandKit) =>
      insertBlockExample(editor, "hero-simple", brandKit),
    category: "templates",
  },
  {
    name: "Features",
    description: "Feature list with icons",
    icon: <List className="h-5 w-5" />,
    action: (editor, brandKit) =>
      insertBlockExample(editor, "features-list", brandKit),
    category: "templates",
  },
  {
    name: "Testimonial",
    description: "Customer quote",
    icon: <MessageSquareQuote className="h-5 w-5" />,
    action: (editor, brandKit) =>
      insertBlockExample(editor, "testimonial-with-avatar", brandKit),
    category: "templates",
  },
  {
    name: "Product Card",
    description: "E-commerce product",
    icon: <ShoppingCart className="h-5 w-5" />,
    action: (editor, brandKit) =>
      insertBlockExample(editor, "product-card", brandKit),
    category: "templates",
  },
  {
    name: "Article",
    description: "Blog post preview",
    icon: <FileText className="h-5 w-5" />,
    action: (editor, brandKit) =>
      insertBlockExample(editor, "article-card", brandKit),
    category: "templates",
  },
  {
    name: "CTA",
    description: "Call to action section",
    icon: <MousePointerClick className="h-5 w-5" />,
    action: (editor, brandKit) =>
      insertBlockExample(editor, "cta-simple", brandKit),
    category: "templates",
  },
];

const categoryLabels: Record<BlockItem["category"], string> = {
  email: "Email Components",
  layout: "Layout",
  text: "Text",
  dynamic: "Dynamic Content",
  templates: "Pre-built Sections",
};

const categoryOrder: BlockItem["category"][] = [
  "templates",
  "email",
  "layout",
  "text",
  "dynamic",
];

export function BlockPalette({ editor, orgSlug }: BlockPaletteProps) {
  const { selectedBrandKitId } = useTemplateStore((state) => state.localState);

  // Fetch brand kits for the organization
  const { data: brandKits } = useBrandKits(orgSlug);

  // Get the selected brand kit
  const brandKit = useMemo(() => {
    if (!brandKits?.length) {
      return null;
    }
    if (selectedBrandKitId) {
      return brandKits.find((kit) => kit.id === selectedBrandKitId) ?? null;
    }
    // Fallback to default brand kit or first one
    return brandKits.find((kit) => kit.isDefault) ?? brandKits[0];
  }, [brandKits, selectedBrandKitId]);

  if (!editor) {
    return null;
  }

  const blocksByCategory = categoryOrder.map((category) => ({
    category,
    label: categoryLabels[category],
    blocks: blocks.filter((block) => block.category === category),
  }));

  return (
    <TooltipProvider>
      <div className="flex h-full min-h-0 w-60 flex-col border-r bg-muted/30">
        <div className="border-b p-3">
          <h3 className="font-semibold text-sm">Blocks</h3>
          <p className="text-muted-foreground text-xs">Click or drag to add</p>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 p-2">
            {blocksByCategory.map(({ category, label, blocks }) => (
              <div key={category}>
                <h4 className="mb-2 px-2 font-medium text-muted-foreground text-xs">
                  {label}
                </h4>
                <div className="space-y-1">
                  {blocks.map((block) => (
                    <Tooltip key={block.name}>
                      <TooltipTrigger asChild>
                        <Button
                          className="h-auto w-full justify-start px-3 py-2"
                          onClick={() => {
                            block.action(editor, brandKit);
                            editor.commands.focus();
                          }}
                          variant="ghost"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0 text-muted-foreground">
                              {block.icon}
                            </div>
                            <div className="text-left">
                              <div className="font-medium text-sm">
                                {block.name}
                              </div>
                              <div className="text-muted-foreground text-xs">
                                {block.description}
                              </div>
                            </div>
                          </div>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <p>{block.description}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}
