"use client";

import type { Editor } from "@tiptap/react";
import {
  Bold,
  BookOpen,
  Braces,
  Cloud,
  CloudOff,
  Code2,
  Eye,
  History,
  Import,
  Italic,
  List,
  ListOrdered,
  Loader2,
  MoreHorizontal,
  Package,
  PanelLeft,
  PanelRight,
  Pencil,
  Redo2,
  Save,
  Send,
  Sparkles,
  Underline,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTemplateStore } from "@/stores/template-store";
import { BrandKitSelector } from "./brand-kit-selector";
import { VariableInput } from "./variable-input";

type TemplateEditorToolbarProps = {
  editor: Editor | null;
  orgSlug: string;
  isSaving?: boolean;
  isPublishing?: boolean;
  subject?: string | null;
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  onImport?: () => void;
  onSave?: () => void;
  onSaveBlock?: () => void;
  onSendTest?: () => void;
  onSubjectChange?: (subject: string) => void;
  onPublish?: () => void;
  onUnpublish?: () => void;
};

type ViewMode = "edit" | "preview" | "code" | "usage";

const statusColors: Record<string, string> = {
  DRAFT: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  PUBLISHED: "bg-green-500/10 text-green-600 border-green-500/20",
  ARCHIVED: "bg-gray-500/10 text-gray-600 border-gray-500/20",
};

