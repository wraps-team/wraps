"use client";

import type { JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useTemplateEditor } from "@/hooks/use-template-editor";
import {
  usePublishTemplate,
  useTemplate,
  useUnpublishTemplate,
  useUpdateTemplate,
} from "@/hooks/use-template-queries";
import { cn } from "@/lib/utils";
import { useTemplateStore } from "@/stores/template-store";
import { AIChatPanel } from "./ai-chat-panel";
import { BlockPalette } from "./block-palette";
import { CodeView } from "./code-view";
import { EditorErrorBoundary } from "./editor-error-boundary";
import { ImportModal } from "./import-modal";
import { PreviewPanel } from "./preview-panel";
import { PropertiesPanel } from "./properties-panel";
import { SaveBlockModal } from "./save-block-modal";
import { SendTestModal } from "./send-test-modal";
import { TemplateEditorToolbar } from "./template-editor-toolbar";
import { TestDataPanel } from "./test-data-panel";
import { UsagePanel } from "./usage-panel";
import { VersionHistoryPanel } from "./version-history-panel";

type TemplateEditorProps = {
  orgSlug: string;
  templateId: string;
  className?: string;
};

/**
 * Wrapper component that handles data loading.
 * Only renders the actual editor once template data is available.
 */
export function TemplateEditor({
  orgSlug,
  templateId,
  className,
}: TemplateEditorProps) {
  // Load template with TanStack Query
  const {
    data: template,
    isLoading,
    isError,
    error,
  } = useTemplate(orgSlug, templateId);

  // Loading state
  if (isLoading) {
    return (
      <div
        className={cn(
          "flex h-[calc(100dvh-var(--header-height)-1rem)] items-center justify-center md:h-[calc(100dvh-var(--header-height)-1.5rem)]",
          className
        )}
      >
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Loading template...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div
        className={cn(
          "flex h-[calc(100dvh-var(--header-height)-1rem)] items-center justify-center md:h-[calc(100dvh-var(--header-height)-1.5rem)]",
          className
        )}
      >
        <div className="text-center text-destructive">
          <p className="mb-2 font-semibold">Failed to load template</p>
          <p className="text-sm">{error?.message}</p>
        </div>
      </div>
    );
  }

  // No template data
  if (!template) {
    return null;
  }

  // Template loaded - render the editor
  // Key forces complete remount when navigating between templates
  return (
    <TemplateEditorContent
      className={className}
      key={template.id}
      orgSlug={orgSlug}
      template={template}
      templateId={templateId}
    />
  );
}

type TemplateEditorContentProps = {
  orgSlug: string;
  templateId: string;
  template: NonNullable<ReturnType<typeof useTemplate>["data"]>;
  className?: string;
};

/**
 * Inner component that creates the editor.
 * Only mounted when template data is guaranteed to be available.
 */
