"use client";

import type { Editor } from "@tiptap/react";
import {
  Braces,
  Columns,
  GitBranch,
  Heading1,
  Heading2,
  Image,
  List,
  ListOrdered,
  Minus,
  MousePointerClick,
  MoveVertical,
  Quote,
  Square,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface BlockPaletteProps {
  editor: Editor | null;
}

interface BlockItem {
  name: string;
  description: string;
  icon: React.ReactNode;
  action: (editor: Editor) => void;
  category: "email" | "text" | "layout" | "dynamic";
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
      editor.chain().focus().toggleHeading({ level: 1 }).run(),
    category: "text",
  },
  {
    name: "Heading 2",
    description: "Medium heading",
    icon: <Heading2 className="h-5 w-5" />,
    action: (editor) =>
      editor.chain().focus().toggleHeading({ level: 2 }).run(),
    category: "text",
  },
  {
    name: "Bullet List",
    description: "Unordered list",
    icon: <List className="h-5 w-5" />,
    action: (editor) => editor.chain().focus().toggleBulletList().run(),
    category: "text",
  },
  {
    name: "Numbered List",
    description: "Ordered list",
    icon: <ListOrdered className="h-5 w-5" />,
    action: (editor) => editor.chain().focus().toggleOrderedList().run(),
    category: "text",
  },
  {
    name: "Quote",
    description: "Blockquote",
    icon: <Quote className="h-5 w-5" />,
    action: (editor) => editor.chain().focus().toggleBlockquote().run(),
    category: "text",
  },

  // Dynamic
  {
    name: "Variable",
    description: "Dynamic variable",
    icon: <Braces className="h-5 w-5" />,
    action: (editor) =>
      editor.commands.insertVariable({
        name: "variableName",
        label: "Variable",
      }),
    category: "dynamic",
  },
  {
    name: "Conditional",
    description: "If/else block",
    icon: <GitBranch className="h-5 w-5" />,
    action: (editor) => editor.commands.insertConditional(),
    category: "dynamic",
  },
];

const categoryLabels: Record<BlockItem["category"], string> = {
  email: "Email Components",
  layout: "Layout",
  text: "Text",
  dynamic: "Dynamic Content",
};

const categoryOrder: BlockItem["category"][] = [
  "email",
  "layout",
  "text",
  "dynamic",
];

export function BlockPalette({ editor }: BlockPaletteProps) {
  if (!editor) return null;

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
                            block.action(editor);
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
