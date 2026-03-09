"use client";

import type { EmailType, Template } from "@wraps/db";
import {
  ArrowLeft,
  Cloud,
  CloudOff,
  Code2,
  Copy,
  FileSignature,
  Globe,
  History,
  Loader2,
  MoreHorizontal,
  Pencil,
  Send,
  Sparkles,
  Terminal,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { type SaveStatus, SaveStatusIndicator } from "./save-status-indicator";
import { SubjectEditDialog } from "./subject-edit-dialog";
import { TemplateNameDialog } from "./wrappers/template-name-dialog";

export type CodeTemplateView = "design" | "code";

type CodeTemplateToolbarProps = {
  template: Template;
  orgSlug: string;
  view: CodeTemplateView;
  onViewChange: (view: CodeTemplateView) => void;
  subject: string;
  previewText: string;
  emailType: EmailType;
  isPublishing: boolean;
  saveStatus: SaveStatus;
  lastSavedAt?: Date;
  showVersionHistory: boolean;
  onToggleVersionHistory: () => void;
  onSendTest: () => void;
  onSubjectChange: (
    subject: string,
    previewText: string,
    emailType: EmailType
  ) => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onDuplicate: () => void;
  onRename: (name: string, description?: string) => void;
  onDelete: () => void;
};

const statusConfig: Record<string, { label: string; className: string }> = {
  DRAFT: {
    label: "Draft",
    className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  },
  PUBLISHED: {
    label: "Published",
    className: "bg-green-500/10 text-green-600 border-green-500/20",
  },
  ARCHIVED: {
    label: "Archived",
    className: "bg-gray-500/10 text-gray-600 border-gray-500/20",
  },
};

export function CodeTemplateToolbar({
  template,
  orgSlug,
  view,
  onViewChange,
  subject,
  previewText,
  emailType,
  isPublishing,
  saveStatus,
  lastSavedAt,
  showVersionHistory,
  onToggleVersionHistory,
  onSendTest,
  onSubjectChange,
  onPublish,
  onUnpublish,
  onDuplicate,
  onRename,
  onDelete,
}: CodeTemplateToolbarProps) {
  const [showSubjectDialog, setShowSubjectDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);

  const status = template.status ?? "DRAFT";
  const displaySubject = subject || "No subject";
  const displayPreviewText = previewText || "Add preview text\u2026";

  return (
    <TooltipProvider>
      <div
        aria-label="Code template editor toolbar"
        className="border-b"
        role="toolbar"
      >
        {/* Row 1: Back + Template name + Managed badge + Status */}
        <div className="flex items-center gap-3 border-b px-3 py-2">
          {/* Back to templates */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild className="h-8 w-8 p-0" size="sm" variant="ghost">
                <Link href={`/${orgSlug}/emails/templates`}>
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back to templates</TooltipContent>
          </Tooltip>

          <Separator className="h-5" orientation="vertical" />

          {/* Template name */}
          <span className="shrink-0 truncate font-medium text-sm">
            {template.name}
          </span>

          <Separator className="h-5" orientation="vertical" />

          {/* Subject + preview text */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0 flex-1">
              <span
                className={cn(
                  "truncate font-medium text-sm",
                  !subject && "text-muted-foreground italic"
                )}
              >
                {displaySubject}
              </span>
              <p
                className={cn(
                  "truncate text-muted-foreground text-xs",
                  !previewText && "italic"
                )}
              >
                {displayPreviewText}
              </p>
            </div>

            {/* Edit button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="h-7 w-7 shrink-0 p-0"
                  onClick={() => setShowSubjectDialog(true)}
                  size="sm"
                  variant="ghost"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Edit subject & preview</TooltipContent>
            </Tooltip>
          </div>

          {/* Source indicator */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                className={cn(
                  "shrink-0 gap-1.5",
                  template.lastEditedFrom === "dashboard"
                    ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                    : "bg-violet-500/10 text-violet-600 border-violet-500/20"
                )}
                variant="outline"
              >
                {template.lastEditedFrom === "dashboard" ? (
                  <>
                    <Globe className="h-3 w-3" />
                    Last edited on dashboard
                  </>
                ) : (
                  <>
                    <Terminal className="h-3 w-3" />
                    Last pushed from CLI
                  </>
                )}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              {template.lastEditedFrom === "dashboard"
                ? "Template was last modified on the dashboard"
                : template.cliProjectPath
                  ? `Source: ${template.cliProjectPath}`
                  : "Pushed from CLI"}
            </TooltipContent>
          </Tooltip>

          <SaveStatusIndicator
            className="shrink-0"
            lastSavedAt={lastSavedAt}
            status={saveStatus}
          />

          <Separator className="h-5" orientation="vertical" />

          {/* Status Badge */}
          <Badge
            className={cn("shrink-0", statusConfig[status]?.className)}
            variant="outline"
          >
            {statusConfig[status]?.label ?? status}
          </Badge>
        </div>

        {/* Row 2: View Tabs + Actions */}
        <div className="flex items-center gap-1 bg-muted/30 px-2 py-1.5">
          {/* View Mode Tabs */}
          <Tabs
            onValueChange={(value) => onViewChange(value as CodeTemplateView)}
            value={view}
          >
            <TabsList className="h-8">
              <TabsTrigger
                className="h-7 gap-1.5 px-2.5 text-xs"
                value="design"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Design</span>
              </TabsTrigger>
              <TabsTrigger className="h-7 gap-1.5 px-2.5 text-xs" value="code">
                <Code2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Code</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Version History Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className={cn(
                  "h-8 w-8 p-0",
                  showVersionHistory && "bg-accent text-accent-foreground"
                )}
                onClick={onToggleVersionHistory}
                size="sm"
                variant="ghost"
              >
                <History className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {showVersionHistory ? "Hide version history" : "Version history"}
            </TooltipContent>
          </Tooltip>

          {/* More Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-8 w-8 p-0" size="sm" variant="ghost">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setShowRenameDialog(true)}>
                <FileSignature className="mr-2 h-4 w-4" />
                Rename Template
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate Template
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Template
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator className="mx-1 h-6" orientation="vertical" />

          {/* Action Buttons */}
          <div className="flex items-center gap-1">
            {/* Test button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="h-8 gap-1.5 px-2"
                  onClick={onSendTest}
                  size="sm"
                  variant="outline"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span className="hidden text-xs sm:inline">Test</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Send test email</TooltipContent>
            </Tooltip>

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

            {/* Unpublish button */}
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

      {/* Subject Edit Dialog */}
      <SubjectEditDialog
        emailType={emailType}
        isOpen={showSubjectDialog}
        onClose={() => setShowSubjectDialog(false)}
        onSave={(newSubject, newPreviewText, newEmailType) => {
          onSubjectChange(newSubject, newPreviewText, newEmailType);
        }}
        previewText={previewText}
        subject={subject}
      />

      {/* Rename Template Dialog */}
      <TemplateNameDialog
        defaultDescription={template.description ?? undefined}
        defaultName={template.name}
        description="Update the name and description of your template."
        onConfirm={(name, description) => {
          onRename(name, description);
        }}
        onOpenChange={setShowRenameDialog}
        open={showRenameDialog}
        submitLabel="Save"
        title="Rename Template"
      />
    </TooltipProvider>
  );
}
