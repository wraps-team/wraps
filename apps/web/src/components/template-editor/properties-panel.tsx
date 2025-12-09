"use client";

import type { Editor } from "@tiptap/react";
import { Layout, Link2, Palette, Settings2, Type } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import {
  borderRadiusPresets,
  fontSizePresets,
  fontWeightPresets,
  gapPresets,
  PresetSelector,
  paddingPresets,
  TailwindColorPicker,
} from "@/components/ui/tailwind-color-picker";

type PropertiesPanelProps = {
  editor: Editor | null;
};

type SelectedNodeInfo = {
  type: string;
  attrs: Record<string, unknown>;
  pos: number;
};

export function PropertiesPanel({ editor }: PropertiesPanelProps) {
  const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo | null>(
    null
  );

  // Track selection changes
  useEffect(() => {
    if (!editor) {
      return;
    }

    const updateSelection = () => {
      const { from } = editor.state.selection;
      const resolvedPos = editor.state.doc.resolve(from);

      // Walk up from selection to find a relevant node
      for (let depth = resolvedPos.depth; depth >= 0; depth--) {
        const node = resolvedPos.node(depth);
        const nodeType = node.type.name;

        // Check if it's one of our custom nodes
        if (
          [
            "emailButton",
            "emailSection",
            "emailImage",
            "emailDivider",
            "emailSpacer",
            "emailRow",
            "emailColumn",
            "variable",
            "conditional",
          ].includes(nodeType)
        ) {
          setSelectedNode({
            type: nodeType,
            attrs: { ...node.attrs },
            pos: resolvedPos.before(depth),
          });
          return;
        }
      }

      // No custom node selected
      setSelectedNode(null);
    };

    editor.on("selectionUpdate", updateSelection);
    editor.on("update", updateSelection);

    // Initial check
    updateSelection();

    return () => {
      editor.off("selectionUpdate", updateSelection);
      editor.off("update", updateSelection);
    };
  }, [editor]);

  const updateNodeAttr = useCallback(
    (key: string, value: unknown) => {
      if (!editor || selectedNode === null) {
        return;
      }

      const { pos, type } = selectedNode;

      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          const node = tr.doc.nodeAt(pos);
          if (node && node.type.name === type) {
            tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              [key]: value,
            });
          }
          return true;
        })
        .run();

      // Update local state
      setSelectedNode((prev) =>
        prev ? { ...prev, attrs: { ...prev.attrs, [key]: value } } : null
      );
    },
    [editor, selectedNode]
  );

  if (!editor) {
    return null;
  }

  return (
    <div className="flex h-full w-72 flex-col border-l bg-muted/30">
      <div className="border-b p-3">
        <h3 className="flex items-center gap-2 font-semibold text-sm">
          <Settings2 className="h-4 w-4" />
          Properties
        </h3>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3">
          {selectedNode ? (
            <div className="space-y-4">
              {/* Node Type Header */}
              <div className="border-b pb-2">
                <span className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  {formatNodeType(selectedNode.type)}
                </span>
              </div>

              {/* Render properties based on node type */}
              {selectedNode.type === "emailButton" && (
                <ButtonProperties
                  attrs={selectedNode.attrs}
                  onChange={updateNodeAttr}
                />
              )}

              {selectedNode.type === "emailSection" && (
                <SectionProperties
                  attrs={selectedNode.attrs}
                  onChange={updateNodeAttr}
                />
              )}

              {selectedNode.type === "emailImage" && (
                <ImageProperties
                  attrs={selectedNode.attrs}
                  onChange={updateNodeAttr}
                />
              )}

              {selectedNode.type === "emailDivider" && (
                <DividerProperties
                  attrs={selectedNode.attrs}
                  onChange={updateNodeAttr}
                />
              )}

              {selectedNode.type === "emailSpacer" && (
                <SpacerProperties
                  attrs={selectedNode.attrs}
                  onChange={updateNodeAttr}
                />
              )}

              {selectedNode.type === "variable" && (
                <VariableProperties
                  attrs={selectedNode.attrs}
                  onChange={updateNodeAttr}
                />
              )}

              {selectedNode.type === "conditional" && (
                <ConditionalProperties
                  attrs={selectedNode.attrs}
                  onChange={updateNodeAttr}
                />
              )}

              {selectedNode.type === "emailRow" && (
                <RowProperties
                  attrs={selectedNode.attrs}
                  onChange={updateNodeAttr}
                />
              )}

              {selectedNode.type === "emailColumn" && (
                <ColumnProperties
                  attrs={selectedNode.attrs}
                  onChange={updateNodeAttr}
                />
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              <p>Select an element to edit its properties</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function formatNodeType(type: string): string {
  return type
    .replace(/^email/, "")
    .replace(/([A-Z])/g, " $1")
    .trim();
}

// Property Panels for each node type

type PropertyProps = {
  attrs: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
};

function ButtonProperties({ attrs, onChange }: PropertyProps) {
  return (
    <>
      <PropertySection icon={<Link2 className="h-4 w-4" />} title="Link">
        <div className="space-y-2">
          <Label htmlFor="href">URL</Label>
          <Input
            id="href"
            onChange={(e) => onChange("href", e.target.value)}
            placeholder="https://example.com"
            value={(attrs.href as string) || ""}
          />
        </div>
      </PropertySection>

      <PropertySection icon={<Palette className="h-4 w-4" />} title="Colors">
        <div className="space-y-3">
          <TailwindColorPicker
            label="Background"
            onChange={(v) => onChange("backgroundColor", v)}
            value={(attrs.backgroundColor as string) || "#5046e5"}
          />
          <TailwindColorPicker
            label="Text"
            onChange={(v) => onChange("color", v)}
            value={(attrs.color as string) || "#ffffff"}
          />
        </div>
      </PropertySection>

      <PropertySection icon={<Type className="h-4 w-4" />} title="Typography">
        <div className="space-y-3">
          <PresetSelector
            label="Font Size"
            onChange={(v) => onChange("fontSize", v)}
            presets={fontSizePresets}
            value={(attrs.fontSize as string) || "14px"}
          />
          <PresetSelector
            label="Font Weight"
            onChange={(v) => onChange("fontWeight", v)}
            presets={fontWeightPresets}
            value={(attrs.fontWeight as string) || "600"}
          />
        </div>
      </PropertySection>

      <PropertySection icon={<Layout className="h-4 w-4" />} title="Layout">
        <div className="space-y-3">
          <PresetSelector
            label="Padding"
            onChange={(v) => onChange("padding", v)}
            presets={[
              { label: "SM", value: "8px 16px" },
              { label: "MD", value: "12px 24px" },
              { label: "LG", value: "16px 32px" },
              { label: "XL", value: "20px 40px" },
            ]}
            value={(attrs.padding as string) || "12px 24px"}
          />
          <PresetSelector
            label="Border Radius"
            onChange={(v) => onChange("borderRadius", v)}
            presets={borderRadiusPresets}
            value={(attrs.borderRadius as string) || "6px"}
          />
          <div className="space-y-2">
            <Label>Alignment</Label>
            <div className="flex gap-1">
              {(["left", "center", "right"] as const).map((align) => (
                <button
                  className={`flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                    (attrs.align as string) === align ||
                    (!attrs.align && align === "left")
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-accent"
                  }`}
                  key={align}
                  onClick={() => onChange("align", align)}
                  type="button"
                >
                  {align.charAt(0).toUpperCase() + align.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </PropertySection>
    </>
  );
}

function SectionProperties({ attrs, onChange }: PropertyProps) {
  return (
    <>
      <PropertySection
        icon={<Palette className="h-4 w-4" />}
        title="Background"
      >
        <TailwindColorPicker
          label="Background Color"
          onChange={(v) => onChange("backgroundColor", v)}
          value={(attrs.backgroundColor as string) || "#ffffff"}
        />
      </PropertySection>

      <PropertySection icon={<Layout className="h-4 w-4" />} title="Spacing">
        <div className="space-y-3">
          <PresetSelector
            label="Padding"
            onChange={(v) => onChange("padding", v)}
            presets={paddingPresets}
            value={(attrs.padding as string) || "24px"}
          />
          <PresetSelector
            label="Border Radius"
            onChange={(v) => onChange("borderRadius", v)}
            presets={borderRadiusPresets}
            value={(attrs.borderRadius as string) || "0"}
          />
        </div>
      </PropertySection>
    </>
  );
}

function ImageProperties({ attrs, onChange }: PropertyProps) {
  return (
    <>
      <PropertySection icon={<Link2 className="h-4 w-4" />} title="Source">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Image URL</Label>
            <Input
              onChange={(e) => onChange("src", e.target.value)}
              placeholder="https://example.com/image.jpg"
              value={(attrs.src as string) || ""}
            />
          </div>
          <div className="space-y-2">
            <Label>Alt Text</Label>
            <Input
              onChange={(e) => onChange("alt", e.target.value)}
              placeholder="Describe the image"
              value={(attrs.alt as string) || ""}
            />
          </div>
        </div>
      </PropertySection>

      <PropertySection icon={<Layout className="h-4 w-4" />} title="Size">
        <div className="space-y-3">
          <PresetSelector
            label="Width"
            onChange={(v) => onChange("width", v)}
            presets={[
              { label: "Auto", value: "auto" },
              { label: "Full", value: "100%" },
              { label: "3/4", value: "75%" },
              { label: "Half", value: "50%" },
              { label: "1/4", value: "25%" },
            ]}
            value={(attrs.width as string) || "100%"}
          />
          <div className="space-y-2">
            <Label>Height</Label>
            <Input
              onChange={(e) => onChange("height", e.target.value)}
              placeholder="auto"
              value={(attrs.height as string) || "auto"}
            />
          </div>
          <div className="space-y-2">
            <Label>Alignment</Label>
            <div className="flex gap-1">
              {(["left", "center", "right"] as const).map((align) => (
                <button
                  className={`flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                    (attrs.align as string) === align ||
                    (!attrs.align && align === "center")
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:bg-accent"
                  }`}
                  key={align}
                  onClick={() => onChange("align", align)}
                  type="button"
                >
                  {align.charAt(0).toUpperCase() + align.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </PropertySection>
    </>
  );
}

function DividerProperties({ attrs, onChange }: PropertyProps) {
  return (
    <PropertySection icon={<Layout className="h-4 w-4" />} title="Style">
      <div className="space-y-3">
        <TailwindColorPicker
          label="Color"
          onChange={(v) => onChange("color", v)}
          value={(attrs.color as string) || "#e5e7eb"}
        />
        <PresetSelector
          label="Thickness"
          onChange={(v) => onChange("thickness", v)}
          presets={[
            { label: "Thin", value: "1px" },
            { label: "Medium", value: "2px" },
            { label: "Thick", value: "4px" },
          ]}
          value={(attrs.thickness as string) || "1px"}
        />
        <PresetSelector
          label="Margin"
          onChange={(v) => onChange("margin", v)}
          presets={paddingPresets}
          value={(attrs.margin as string) || "24px"}
        />
      </div>
    </PropertySection>
  );
}

function RowProperties({ attrs, onChange }: PropertyProps) {
  return (
    <PropertySection icon={<Layout className="h-4 w-4" />} title="Layout">
      <div className="space-y-3">
        <PresetSelector
          label="Gap"
          onChange={(v) => onChange("gap", v)}
          presets={gapPresets}
          value={(attrs.gap as string) || "16px"}
        />
        <div className="space-y-2">
          <Label>Vertical Alignment</Label>
          <div className="flex gap-1">
            {(["top", "middle", "bottom"] as const).map((align) => (
              <button
                className={`flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  (attrs.align as string) === align ||
                  (!attrs.align && align === "top")
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background hover:bg-accent"
                }`}
                key={align}
                onClick={() => onChange("align", align)}
                type="button"
              >
                {align.charAt(0).toUpperCase() + align.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </PropertySection>
  );
}

function ColumnProperties({ attrs, onChange }: PropertyProps) {
  return (
    <PropertySection icon={<Layout className="h-4 w-4" />} title="Size">
      <PresetSelector
        label="Width"
        onChange={(v) => onChange("width", v)}
        presets={[
          { label: "Auto", value: "auto" },
          { label: "Full", value: "100%" },
          { label: "3/4", value: "75%" },
          { label: "2/3", value: "66.67%" },
          { label: "Half", value: "50%" },
          { label: "1/3", value: "33.33%" },
          { label: "1/4", value: "25%" },
        ]}
        value={(attrs.width as string) || "auto"}
      />
    </PropertySection>
  );
}

function SpacerProperties({ attrs, onChange }: PropertyProps) {
  const heightValue = Number.parseInt((attrs.height as string) || "24", 10);

  return (
    <PropertySection icon={<Layout className="h-4 w-4" />} title="Size">
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Height: {heightValue}px</Label>
          <Slider
            max={120}
            min={8}
            onValueChange={(values: number[]) =>
              onChange("height", `${values[0]}px`)
            }
            step={4}
            value={[heightValue]}
          />
        </div>
      </div>
    </PropertySection>
  );
}

function VariableProperties({ attrs, onChange }: PropertyProps) {
  return (
    <PropertySection icon={<Type className="h-4 w-4" />} title="Variable">
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Name</Label>
          <Input
            onChange={(e) => onChange("name", e.target.value)}
            placeholder="variableName"
            value={(attrs.name as string) || ""}
          />
        </div>
        <div className="space-y-2">
          <Label>Display Label</Label>
          <Input
            onChange={(e) => onChange("label", e.target.value)}
            placeholder="Variable"
            value={(attrs.label as string) || ""}
          />
        </div>
      </div>
    </PropertySection>
  );
}

function ConditionalProperties({ attrs, onChange }: PropertyProps) {
  return (
    <PropertySection icon={<Layout className="h-4 w-4" />} title="Condition">
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Variable</Label>
          <Input
            onChange={(e) => onChange("variable", e.target.value)}
            placeholder="variableName"
            value={(attrs.variable as string) || ""}
          />
        </div>
        <div className="space-y-2">
          <Label>Operator</Label>
          <Select
            onValueChange={(v) => onChange("operator", v)}
            value={(attrs.operator as string) || "equals"}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="equals">Equals</SelectItem>
              <SelectItem value="notEquals">Not Equals</SelectItem>
              <SelectItem value="exists">Exists</SelectItem>
              <SelectItem value="contains">Contains</SelectItem>
              <SelectItem value="greaterThan">Greater Than</SelectItem>
              <SelectItem value="lessThan">Less Than</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Value</Label>
          <Input
            disabled={(attrs.operator as string) === "exists"}
            onChange={(e) => onChange("value", e.target.value)}
            placeholder="Compare value"
            value={(attrs.value as string) || ""}
          />
        </div>
      </div>
    </PropertySection>
  );
}

// Helper component for property sections
function PropertySection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 font-medium text-sm">
        {icon}
        {title}
      </div>
      {children}
      <Separator className="my-4" />
    </div>
  );
}
