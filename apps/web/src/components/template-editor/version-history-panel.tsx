"use client";

import type { Editor } from "@tiptap/react";
import { formatDistanceToNow } from "date-fns";
import {
  AlertTriangle,
  Clock,
  History,
  Loader2,
  RotateCcw,
  Save,
  User,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type TemplateVersionWithUser,
  useCreateVersion,
  useRestoreVersion,
  useTemplateVersions,
} from "@/hooks/use-template-queries";
import { cn } from "@/lib/utils";

type VersionHistoryPanelProps = {
  editor: Editor | null;
  orgSlug: string;
  templateId: string;
};

export function VersionHistoryPanel({
  editor,
  orgSlug,
  templateId,
}: VersionHistoryPanelProps) {
  const [selectedVersion, setSelectedVersion] =
    useState<TemplateVersionWithUser | null>(null);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [changeNote, setChangeNote] = useState("");

  const { data: versions, isLoading } = useTemplateVersions(
    orgSlug,
    templateId
  );
  const createVersion = useCreateVersion(orgSlug, templateId);
  const restoreVersion = useRestoreVersion(orgSlug, templateId);

  const handleCreateSnapshot = async () => {
    try {
      await createVersion.mutateAsync({
        changeNote: changeNote.trim() || undefined,
      });
      toast.success("Snapshot created", {
        description: changeNote.trim() || "Version saved successfully",
      });
      setChangeNote("");
      setShowSaveDialog(false);
    } catch (error) {
      toast.error("Failed to create snapshot", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleRestore = async () => {
    if (!selectedVersion) {
      return;
    }
    try {
      const result = await restoreVersion.mutateAsync(selectedVersion.id);
      toast.success(`Restored to version ${result.restoredFromVersion}`, {
        description: "Your current content was backed up automatically",
      });
      setShowRestoreDialog(false);
      setSelectedVersion(null);
    } catch (error) {
      toast.error("Failed to restore version", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handlePreviewVersion = (version: TemplateVersionWithUser) => {
    if (editor && version.content) {
      // Store current content before preview
      setSelectedVersion(version);
    }
  };

  return (
    <div className="flex h-full w-80 flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Version History</h3>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => setShowSaveDialog(true)}
                size="sm"
                variant="outline"
              >
                <Save className="mr-2 h-4 w-4" />
                Snapshot
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save current state as a new version</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Version List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : versions?.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            <Clock className="mx-auto mb-2 h-8 w-8" />
            <p className="text-sm">No versions yet</p>
            <p className="text-xs">
              Versions are created automatically when you save
            </p>
          </div>
        ) : (
          <div className="p-2">
            {versions?.map((version, index) => (
              <VersionItem
                isCurrent={index === 0}
                isSelected={selectedVersion?.id === version.id}
                key={version.id}
                onPreview={() => handlePreviewVersion(version)}
                onRestore={() => {
                  setSelectedVersion(version);
                  setShowRestoreDialog(true);
                }}
                version={version}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Selected Version Preview Info */}
      {selectedVersion && (
        <div className="border-t bg-muted/50 p-4">
          <div className="mb-2 font-medium text-sm">
            Previewing v{selectedVersion.version}
          </div>
          <p className="mb-3 text-muted-foreground text-xs">
            {selectedVersion.changeNote || "No change note"}
          </p>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => setSelectedVersion(null)}
              size="sm"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={() => setShowRestoreDialog(true)}
              size="sm"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Restore
            </Button>
          </div>
        </div>
      )}

      {/* Save Snapshot Dialog */}
      <AlertDialog onOpenChange={setShowSaveDialog} open={showSaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create Version Snapshot</AlertDialogTitle>
            <AlertDialogDescription>
              Save the current state of your template as a named version. You
              can restore to this version later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="change-note">Change Note (optional)</Label>
            <Input
              className="mt-2"
              id="change-note"
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="e.g., Updated header design"
              value={changeNote}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={createVersion.isPending}
              onClick={handleCreateSnapshot}
            >
              {createVersion.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Snapshot
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore Confirmation Dialog */}
      <AlertDialog onOpenChange={setShowRestoreDialog} open={showRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Restore to Version {selectedVersion?.version}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will replace your current template content with the content
              from version {selectedVersion?.version}. A backup of your current
              content will be saved automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {selectedVersion?.changeNote && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <span className="font-medium">Change note:</span>{" "}
              {selectedVersion.changeNote}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={restoreVersion.isPending}
              onClick={handleRestore}
            >
              {restoreVersion.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Restore Version
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type VersionItemProps = {
  version: TemplateVersionWithUser;
  isSelected: boolean;
  isCurrent: boolean;
  onPreview: () => void;
  onRestore: () => void;
};

function VersionItem({
  version,
  isSelected,
  isCurrent,
  onPreview,
  onRestore,
}: VersionItemProps) {
  const timeAgo = formatDistanceToNow(new Date(version.createdAt), {
    addSuffix: true,
  });

  return (
    <div
      className={cn(
        "group mb-2 rounded-lg border p-3 transition-colors",
        isSelected
          ? "border-primary bg-primary/5"
          : "hover:border-muted-foreground/50 hover:bg-muted/50"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted font-medium text-xs">
            v{version.version}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">
                Version {version.version}
              </span>
              {isCurrent && (
                <Badge className="text-xs" variant="secondary">
                  Latest
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 text-muted-foreground text-xs">
              <Clock className="h-3 w-3" />
              {timeAgo}
            </div>
          </div>
        </div>
      </div>

      {version.changeNote && (
        <p className="mt-2 line-clamp-2 text-muted-foreground text-xs">
          {version.changeNote}
        </p>
      )}

      {/* Author */}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {version.createdByUser ? (
            <>
              <Avatar className="h-5 w-5">
                <AvatarImage src={version.createdByUser.image || undefined} />
                <AvatarFallback className="text-xs">
                  {version.createdByUser.name?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
              <span className="text-muted-foreground text-xs">
                {version.createdByUser.name || "Unknown"}
              </span>
            </>
          ) : (
            <>
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground text-xs">Unknown</span>
            </>
          )}
        </div>

        {/* Actions */}
        {!isCurrent && (
          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="h-7 w-7"
                    onClick={onRestore}
                    size="icon"
                    variant="ghost"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Restore this version</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </div>
    </div>
  );
}
