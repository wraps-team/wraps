"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wraps/ui/components/ui/dialog";
import { ScrollArea } from "@wraps/ui/components/ui/scroll-area";
import { Textarea } from "@wraps/ui/components/ui/textarea";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { parseThemeCss } from "@/lib/preference-theme/parse";
import { themeToScopedCss } from "@/lib/preference-theme/serialize";
import { captureThemeImportCssApplied } from "../lib/analytics";
import type { ThemeDraft } from "./use-theme-draft";

const DEBOUNCE_MS = 200;
const MAX_WARNINGS_SHOWN = 20;

const PLACEHOLDER = `:root {
  --primary: oklch(0.55 0.2 260);
}
.dark {
  --primary: oklch(0.7 0.2 260);
}`;

type ImportCssDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTheme: ThemeDraft;
  onApply: (parsed: {
    light: Record<string, string>;
    dark: Record<string, string>;
  }) => void;
};

export function ImportCssDialog({
  open,
  onOpenChange,
  currentTheme,
  onApply,
}: ImportCssDialogProps) {
  const [css, setCss] = useState("");
  const [result, setResult] = useState<ReturnType<typeof parseThemeCss>>({
    theme: { light: {}, dark: {} },
    warnings: [],
  });

  useEffect(() => {
    if (!css) {
      setResult({ theme: { light: {}, dark: {} }, warnings: [] });
      return;
    }
    const timer = setTimeout(() => {
      setResult(parseThemeCss(css));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [css]);

  const lightCount = Object.keys(result.theme.light).length;
  const darkCount = Object.keys(result.theme.dark).length;
  const canApply = lightCount > 0 || darkCount > 0;
  const shownWarnings = result.warnings.slice(0, MAX_WARNINGS_SHOWN);
  const extraWarnings = result.warnings.length - shownWarnings.length;

  const handleApply = () => {
    captureThemeImportCssApplied({
      dark_token_count: darkCount,
      light_token_count: lightCount,
    });
    onApply(result.theme);
    onOpenChange(false);
    setCss("");
    toast.success("Theme imported — review the preview, then save.");
  };

  const handleCopy = async () => {
    const exported = themeToScopedCss(currentTheme, ":root");
    await navigator.clipboard.writeText(exported);
    toast.success("Copied current theme as CSS");
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import CSS</DialogTitle>
          <DialogDescription>
            Paste a shadcn <code>globals.css</code> (or just the{" "}
            <code>:root</code> and <code>.dark</code> blocks). We read the
            colors and corner radius and ignore everything else.
          </DialogDescription>
        </DialogHeader>

        {/* The shared Textarea is field-sizing-content (auto-grows with its
            content); without a max-height a pasted globals.css expands it past
            the viewport and pushes the footer buttons out of reach. */}
        <Textarea
          className="max-h-80 min-h-48 overflow-y-auto font-mono text-xs"
          onChange={(e) => setCss(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={16}
          value={css}
        />

        <div className="space-y-2">
          <p className="text-muted-foreground text-xs">
            Found {lightCount} light tokens, {darkCount} dark tokens
          </p>
          {shownWarnings.length > 0 && (
            <ScrollArea className="h-32 rounded-md border p-2">
              <ul className="space-y-1 text-muted-foreground text-xs">
                {shownWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
                {extraWarnings > 0 && <li>+{extraWarnings} more</li>}
              </ul>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button onClick={handleCopy} type="button" variant="outline">
            Copy current theme as CSS
          </Button>
          <Button disabled={!canApply} onClick={handleApply} type="button">
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
