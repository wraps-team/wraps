"use client";

import MonacoEditor from "@monaco-editor/react";
import type { Template } from "@wraps/db";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@wraps/ui/components/ui/tooltip";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Loader2,
  RotateCcw,
  Save,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { compileTemplate } from "@/lib/compile-template";
import { buildSaveSourcePayload } from "@/lib/save-source-payload";
import { configureMonacoForReactEmail } from "./monaco-react-email";

const STARTER_SOURCE = `import { Body, Container, Head, Html, Tailwind, Text } from "@react-email/components";

export default function Email() {
  return (
    <Html>
      <Head />
      <Tailwind>
        <Body className="bg-background font-sans">
          <Container className="mx-auto max-w-[600px] py-10">
            <Text className="text-foreground text-base">
              Start writing your email here.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
`;

type CodeTemplateCodeViewProps = {
  template: Template;
  orgSlug: string;
  templateId: string;
  onSourceSaved?: (updatedTemplate: Template) => void;
  onPreviewUpdate: (html: string) => void;
};

export function CodeTemplateCodeView({
  template,
  orgSlug,
  templateId,
  onSourceSaved,
  onPreviewUpdate,
}: CodeTemplateCodeViewProps) {
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedSource, setEditedSource] = useState(
    template.source ?? STARTER_SOURCE
  );
  const [compileError, setCompileError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const originalSource = template.source ?? STARTER_SOURCE;
  const filePath = template.cliProjectPath ?? "template.tsx";

  const hasChanges = editedSource !== originalSource;

  // Copy source to clipboard
  const handleCopy = async () => {
    const textToCopy = editedSource || originalSource;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast.success("Code copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  // Download source file
  const handleDownload = () => {
    const filename = filePath.split("/").pop() ?? "template.tsx";
    const textToDownload = editedSource || originalSource;
    const blob = new Blob([textToDownload], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${filename}`);
  };

  // Discard changes
  const handleDiscard = () => {
    setEditedSource(originalSource);
    setCompileError(null);
    setPreviewError(null);
    onPreviewUpdate(template.compiledHtml ?? "");
  };

  // Save: compile then save
  const handleSave = useCallback(async () => {
    if (!hasChanges || isSaving) {
      return;
    }

    setIsSaving(true);
    setCompileError(null);

    try {
      // Step 1: Compile in-browser (no server-side code execution)
      const compiled = await compileTemplate(editedSource);

      // Step 2: Save
      const saveResp = await fetch(
        `/api/${orgSlug}/emails/templates/${templateId}/save-source`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildSaveSourcePayload(editedSource, compiled)),
        }
      );

      if (!saveResp.ok) {
        const data = await saveResp.json();
        throw new Error(data.error || "Save failed");
      }

      const { template: updatedTemplate } = await saveResp.json();

      // Update preview via parent
      onPreviewUpdate(compiled.compiledHtml);

      toast.success("Template saved");

      // Notify parent
      onSourceSaved?.(updatedTemplate);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save";
      if (message.includes("Cannot require")) {
        const hint =
          "This template uses shared components. Push changes via CLI: wraps email templates push";
        setCompileError(hint);
        toast.error("Cannot save in browser", { description: hint });
      } else {
        setCompileError(message);
        toast.error("Failed to save", { description: message });
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    hasChanges,
    isSaving,
    editedSource,
    orgSlug,
    templateId,
    onSourceSaved,
    onPreviewUpdate,
  ]);

  // Cmd+S keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  // Show stored compiled HTML on initial mount (avoids recompiling CLI-pushed templates
  // that use shared components the browser compiler can't resolve)
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current && template.compiledHtml) {
      initializedRef.current = true;
      onPreviewUpdate(template.compiledHtml);
    }
  }, [template.compiledHtml, onPreviewUpdate]);

  // Live preview: debounced compile as you type
  const previewTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!(editedSource && initializedRef.current)) {
      return;
    }
    // Skip recompiling if source hasn't changed from the stored version
    if (editedSource === originalSource) {
      return;
    }

    clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(async () => {
      try {
        const compiled = await compileTemplate(editedSource);
        onPreviewUpdate(compiled.compiledHtml);
        setPreviewError(null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Compile error";
        if (message.includes("Cannot require")) {
          setPreviewError(
            "This template uses shared components that can only be compiled via CLI. Push changes with: wraps email templates push"
          );
        } else {
          setPreviewError(message);
        }
      }
    }, 1000);

    return () => clearTimeout(previewTimerRef.current);
  }, [editedSource, originalSource, onPreviewUpdate]);

  // Auto-save: 1 minute after last source change
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!hasChanges || isSaving) {
      return;
    }

    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      handleSave();
    }, 60_000);

    return () => clearTimeout(autoSaveTimerRef.current);
  }, [hasChanges, isSaving, handleSave]);

  return (
    <div className="flex h-full flex-col">
      {/* Editor Header */}
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <span className="font-mono text-xs">{filePath}</span>
          {hasChanges && (
            <span className="rounded bg-warning/10 px-1.5 py-0.5 text-warning text-xs">
              Modified
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                className="h-8"
                disabled={!hasChanges || isSaving}
                onClick={handleSave}
                size="sm"
                variant="default"
              >
                {isSaving ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="mr-1 h-3.5 w-3.5" />
                )}
                Save
              </Button>
            </TooltipTrigger>
            <TooltipContent>Save changes (Cmd+S)</TooltipContent>
          </Tooltip>

          {hasChanges && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className="h-8"
                  disabled={isSaving}
                  onClick={handleDiscard}
                  size="sm"
                  variant="outline"
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Discard
                </Button>
              </TooltipTrigger>
              <TooltipContent>Discard changes</TooltipContent>
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={handleCopy}
                size="icon-sm"
                variant={copied ? "secondary" : "ghost"}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {copied ? "Copied!" : "Copy to clipboard"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={handleDownload} size="icon-sm" variant="ghost">
                <Download className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download file</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Compile Error Banner (save errors — red) */}
      {compileError && (
        <div className="flex items-start gap-2 border-b bg-destructive/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <p className="text-destructive text-xs">{compileError}</p>
        </div>
      )}

      {/* Preview Error Banner (live preview errors — amber) */}
      {previewError && !compileError && (
        <div className="flex items-start gap-2 border-b bg-warning/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <p className="text-warning text-xs">{previewError}</p>
        </div>
      )}

      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
        <MonacoEditor
          beforeMount={configureMonacoForReactEmail}
          defaultLanguage="typescript"
          height="100%"
          language="typescript"
          onChange={(value) => {
            if (value !== undefined) {
              setEditedSource(value);
            }
          }}
          options={{
            automaticLayout: true,
            fontSize: 13,
            fontFamily: "JetBrains Mono, Menlo, Monaco, monospace",
            lineNumbers: "on",
            minimap: { enabled: false },
            padding: { top: 16, bottom: 16 },
            readOnly: false,
            scrollBeyondLastLine: false,
            wordWrap: "on",
            tabSize: 2,
            renderLineHighlight: "line",
            cursorStyle: "line",
            cursorBlinking: "blink",
          }}
          path="template.tsx"
          theme="vs-dark"
          value={editedSource}
        />
      </div>

      {/* Footer */}
      <div className="border-t bg-muted/30 px-3 py-2">
        <p className="text-muted-foreground text-xs">
          Press{" "}
          <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">
            Cmd+S
          </kbd>{" "}
          to save
        </p>
      </div>
    </div>
  );
}
