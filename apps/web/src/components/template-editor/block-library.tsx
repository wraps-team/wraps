"use client";

import type { JSONContent } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import type { ReusableBlock } from "@wraps/db";
import {
  FolderOpen,
  Grid3X3,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useBlocks,
  useDeleteBlock,
  useTrackBlockUsage,
} from "@/hooks/use-block-queries";
import { cn } from "@/lib/utils";

type BlockLibraryProps = {
  editor: Editor | null;
  orgSlug: string;
};

const CATEGORIES = [
  { value: "all", label: "All Blocks" },
  { value: "header", label: "Headers" },
  { value: "footer", label: "Footers" },
  { value: "hero", label: "Hero Sections" },
  { value: "feature", label: "Features" },
  { value: "cta", label: "CTAs" },
  { value: "testimonial", label: "Testimonials" },
  { value: "pricing", label: "Pricing" },
  { value: "product", label: "Products" },
  { value: "gallery", label: "Galleries" },
  { value: "article", label: "Articles" },
  { value: "stats", label: "Statistics" },
  { value: "content", label: "Content" },
  { value: "custom", label: "Custom" },
];

export function BlockLibrary({ editor, orgSlug }: BlockLibraryProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const { data: blocks = [], isLoading } = useBlocks(
    orgSlug,
    category === "all" ? undefined : category
  );
  const deleteBlock = useDeleteBlock(orgSlug);
  const trackUsage = useTrackBlockUsage(orgSlug);

  // Filter blocks by search
  const filteredBlocks = blocks.filter(
    (block) =>
      block.name.toLowerCase().includes(search.toLowerCase()) ||
      block.description?.toLowerCase().includes(search.toLowerCase())
  );

  const handleInsertBlock = (block: ReusableBlock) => {
    if (!editor) {
      return;
    }

    // Track usage
    trackUsage.mutate(block.id);

    // Insert block content at current cursor position
    const content = block.content as JSONContent;
    editor.commands.insertContent(content);
  };

  const handleDeleteBlock = (blockId: string) => {
    if (confirm("Are you sure you want to delete this block?")) {
      deleteBlock.mutate(blockId);
    }
  };

  return (
    <div className="flex h-full flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-sm">Block Library</h3>
        </div>
        <div className="flex items-center gap-1">
          <Tabs
            onValueChange={(v) => setViewMode(v as "grid" | "list")}
            value={viewMode}
          >
            <TabsList className="h-7">
              <TabsTrigger className="h-6 px-2" value="grid">
                <Grid3X3 className="h-3 w-3" />
              </TabsTrigger>
              <TabsTrigger className="h-6 px-2" value="list">
                <List className="h-3 w-3" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="space-y-2 border-b p-3">
        <div className="relative">
          <Search className="-translate-y-1/2 absolute top-1/2 left-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search blocks..."
            value={search}
          />
        </div>
        <Select onValueChange={setCategory} value={category}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat.value} value={cat.value}>
                {cat.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Block List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            Loading blocks...
          </div>
        ) : filteredBlocks.length === 0 ? (
          <div className="p-4 text-center">
            <p className="text-muted-foreground text-sm">No blocks found</p>
            <p className="mt-1 text-muted-foreground text-xs">
              Save sections from your templates to create reusable blocks.
            </p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 gap-2 p-3">
            {filteredBlocks.map((block) => (
              <BlockCard
                block={block}
                key={block.id}
                onDelete={() => handleDeleteBlock(block.id)}
                onInsert={() => handleInsertBlock(block)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {filteredBlocks.map((block) => (
              <BlockListItem
                block={block}
                key={block.id}
                onDelete={() => handleDeleteBlock(block.id)}
                onInsert={() => handleInsertBlock(block)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

type BlockCardProps = {
  block: ReusableBlock;
  onInsert: () => void;
  onDelete: () => void;
};

function BlockCard({ block, onInsert, onDelete }: BlockCardProps) {
  return (
    <div
      className={cn(
        "group relative cursor-pointer rounded-lg border bg-card p-2 transition-colors hover:border-primary/50 hover:bg-accent/50"
      )}
      onClick={onInsert}
    >
      {/* Thumbnail or placeholder */}
      <div className="mb-2 flex h-16 items-center justify-center rounded bg-muted/50">
        {block.thumbnail ? (
          <img
            alt={block.name}
            className="h-full w-full rounded object-cover"
            src={block.thumbnail}
          />
        ) : (
          <FolderOpen className="h-6 w-6 text-muted-foreground" />
        )}
      </div>

      {/* Info */}
      <p className="truncate font-medium text-xs">{block.name}</p>
      <p className="truncate text-muted-foreground text-xs">
        {block.category} • {block.usageCount} uses
      </p>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
            size="icon"
            variant="ghost"
          >
            <MoreHorizontal className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onInsert}>
            <Plus className="mr-2 h-4 w-4" />
            Insert
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function BlockListItem({ block, onInsert, onDelete }: BlockCardProps) {
  return (
    <div
      className="group flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-accent"
      onClick={onInsert}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded bg-muted">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium text-sm">{block.name}</p>
          <p className="text-muted-foreground text-xs">
            {block.category} • {block.usageCount} uses
          </p>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="h-6 w-6 opacity-0 group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
            size="icon"
            variant="ghost"
          >
            <MoreHorizontal className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onInsert}>
            <Plus className="mr-2 h-4 w-4" />
            Insert
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