export function TemplateEditorToolbar({
  editor,
  orgSlug,
  isSaving,
  isPublishing,
  subject,
  status = "DRAFT",
  onImport,
  onSave,
  onSaveBlock,
  onSendTest,
  onSubjectChange,
  onPublish,
  onUnpublish,
}: TemplateEditorToolbarProps) {
  const {
    view,
    showBlockLibrary,
    showPropertiesPanel,
    showAIPanel,
    showVersionHistory,
  } = useTemplateStore((state) => state.localState);
  const {
    setView,
    toggleBlockLibrary,
    togglePropertiesPanel,
    toggleAIPanel,
    toggleVersionHistory,
  } = useTemplateStore((state) => state.actions);

  if (!editor) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="border-b">
        {/* Subject Line Row */}
        <div className="flex items-center gap-2 border-b bg-muted/20 px-3 py-2">
          <label
            className="shrink-0 font-medium text-muted-foreground text-sm"
            htmlFor="subject"
          >
            Subject:
          </label>
          <VariableInput
            className="h-8 bg-background"
            id="subject"
            onChange={(value) => onSubjectChange?.(value)}
            placeholder="Enter email subject line (type {{ for variables)"
            value={subject ?? ""}
          />
          <Badge
            className={cn("shrink-0 text-xs", statusColors[status])}
            variant="outline"
          >
            {status.toLowerCase()}
          </Badge>
        </div>

        {/* Main Toolbar */}
        <div className="flex items-center gap-1 bg-muted/30 px-2 py-1.5">
          {/* View Mode Selector - Compact Toggle Group */}
          <ToggleGroup
            onValueChange={(value) => value && setView(value as ViewMode)}
            size="sm"
            type="single"
            value={view}
            variant="outline"
          >
            <ToggleGroupItem
              aria-label="Edit"
              className="h-8 w-8 p-0"
              value="edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem
              aria-label="Preview"
              className="h-8 w-8 p-0"
              value="preview"
            >
              <Eye className="h-3.5 w-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem
              aria-label="Code"
              className="h-8 w-8 p-0"
              value="code"
            >
              <Code2 className="h-3.5 w-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem
              aria-label="Usage"
              className="h-8 w-8 p-0"
              value="usage"
            >
              <BookOpen className="h-3.5 w-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>

          <Separator className="mx-1 h-6" orientation="vertical" />

          {/* Brand Kit Selector */}
          <BrandKitSelector orgSlug={orgSlug} />

          {/* Text Formatting (only in edit mode) */}
          {view === "edit" && (
            <>
              <Separator className="mx-1 h-6" orientation="vertical" />

              {/* Formatting buttons - hidden on mobile */}
              <div className="hidden items-center gap-0.5 sm:flex">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="h-8 w-8 p-0"
                      onClick={() => editor.chain().focus().toggleBold().run()}
                      size="sm"
                      variant={editor.isActive("bold") ? "secondary" : "ghost"}
                    >
                      <Bold className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Bold (⌘B)</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="h-8 w-8 p-0"
                      onClick={() =>
                        editor.chain().focus().toggleItalic().run()
                      }
                      size="sm"
                      variant={
                        editor.isActive("italic") ? "secondary" : "ghost"
                      }
                    >
                      <Italic className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Italic (⌘I)</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="h-8 w-8 p-0"
                      onClick={() =>
                        editor.chain().focus().toggleUnderline().run()
                      }
                      size="sm"
                      variant={
                        editor.isActive("underline") ? "secondary" : "ghost"
                      }
                    >
                      <Underline className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Underline (⌘U)</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="h-8 w-8 p-0"
                      onClick={() =>
                        editor.chain().focus().toggleBulletList().run()
                      }
                      size="sm"
                      variant={
                        editor.isActive("bulletList") ? "secondary" : "ghost"
                      }
                    >
                      <List className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Bullet List</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="h-8 w-8 p-0"
                      onClick={() =>
                        editor.chain().focus().toggleOrderedList().run()
                      }
                      size="sm"
                      variant={
                        editor.isActive("orderedList") ? "secondary" : "ghost"
                      }
                    >
                      <ListOrdered className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Numbered List</TooltipContent>
                </Tooltip>

                <Separator className="mx-1 h-6" orientation="vertical" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="h-8 w-8 p-0"
                      onClick={() => editor.commands.insertContent("{{")}
                      size="sm"
                      variant="ghost"
                    >
                      <Braces className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Insert Variable (⌘/)</TooltipContent>
                </Tooltip>
              </div>

              {/* Undo/Redo - always visible */}
              <div className="flex items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="h-8 w-8 p-0"
                      disabled={!editor.can().undo()}
                      onClick={() => editor.chain().focus().undo().run()}
                      size="sm"
                      variant="ghost"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Undo (⌘Z)</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      className="h-8 w-8 p-0"
                      disabled={!editor.can().redo()}
                      onClick={() => editor.chain().focus().redo().run()}
                      size="sm"
                      variant="ghost"
                    >
                      <Redo2 className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Redo (⌘⇧Z)</TooltipContent>
                </Tooltip>
              </div>
            </>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Panel Toggles - Compact */}
          <div className="hidden items-center gap-0.5 md:flex">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="h-8 w-8 p-0"
                  onClick={toggleBlockLibrary}
                  size="sm"
                  variant={showBlockLibrary ? "secondary" : "ghost"}
                >
                  <PanelLeft className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Blocks</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="h-8 w-8 p-0"
                  onClick={togglePropertiesPanel}
                  size="sm"
                  variant={showPropertiesPanel ? "secondary" : "ghost"}
                >
                  <PanelRight className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Properties</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="h-8 w-8 p-0"
                  onClick={toggleAIPanel}
                  size="sm"
                  variant={showAIPanel ? "secondary" : "ghost"}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>AI Assistant</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="h-8 w-8 p-0"
                  onClick={toggleVersionHistory}
                  size="sm"
                  variant={showVersionHistory ? "secondary" : "ghost"}
                >
                  <History className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>History</TooltipContent>
            </Tooltip>
          </div>

          <Separator
            className="mx-1 hidden h-6 md:block"
            orientation="vertical"
          />

          {/* Actions - Compact */}
          <div className="flex items-center gap-1">
            {/* More menu for secondary actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-8 w-8 p-0" size="sm" variant="ghost">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* Panel toggles for mobile */}
                <div className="md:hidden">
                  <DropdownMenuItem onClick={toggleBlockLibrary}>
                    <PanelLeft className="mr-2 h-4 w-4" />
                    {showBlockLibrary ? "Hide" : "Show"} Blocks
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={togglePropertiesPanel}>
                    <PanelRight className="mr-2 h-4 w-4" />
                    {showPropertiesPanel ? "Hide" : "Show"} Properties
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={toggleAIPanel}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    {showAIPanel ? "Hide" : "Show"} AI Assistant
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={toggleVersionHistory}>
                    <History className="mr-2 h-4 w-4" />
                    {showVersionHistory ? "Hide" : "Show"} History
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </div>
                {onImport && view === "edit" && (
                  <DropdownMenuItem onClick={onImport}>
                    <Import className="mr-2 h-4 w-4" />
                    Import HTML
                  </DropdownMenuItem>
                )}
                {onSaveBlock && view === "edit" && (
                  <DropdownMenuItem onClick={onSaveBlock}>
                    <Package className="mr-2 h-4 w-4" />
                    Save as Block
                  </DropdownMenuItem>
                )}
                {onSendTest && (
                  <DropdownMenuItem className="sm:hidden" onClick={onSendTest}>
                    <Send className="mr-2 h-4 w-4" />
                    Send Test Email
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Send Test - visible on larger screens */}
            {onSendTest && (
              <Button
                className="hidden h-8 gap-1.5 px-2 sm:flex"
                onClick={onSendTest}
                size="sm"
                variant="outline"
              >
                <Send className="h-3.5 w-3.5" />
                <span className="text-xs">Test</span>
              </Button>
            )}

            {/* Save button - always visible */}
            <Button
              className="h-8 gap-1.5 px-2"
              disabled={isSaving}
              onClick={onSave}
              size="sm"
              variant="outline"
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span className="text-xs">{isSaving ? "Saving" : "Save"}</span>
            </Button>

            {/* Publish/Update button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="h-8 gap-1.5 px-2"
                  disabled={isPublishing || !subject}
                  onClick={onPublish}
                  size="sm"
                >
                  {isPublishing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Cloud className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden text-xs sm:inline">
                    {isPublishing
                      ? "Publishing"
                      : status === "PUBLISHED"
                        ? "Update"
                        : "Publish"}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {subject
                  ? status === "PUBLISHED"
                    ? "Update template on AWS SES"
                    : "Publish to AWS SES"
                  : "Add a subject line to publish"}
              </TooltipContent>
            </Tooltip>

            {/* Unpublish button - only shown when published */}
            {status === "PUBLISHED" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="h-8 w-8 p-0"
                    disabled={isPublishing}
                    onClick={onUnpublish}
                    size="sm"
                    variant="ghost"
                  >
                    {isPublishing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CloudOff className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remove from AWS SES</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
