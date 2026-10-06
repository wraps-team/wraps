"use client";

import type { Workflow } from "@wraps/db";
import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@wraps/ui/components/ui/tooltip";
import { useReactFlow } from "@xyflow/react";
import {
  AlertCircle,
  BarChart3,
  LayoutGrid,
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
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  disableWorkflow,
  enableWorkflow,
  updateWorkflow,
} from "@/actions/(ee)/workflows";
import { ConnectAwsDialog } from "@/components/connect-aws-dialog";
import { Button } from "@/components/ui/button";
import { useRequireAws } from "@/hooks/use-require-aws";
import { EnableReadinessDialog } from "./enable-readiness-dialog";
import { getLayoutedNodes } from "./layout/auto-layout";
import { UnsavedChangesGuard } from "./unsaved-changes-guard";
import { useBeforeUnload } from "./use-before-unload";
import { useLiveValidation } from "./use-live-validation";
import {
  redoWorkflowEdit,
  undoWorkflowEdit,
  useCanRedo,
  useCanUndo,
  useIsDirty,
  useIsSaving,
  useNodeCount,
  useSettingsPanelOpen,
  useValidationResult,
  useWorkflowStore,
} from "./use-workflow-store";
import { useWorkflowData } from "./workflow-data-context";

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
  const {
    requireAws,
    dialogOpen: awsDialogOpen,
    setDialogOpen: setAwsDialogOpen,
    pendingAction,
    orgSlug: awsOrgSlug,
  } = useRequireAws(orgSlug);
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
  const { showStats, setShowStats } = useWorkflowData();

  // Undo/redo state
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const handleUndo = undoWorkflowEdit;
  const handleRedo = redoWorkflowEdit;

  // Auto-layout
  const { fitView } = useReactFlow();
  const handleAutoLayout = () => {
    const { nodes, edges, setNodes } = useWorkflowStore.getState();
    if (nodes.length < 2) {
      return;
    }

    const flowNodes = document.querySelectorAll(".react-flow__node");
    for (const el of flowNodes) {
      el.classList.add("wraps-layout-animating");
    }

    const layoutedNodes = getLayoutedNodes(nodes, edges, { showStats });
    setNodes(layoutedNodes);

    requestAnimationFrame(() => {
      fitView({ padding: 0.1, maxZoom: 1, duration: 300 });
    });

    setTimeout(() => {
      const els = document.querySelectorAll(".react-flow__node");
      for (const el of els) {
        el.classList.remove("wraps-layout-animating");
      }
    }, 350);
  };

  // Browser tab close guard
  useBeforeUnload();

  // Readiness dialog state
  const [readinessDialogOpen, setReadinessDialogOpen] = useState(false);

  // Editable name state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  useLiveValidation();

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
        const savedKey = useWorkflowStore.getState().getSaveKey();

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
          updateWorkflowAfterSave(result.workflow, savedKey);
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
    if (!requireAws("enable")) {
      return;
    }

    // Run validation first
    const result = runValidation();
    if (!result.isValid) {
      const issues = result.errors.filter((e) => e.severity === "error").length;
      toast.error(
        `Cannot enable: ${issues} issue${issues === 1 ? "" : "s"} to fix`
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
            {isDirty && <Badge variant="warning">Unsaved</Badge>}
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

        {/* Auto-layout button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Auto-layout"
                disabled={nodeCount < 2}
                onClick={handleAutoLayout}
                size="icon"
                variant="ghost"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Auto-layout</TooltipContent>
          </Tooltip>
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

        {/* Stats toggle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Toggle stats"
                disabled={currentStatus === "draft"}
                onClick={() => setShowStats(!showStats)}
                size="icon"
                variant={showStats ? "secondary" : "outline"}
              >
                <BarChart3 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {showStats ? "Hide stats" : "Show stats"}
            </TooltipContent>
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

      <ConnectAwsDialog
        action={pendingAction ?? "enable"}
        onOpenChange={setAwsDialogOpen}
        open={awsDialogOpen}
        orgSlug={awsOrgSlug}
      />
    </div>
  );
}
