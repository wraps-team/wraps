"use client";

import type { Workflow } from "@wraps/db";
import {
  AlertCircle,
  ListChecks,
  Loader2,
  Pause,
  Pencil,
  Play,
  Redo2,
  Save,
  Settings,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import {
  disableWorkflow,
  enableWorkflow,
  updateWorkflow,
} from "@/actions/workflows";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EnableReadinessDialog } from "./enable-readiness-dialog";
import { UnsavedChangesGuard } from "./unsaved-changes-guard";
import { useBeforeUnload } from "./use-before-unload";
import {
  useCanRedo,
  useCanUndo,
  useIsDirty,
  useIsSaving,
  useNodeCount,
  useSettingsPanelOpen,
  useValidationResult,
  useWorkflowStore,
} from "./use-workflow-store";

type WorkflowToolbarProps = {
  workflow: Workflow;
  orgSlug: string;
  organizationId: string;
};

export function WorkflowToolbar({
  workflow,
  orgSlug,
  organizationId,
}: WorkflowToolbarProps) {
  const [isPending, startTransition] = useTransition();
  const [isEnabling, startEnableTransition] = useTransition();
  const isDirty = useIsDirty();
  const isSaving = useIsSaving();
  const validationResult = useValidationResult();
  const getWorkflowDefinition = useWorkflowStore(
    (state) => state.getWorkflowDefinition
  );
  const setIsSaving = useWorkflowStore((state) => state.setIsSaving);
  const updateWorkflowAfterSave = useWorkflowStore(
    (state) => state.updateWorkflowAfterSave
  );
  const runValidation = useWorkflowStore((state) => state.runValidation);
  const workflowState = useWorkflowStore((state) => state.workflow);
  const updateWorkflowSettings = useWorkflowStore(
    (state) => state.updateWorkflowSettings
  );
  const nodeCount = useNodeCount();
  const settingsPanelOpen = useSettingsPanelOpen();
  const toggleSettingsPanel = useWorkflowStore(
    (state) => state.toggleSettingsPanel
  );

  // Undo/redo state
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const handleUndo = () => useWorkflowStore.temporal.getState().undo();
  const handleRedo = () => useWorkflowStore.temporal.getState().redo();

  // Browser tab close guard
  useBeforeUnload();

  // Readiness dialog state
  const [readinessDialogOpen, setReadinessDialogOpen] = useState(false);

  // Editable name state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Run validation when workflow structure or config changes
  // Use deferred nodes reference to batch rapid changes and reduce CPU usage during drag operations
  // (Using nodes ref instead of isDirty boolean because isDirty stays true after first change,
  // which would prevent re-validation on subsequent config changes)
  const nodes = useWorkflowStore((state) => state.nodes);
  const edges = useWorkflowStore((state) => state.edges);
  const deferredNodes = useDeferredValue(nodes);
  const deferredEdges = useDeferredValue(edges);
  useEffect(() => {
    // Only run validation if we have nodes (workflow is loaded)
    if (nodeCount > 0) {
      runValidation();
    }
  }, [runValidation, nodeCount, deferredNodes, deferredEdges]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handleStartEditingName = () => {
    setEditedName(workflowState?.name || workflow.name);
    setIsEditingName(true);
  };

  const handleSaveName = () => {
    const trimmedName = editedName.trim();
    if (trimmedName && trimmedName !== (workflowState?.name || workflow.name)) {
      updateWorkflowSettings({ name: trimmedName });
    }
    setIsEditingName(false);
  };

  const handleKeyDownName = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveName();
    } else if (e.key === "Escape") {
      setIsEditingName(false);
    }
  };

  const currentStatus = workflowState?.status ?? workflow.status;
  const isEnabled = currentStatus === "enabled";
  const errorCount =
    validationResult?.errors.filter((e) => e.severity === "error").length ?? 0;
  const hasErrors = errorCount > 0;

  const handleSave = () => {
    startTransition(async () => {
      setIsSaving(true);
      try {
        const definition = getWorkflowDefinition();

        // Extract trigger config from the trigger step (source of truth)
        const triggerStep = definition.steps.find((s) => s.type === "trigger");
        const triggerConfig = triggerStep?.config;

        const result = await updateWorkflow(workflow.id, organizationId, {
          name: workflowState?.name ?? undefined,
          description: workflowState?.description ?? undefined,
          // Sync trigger settings from the trigger step
          triggerType:
            triggerConfig?.type === "trigger"
              ? triggerConfig.triggerType
              : undefined,
          triggerConfig:
            triggerConfig?.type === "trigger"
              ? {
                  eventName: triggerConfig.eventName,
                  segmentId: triggerConfig.segmentId,
                  topicId: triggerConfig.topicId,
                  schedule: triggerConfig.schedule,
                  timezone: triggerConfig.timezone,
                }
              : undefined,
          steps: definition.steps,
          transitions: definition.transitions,
          canvasViewport: definition.canvasViewport,
        });

        if (result.success) {
          // Update workflow metadata without touching nodes/edges
          // This prevents React Flow from firing change events that would re-dirty the state
          updateWorkflowAfterSave(result.workflow);
          toast.success("Workflow saved");
        } else {
          toast.error(result.error);
        }
      } finally {
        setIsSaving(false);
      }
    });
  };

  const handleEnable = () => {
    // Run validation first
    const result = runValidation();
    if (!result.isValid) {
      toast.error(
        `Cannot enable: ${errorCount} issue${errorCount > 1 ? "s" : ""} to fix`
      );
      return;
    }

    // Must save before enabling
    if (isDirty) {
      toast.error("Please save your changes before enabling the workflow");
      return;
    }

    setReadinessDialogOpen(true);
  };

  const handleConfirmEnable = () => {
    startEnableTransition(async () => {
      const result = await enableWorkflow(workflow.id, organizationId);
      if (result.success) {
        updateWorkflowAfterSave(result.workflow);
        setReadinessDialogOpen(false);
        toast.success("Workflow enabled");
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleDisable = () => {
    startEnableTransition(async () => {
      const result = await disableWorkflow(workflow.id, organizationId);
      if (result.success) {
        updateWorkflowAfterSave(result.workflow);
        toast.success("Workflow paused");
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="flex h-14 items-center justify-between border-b bg-background px-4">
      <div className="flex items-center gap-4">
        <UnsavedChangesGuard
          href={`/${orgSlug}/automations`}
          isDirty={isDirty}
        />
        <div>
          <div className="flex items-center gap-2">
            {isEditingName ? (
              <input
                className="min-w-[200px] border-primary border-b bg-transparent font-semibold outline-none"
                onBlur={handleSaveName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={handleKeyDownName}
                ref={nameInputRef}
                type="text"
                value={editedName}
              />
            ) : (
              <button
                className="group flex items-center gap-1.5 font-semibold transition-colors hover:text-primary"
                onClick={handleStartEditingName}
              >
                {workflowState?.name || workflow.name}
                <Pencil className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-50" />
              </button>
            )}
            <Badge
              variant={
                (workflowState?.status ?? workflow.status) === "enabled"
                  ? "default"
                  : "secondary"
              }
            >
              {workflowState?.status ?? workflow.status}
            </Badge>
            {isDirty && (
              <Badge
                className="border-yellow-300 text-yellow-600"
                variant="outline"
              >
                Unsaved
              </Badge>
            )}
          </div>
          {(workflowState?.description || workflow.description) && (
            <p className="text-muted-foreground text-sm">
              {workflowState?.description || workflow.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {/* Validation error indicator */}
        {hasErrors && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 text-red-600 text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>
                    {errorCount} issue{errorCount > 1 ? "s" : ""}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs" side="bottom">
                <ul className="space-y-1 text-xs">
                  {validationResult?.errors
                    .filter((e) => e.severity === "error")
                    .slice(0, 5)
                    .map((error, i) => (
                      <li key={i}>• {error.message}</li>
                    ))}
                  {errorCount > 5 && (
                    <li className="text-muted-foreground">
                      ...and {errorCount - 5} more
                    </li>
                  )}
                </ul>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Undo/Redo buttons */}
        <TooltipProvider>
          <div className="flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Undo"
                  disabled={!canUndo}
                  onClick={handleUndo}
                  size="icon"
                  variant="ghost"
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Undo (⌘Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label="Redo"
                  disabled={!canRedo}
                  onClick={handleRedo}
                  size="icon"
                  variant="ghost"
                >
                  <Redo2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Redo (⌘⇧Z)</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>

        {/* Executions link */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="View executions"
                asChild
                size="icon"
                variant="outline"
              >
                <Link
                  href={`/${orgSlug}/automations/${workflow.id}/executions`}
                >
                  <ListChecks className="h-4 w-4" />
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">View executions</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Settings button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Workflow settings"
                onClick={toggleSettingsPanel}
                size="icon"
                variant={settingsPanelOpen ? "secondary" : "outline"}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Workflow settings</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Save button */}
        <Button
          disabled={!isDirty || isPending || isSaving}
          onClick={handleSave}
          variant="outline"
        >
          {isPending || isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save
            </>
          )}
        </Button>

        {/* Enable/Disable button */}
        {isEnabled ? (
          <Button
            disabled={isEnabling}
            onClick={handleDisable}
            variant="outline"
          >
            {isEnabling ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Pause className="mr-2 h-4 w-4" />
            )}
            Pause
          </Button>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    disabled={isEnabling || hasErrors || isDirty}
                    onClick={handleEnable}
                  >
                    {isEnabling ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    Enable
                  </Button>
                </span>
              </TooltipTrigger>
              {(hasErrors || isDirty) && (
                <TooltipContent side="bottom">
                  {hasErrors
                    ? `Fix ${errorCount} issue${errorCount > 1 ? "s" : ""} before enabling`
                    : "Save changes before enabling"}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      <EnableReadinessDialog
        isEnabling={isEnabling}
        onEnable={handleConfirmEnable}
        onOpenChange={setReadinessDialogOpen}
        open={readinessDialogOpen}
        organizationId={organizationId}
        orgSlug={orgSlug}
        workflow={workflow}
      />
    </div>
  );
}