function TemplateEditorContent({
  orgSlug,
  templateId,
  template,
  className,
}: TemplateEditorContentProps) {
  const [showSendTestModal, setShowSendTestModal] = useState(false);
  const [showSaveBlockModal, setShowSaveBlockModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [subject, setSubject] = useState(template.subject ?? "");

  const {
    view,
    showBlockLibrary,
    showPropertiesPanel,
    showAIPanel,
    showTestDataPanel,
    showVersionHistory,
  } = useTemplateStore((state) => state.localState);
  const { setDocument, updateTemplate: updateTemplateStore } = useTemplateStore(
    (state) => state.actions
  );

  // Update template mutation
  const updateMutation = useUpdateTemplate(orgSlug, templateId);

  // Publish/unpublish mutations
  const publishMutation = usePublishTemplate(orgSlug, templateId);
  const unpublishMutation = useUnpublishTemplate(orgSlug, templateId);

  // Handle save
  const handleSave = useCallback(
    async (content: JSONContent) => {
      await updateMutation.mutateAsync({ content });
    },
    [updateMutation]
  );

  // Initialize editor - template.content is guaranteed to be available here
  const { editor, saveNow } = useTemplateEditor({
    templateId,
    initialContent: template.content as JSONContent,
    onSave: handleSave,
    onUpdate: setDocument,
  });

  // Update store with template metadata
  useEffect(() => {
    updateTemplateStore({
      id: template.id,
      name: template.name,
      status: template.status,
      updatedAt: template.updatedAt.toString(),
    });
  }, [template, updateTemplateStore]);

  // Sync subject from template when it changes (e.g., after publish)
  useEffect(() => {
    if (template.subject !== null && template.subject !== subject) {
      setSubject(template.subject);
    }
  }, [template.subject, subject]);

  // Handle subject change - save after a delay
  const handleSubjectChange = useCallback(
    (newSubject: string) => {
      setSubject(newSubject);
      // Save subject to database (debounced via mutation)
      updateMutation.mutate({ subject: newSubject });
    },
    [updateMutation]
  );

  // Handle publish
  const handlePublish = useCallback(async () => {
    try {
      // Save any pending changes first (including subject)
      await saveNow();
      await updateMutation.mutateAsync({ subject });

      // Then publish to SES
      const result = await publishMutation.mutateAsync({});
      toast.success("Template published to AWS SES", {
        description: result.message,
      });
    } catch (error) {
      toast.error("Failed to publish template", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [saveNow, updateMutation, subject, publishMutation]);

  // Handle unpublish
  const handleUnpublish = useCallback(async () => {
    try {
      const result = await unpublishMutation.mutateAsync();
      toast.success("Template unpublished", {
        description: result.message,
      });
    } catch (error) {
      toast.error("Failed to unpublish template", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [unpublishMutation]);

  const handleManualSave = useCallback(async () => {
    try {
      await saveNow();
      toast.success("Template saved");
    } catch (error) {
      toast.error("Failed to save template", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [saveNow]);

  const handleEditorReset = useCallback(() => {
    if (editor && template?.content && editor.isEditable) {
      setTimeout(() => {
        editor.commands.setContent(template.content as JSONContent);
        toast.info("Editor reset to last saved state");
      }, 0);
    }
  }, [editor, template?.content]);

  // Editor not ready yet
  if (!editor) {
    return (
      <div
        className={cn(
          "flex h-[calc(100dvh-var(--header-height)-1rem)] items-center justify-center md:h-[calc(100dvh-var(--header-height)-1.5rem)]",
          className
        )}
      >
        <p className="text-muted-foreground">Initializing editor...</p>
      </div>
    );
  }

  return (
    <EditorErrorBoundary onReset={handleEditorReset}>
      <div
        className={cn(
          "flex h-[calc(100dvh-var(--header-height)-1rem)] flex-col bg-background md:h-[calc(100dvh-var(--header-height)-1.5rem)]",
          className
        )}
      >
        {/* Toolbar */}
        <TemplateEditorToolbar
          editor={editor}
          isPublishing={
            publishMutation.isPending || unpublishMutation.isPending
          }
          isSaving={updateMutation.isPending}
          onImport={() => setShowImportModal(true)}
          onPublish={handlePublish}
          onSave={handleManualSave}
          onSaveBlock={() => setShowSaveBlockModal(true)}
          onSendTest={() => setShowSendTestModal(true)}
          onSubjectChange={handleSubjectChange}
          onUnpublish={handleUnpublish}
          orgSlug={orgSlug}
          status={template.status}
          subject={subject}
        />

        {/* Main Content Area */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left Panel - Block Library */}
          {showBlockLibrary && view === "edit" && (
            <BlockPalette editor={editor} orgSlug={orgSlug} />
          )}

          {/* Center - Editor/Preview/Code/Usage */}
          <div className={cn("flex-1 overflow-auto")}>
            {/* Editor - always mounted, hidden with CSS to prevent flushSync issues */}
            <div className={cn(view !== "edit" && "hidden")}>
              <div className="mx-auto max-w-3xl p-6">
                <div className="min-h-[600px] rounded-lg border bg-white shadow-sm">
                  <EditorContent className="p-6" editor={editor} />
                </div>
              </div>
            </div>

            {view === "preview" && <PreviewPanel editor={editor} />}

            {view === "code" && <CodeView editor={editor} />}

            {view === "usage" && <UsagePanel template={template} />}
          </div>

          {/* Right Panel - Properties */}
          {showPropertiesPanel && view === "edit" && (
            <PropertiesPanel editor={editor} />
          )}

          {/* Right Panel - AI Assistant (shown in edit mode when toggled) */}
          {showAIPanel && view === "edit" && (
            <AIChatPanel
              asSidePanel
              editor={editor}
              orgSlug={orgSlug}
              templateId={templateId}
            />
          )}

          {/* Right Panel - Test Data (shown when toggled) */}
          {showTestDataPanel && (view === "edit" || view === "preview") && (
            <TestDataPanel editor={editor} />
          )}

          {/* Right Panel - Version History (shown when toggled) */}
          {showVersionHistory && (
            <VersionHistoryPanel
              editor={editor}
              orgSlug={orgSlug}
              templateId={templateId}
            />
          )}
        </div>

        {/* Send Test Modal */}
        <SendTestModal
          editor={editor}
          isOpen={showSendTestModal}
          onClose={() => setShowSendTestModal(false)}
          orgSlug={orgSlug}
          templateId={templateId}
        />

        {/* Save Block Modal */}
        <SaveBlockModal
          editor={editor}
          isOpen={showSaveBlockModal}
          onClose={() => setShowSaveBlockModal(false)}
          orgSlug={orgSlug}
        />

        {/* Import Modal */}
        <ImportModal
          editor={editor}
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
        />
      </div>
    </EditorErrorBoundary>
  );
}
