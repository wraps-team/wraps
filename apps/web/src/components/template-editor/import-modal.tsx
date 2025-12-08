"use client";

import type { JSONContent } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { Code2, FileCode, FileText, Import, Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { parseHTMLToTipTap } from "@/lib/serializers/html-to-tiptap";
import { parseReactEmailToTipTap } from "@/lib/serializers/react-email-to-tiptap";

type ImportModalProps = {
  editor: Editor | null;
  isOpen: boolean;
  onClose: () => void;
};

type ImportMode = "html" | "react";

export function ImportModal({ editor, isOpen, onClose }: ImportModalProps) {
  const [mode, setMode] = useState<ImportMode>("html");
  const [code, setCode] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [preview, setPreview] = useState<JSONContent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePreview = useCallback(() => {
    if (!code.trim()) {
      setError("Please enter some code to import");
      return;
    }

    setError(null);

    try {
      let parsed: JSONContent;

      if (mode === "html") {
        parsed = parseHTMLToTipTap(code);
      } else {
        parsed = parseReactEmailToTipTap(code);
      }

      setPreview(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse code");
      setPreview(null);
    }
  }, [code, mode]);

  const handleImport = useCallback(() => {
    if (!editor) {
      toast.error("Editor not available");
      return;
    }

    if (!preview) {
      handlePreview();
      return;
    }

    setIsImporting(true);

    try {
      // Replace editor content with imported content
      editor.commands.setContent(preview);

      toast.success("Content imported!", {
        description: `Successfully imported ${mode === "html" ? "HTML" : "React Email"} content`,
      });

      // Reset and close
      setCode("");
      setPreview(null);
      setError(null);
      onClose();
    } catch (err) {
      toast.error("Failed to import", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setIsImporting(false);
    }
  }, [editor, preview, mode, handlePreview, onClose]);

  const handleClose = useCallback(() => {
    setCode("");
    setPreview(null);
    setError(null);
    onClose();
  }, [onClose]);

  return (
    <Dialog onOpenChange={(open) => !open && handleClose()} open={isOpen}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Import className="h-5 w-5" />
            Import Template
          </DialogTitle>
          <DialogDescription>
            Import existing HTML or React Email code into your template.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto">
          <Tabs
            onValueChange={(v) => {
              setMode(v as ImportMode);
              setPreview(null);
              setError(null);
            }}
            value={mode}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger className="flex items-center gap-2" value="html">
                <FileText className="h-4 w-4" />
                HTML
              </TabsTrigger>
              <TabsTrigger className="flex items-center gap-2" value="react">
                <FileCode className="h-4 w-4" />
                React Email
              </TabsTrigger>
            </TabsList>

            <TabsContent className="mt-4 space-y-4" value="html">
              <div className="space-y-2">
                <Label htmlFor="html-code">Paste your HTML code</Label>
                <Textarea
                  className="font-mono text-sm"
                  id="html-code"
                  onChange={(e) => {
                    setCode(e.target.value);
                    setPreview(null);
                    setError(null);
                  }}
                  placeholder={`<div style="background: #f5f5f5; padding: 24px;">
  <h1>Welcome!</h1>
  <p>This is your email content.</p>
  <a href="https://example.com" style="background: #5046e5; color: white; padding: 12px 24px;">
    Click here
  </a>
</div>`}
                  rows={8}
                  value={code}
                />
              </div>
            </TabsContent>

            <TabsContent className="mt-4 space-y-4" value="react">
              <div className="space-y-2">
                <Label htmlFor="react-code">Paste your React Email code</Label>
                <Textarea
                  className="font-mono text-sm"
                  id="react-code"
                  onChange={(e) => {
                    setCode(e.target.value);
                    setPreview(null);
                    setError(null);
                  }}
                  placeholder={`<Section style={{ backgroundColor: '#f5f5f5', padding: '24px' }}>
  <Heading as="h1">Welcome!</Heading>
  <Text>This is your email content.</Text>
  <Button href="https://example.com" style={{ backgroundColor: '#5046e5' }}>
    Click here
  </Button>
</Section>`}
                  rows={8}
                  value={code}
                />
              </div>
            </TabsContent>
          </Tabs>

          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-destructive text-sm">
              {error}
            </div>
          )}

          {preview && (
            <div className="space-y-2">
              <Label>Preview (JSON structure)</Label>
              <ScrollArea className="h-32 max-h-32 rounded-md border bg-muted/50">
                <pre className="p-3 font-mono text-xs">
                  {JSON.stringify(preview, null, 2)}
                </pre>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 gap-2 border-t pt-4">
          <Button onClick={handleClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button onClick={handlePreview} type="button" variant="secondary">
            <Code2 className="mr-2 h-4 w-4" />
            Preview
          </Button>
          <Button
            disabled={isImporting || !code.trim()}
            onClick={handleImport}
            type="button"
          >
            {isImporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Import className="mr-2 h-4 w-4" />
                Import
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
