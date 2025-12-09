"use client";

import type { Editor } from "@tiptap/react";
import { Braces, FlaskConical, Plus, Trash2, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useTemplateStore } from "@/stores/template-store";

type TestDataPanelProps = {
  editor: Editor | null;
  className?: string;
};

type VariableInfo = {
  name: string;
  label: string;
  type?: string;
};

// Extract variables from TipTap document
function extractVariablesFromDoc(editor: Editor | null): VariableInfo[] {
  if (!editor) {
    return [];
  }

  const variables: VariableInfo[] = [];
  const seen = new Set<string>();

  editor.state.doc.descendants((node) => {
    if (node.type.name === "variable" && !seen.has(node.attrs.name)) {
      seen.add(node.attrs.name);
      variables.push({
        name: node.attrs.name,
        label: node.attrs.label || node.attrs.name,
        type: "text",
      });
    }
    // Also check conditionals for variables
    if (node.type.name === "conditional" && !seen.has(node.attrs.variable)) {
      seen.add(node.attrs.variable);
      variables.push({
        name: node.attrs.variable,
        label: node.attrs.variable,
        type: "text",
      });
    }
    return true;
  });

  return variables;
}

// Sample data presets
const samplePresets = {
  customer: {
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@example.com",
    companyName: "Acme Inc",
  },
  test: {
    firstName: "Test",
    lastName: "User",
    email: "test@test.com",
    companyName: "Test Company",
  },
};

export function TestDataPanel({ editor, className }: TestDataPanelProps) {
  const { testData } = useTemplateStore((state) => state.localState);
  const { setTestData } = useTemplateStore((state) => state.actions);
  const [customKey, setCustomKey] = useState("");
  const [customValue, setCustomValue] = useState("");

  // Extract variables from the document
  const documentVariables = useMemo(
    () => extractVariablesFromDoc(editor),
    // Re-extract when document changes
    // biome-ignore lint/correctness/useExhaustiveDependencies: need to re-extract on doc changes
    [editor, editor?.state.doc]
  );

  // Update a single value
  const updateValue = useCallback(
    (key: string, value: string) => {
      setTestData({ ...testData, [key]: value });
    },
    [testData, setTestData]
  );

  // Remove a value
  const removeValue = useCallback(
    (key: string) => {
      const newData = { ...testData };
      delete newData[key];
      setTestData(newData);
    },
    [testData, setTestData]
  );

  // Add custom variable
  const addCustomVariable = useCallback(() => {
    if (customKey.trim()) {
      updateValue(customKey.trim(), customValue);
      setCustomKey("");
      setCustomValue("");
    }
  }, [customKey, customValue, updateValue]);

  // Apply preset
  const applyPreset = useCallback(
    (preset: keyof typeof samplePresets) => {
      setTestData({ ...testData, ...samplePresets[preset] });
    },
    [testData, setTestData]
  );

  // Clear all
  const clearAll = useCallback(() => {
    setTestData({});
  }, [setTestData]);

  // Get all keys (document variables + custom)
  const _allKeys = useMemo(() => {
    const docVarNames = documentVariables.map((v) => v.name);
    const customKeys = Object.keys(testData).filter(
      (k) => !docVarNames.includes(k)
    );
    return [...docVarNames, ...customKeys];
  }, [documentVariables, testData]);

  return (
    <div
      className={`flex h-full w-72 flex-col border-l bg-muted/30 ${className}`}
    >
      <div className="flex items-center justify-between border-b p-3">
        <h3 className="flex items-center gap-2 font-semibold text-sm">
          <FlaskConical className="h-4 w-4" />
          Test Data
        </h3>
        {Object.keys(testData).length > 0 && (
          <Button
            className="h-6 w-6"
            onClick={clearAll}
            size="icon"
            title="Clear all"
            variant="ghost"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-3">
          {/* Quick Presets */}
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs">Quick Fill</Label>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => applyPreset("customer")}
                size="sm"
                variant="outline"
              >
                Customer
              </Button>
              <Button
                className="flex-1"
                onClick={() => applyPreset("test")}
                size="sm"
                variant="outline"
              >
                Test User
              </Button>
            </div>
          </div>

          <Separator />

          {/* Document Variables */}
          {documentVariables.length > 0 && (
            <div className="space-y-3">
              <Label className="text-muted-foreground text-xs">
                Template Variables ({documentVariables.length})
              </Label>
              {documentVariables.map((variable) => (
                <div className="space-y-1.5" key={variable.name}>
                  <div className="flex items-center gap-2">
                    <Braces className="h-3.5 w-3.5 text-blue-500" />
                    <Label
                      className="font-mono text-xs"
                      htmlFor={variable.name}
                    >
                      {variable.name}
                    </Label>
                  </div>
                  <Input
                    id={variable.name}
                    onChange={(e) => updateValue(variable.name, e.target.value)}
                    placeholder={variable.label}
                    value={(testData[variable.name] as string) ?? ""}
                  />
                </div>
              ))}
            </div>
          )}

          {documentVariables.length === 0 && (
            <div className="py-4 text-center text-muted-foreground text-xs">
              <p>No variables in template</p>
              <p className="mt-1">
                Type <code className="rounded bg-muted px-1">{"{{"}</code> to
                add variables
              </p>
            </div>
          )}

          <Separator />

          {/* Custom Variables */}
          <div className="space-y-3">
            <Label className="text-muted-foreground text-xs">
              Custom Variables
            </Label>

            {/* List custom variables not in document */}
            {Object.entries(testData)
              .filter(([key]) => !documentVariables.some((v) => v.name === key))
              .map(([key, value]) => (
                <div className="space-y-1.5" key={key}>
                  <div className="flex items-center justify-between">
                    <Label className="font-mono text-xs">{key}</Label>
                    <Button
                      className="h-5 w-5"
                      onClick={() => removeValue(key)}
                      size="icon"
                      variant="ghost"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <Input
                    onChange={(e) => updateValue(key, e.target.value)}
                    value={(value as string) ?? ""}
                  />
                </div>
              ))}

            {/* Add new custom variable */}
            <div className="space-y-2 rounded border border-dashed p-2">
              <div className="grid grid-cols-2 gap-2">
                <Input
                  onChange={(e) => setCustomKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCustomVariable()}
                  placeholder="Variable name"
                  value={customKey}
                />
                <Input
                  onChange={(e) => setCustomValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCustomVariable()}
                  placeholder="Value"
                  value={customValue}
                />
              </div>
              <Button
                className="w-full"
                disabled={!customKey.trim()}
                onClick={addCustomVariable}
                size="sm"
                variant="secondary"
              >
                <Plus className="mr-2 h-3.5 w-3.5" />
                Add Variable
              </Button>
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t bg-muted/50 p-2 text-muted-foreground text-xs">
        <p>
          Test data is used in preview mode to simulate how your email will look
          with real values.
        </p>
      </div>
    </div>
  );
}
