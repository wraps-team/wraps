"use client";

import { mergeAttributes, Node } from "@tiptap/core";
import {
  type NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { Code, Pencil } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TailwindColorPicker } from "@/components/ui/tailwind-color-picker";
import { Textarea } from "@/components/ui/textarea";
import { DragHandle } from "./drag-handle";

export type EmailCodeBlockAttributes = {
  code: string;
  language: string;
  showLineNumbers: boolean;
  backgroundColor: string;
  textColor: string;
  padding: string;
  borderRadius: string;
  fontFamily: string;
  fontSize: string;
};

declare module "@tiptap/core" {
  // biome-ignore lint/style/useConsistentTypeDefinitions: interface required for module augmentation
  interface Commands<ReturnType> {
    emailCodeBlock: {
      insertEmailCodeBlock: (
        attributes?: Partial<EmailCodeBlockAttributes>
      ) => ReturnType;
      updateEmailCodeBlock: (
        attributes: Partial<EmailCodeBlockAttributes>
      ) => ReturnType;
    };
  }
}

const LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "json", label: "JSON" },
  { value: "bash", label: "Bash" },
  { value: "sql", label: "SQL" },
  { value: "plaintext", label: "Plain Text" },
];

const EmailCodeBlockNodeView = ({
  node,
  updateAttributes,
  selected,
}: NodeViewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const attrs = node.attrs as EmailCodeBlockAttributes;
  const [localAttrs, setLocalAttrs] = useState(attrs);

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setLocalAttrs(attrs);
    } else {
      updateAttributes(localAttrs);
    }
    setIsEditing(open);
  };

  const updateLocal = (
    key: keyof EmailCodeBlockAttributes,
    value: string | boolean
  ) => {
    setLocalAttrs((prev) => ({ ...prev, [key]: value }));
  };

  const codeLines = attrs.code.split("\n");

  return (
    <NodeViewWrapper
      className={`email-code-block-wrapper my-4 ${selected ? "ring-2 ring-primary ring-offset-2" : ""}`}
    >
      <div className="group relative">
        <div
          className="overflow-x-auto"
          style={{
            backgroundColor: attrs.backgroundColor,
            padding: attrs.padding,
            borderRadius: attrs.borderRadius,
            fontFamily: attrs.fontFamily,
            fontSize: attrs.fontSize,
          }}
        >
          {attrs.code ? (
            <pre className="m-0" style={{ color: attrs.textColor }}>
              <code>
                {attrs.showLineNumbers
                  ? codeLines.map((line, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: code lines are static, order never changes
                      <div className="flex" key={i}>
                        <span
                          className="mr-4 select-none opacity-50"
                          style={{ minWidth: "2ch" }}
                        >
                          {i + 1}
                        </span>
                        <span>{line}</span>
                      </div>
                    ))
                  : attrs.code}
              </code>
            </pre>
          ) : (
            <div
              className="flex items-center justify-center py-8"
              style={{ color: attrs.textColor }}
            >
              <Code className="mr-2 h-5 w-5 opacity-50" />
              <span className="opacity-50">Click to add code</span>
            </div>
          )}
        </div>

        {/* Drag handle and edit button */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <DragHandle />
          <Popover onOpenChange={handleOpenChange} open={isEditing}>
            <PopoverTrigger asChild>
              <Button className="h-6 w-6" size="icon" variant="secondary">
                <Pencil className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[400px]">
              <div className="space-y-4">
                <h4 className="font-medium">Code Block Settings</h4>

                <div className="space-y-2">
                  <Label htmlFor="code">Code</Label>
                  <Textarea
                    className="min-h-[120px] font-mono text-sm"
                    id="code"
                    onChange={(e) => updateLocal("code", e.target.value)}
                    placeholder="Enter your code here..."
                    value={localAttrs.code}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Language</Label>
                    <Select
                      onValueChange={(v) => updateLocal("language", v)}
                      value={localAttrs.language}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LANGUAGES.map((lang) => (
                          <SelectItem key={lang.value} value={lang.value}>
                            {lang.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Font Size</Label>
                    <Select
                      onValueChange={(v) => updateLocal("fontSize", v)}
                      value={localAttrs.fontSize}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12px">12px</SelectItem>
                        <SelectItem value="13px">13px</SelectItem>
                        <SelectItem value="14px">14px</SelectItem>
                        <SelectItem value="16px">16px</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <TailwindColorPicker
                  label="Background Color"
                  onChange={(v) => updateLocal("backgroundColor", v)}
                  value={localAttrs.backgroundColor}
                />

                <TailwindColorPicker
                  label="Text Color"
                  onChange={(v) => updateLocal("textColor", v)}
                  value={localAttrs.textColor}
                />

                <div className="flex items-center gap-2">
                  <input
                    checked={localAttrs.showLineNumbers}
                    id="line-numbers"
                    onChange={(e) =>
                      updateLocal("showLineNumbers", e.target.checked)
                    }
                    type="checkbox"
                  />
                  <Label className="font-normal" htmlFor="line-numbers">
                    Show line numbers
                  </Label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="padding">Padding</Label>
                    <Input
                      id="padding"
                      onChange={(e) => updateLocal("padding", e.target.value)}
                      placeholder="16px"
                      value={localAttrs.padding}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="border-radius">Border Radius</Label>
                    <Input
                      id="border-radius"
                      onChange={(e) =>
                        updateLocal("borderRadius", e.target.value)
                      }
                      placeholder="8px"
                      value={localAttrs.borderRadius}
                    />
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export const EmailCodeBlockNode = Node.create({
  name: "emailCodeBlock",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      code: { default: "" },
      language: { default: "javascript" },
      showLineNumbers: { default: false },
      backgroundColor: { default: "#1e1e1e" },
      textColor: { default: "#d4d4d4" },
      padding: { default: "16px" },
      borderRadius: { default: "8px" },
      fontFamily: { default: "'Fira Code', 'Consolas', monospace" },
      fontSize: { default: "14px" },
    };
  },

  parseHTML() {
    return [{ tag: "email-code-block" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["email-code-block", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EmailCodeBlockNodeView);
  },

  addCommands() {
    return {
      insertEmailCodeBlock:
        (attributes = {}) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: attributes,
          }),
      updateEmailCodeBlock:
        (attributes) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, attributes),
    };
  },
});
