"use client";

import { useDebouncedValue } from "@tanstack/react-pacer";
import type { Editor } from "@tiptap/react";
import {
  Check,
  Monitor,
  Moon,
  Settings,
  Smartphone,
  Sun,
  Tablet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { tiptapToReactEmail } from "@/lib/serializers/tiptap-to-react-email";
import { useTemplateStore } from "@/stores/template-store";

type PreviewPanelProps = {
  editor: Editor | null;
};

type DeviceType = "desktop" | "tablet" | "mobile";

const deviceWidths: Record<DeviceType, number> = {
  desktop: 600,
  tablet: 480,
  mobile: 375,
};

export function PreviewPanel({ editor }: PreviewPanelProps) {
  const [device, setDevice] = useState<DeviceType>("desktop");
  const [darkMode, setDarkMode] = useState(false);
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [iframeHeight, setIframeHeight] = useState(600);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const testData = useTemplateStore((state) => state.localState.testData);
  const { setTestData } = useTemplateStore((state) => state.actions);

  // Auto-adjust iframe height based on content
  const adjustIframeHeight = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow?.document?.body) {
      return;
    }

    // Get the content height
    const contentHeight = iframe.contentWindow.document.body.scrollHeight;
    // Set minimum height of 400px, add padding
    const newHeight = Math.max(400, contentHeight + 40);
    setIframeHeight(newHeight);
  }, []);

  // Get current editor content as JSON string for debouncing
  const editorContentJson = useMemo(() => {
    if (!editor) {
      return "";
    }
    return JSON.stringify(editor.getJSON());
  }, [editor?.state.doc, editor]);

  // Debounce preview updates - wait 500ms after user stops typing
  const [debouncedContent] = useDebouncedValue(editorContentJson, {
    wait: 500,
  });

  // Extract variables from editor content
  const variables = useMemo(() => {
    if (!editor) {
      return [];
    }

    const vars: string[] = [];
    editor.state.doc.descendants((node) => {
      if (node.type.name === "variable") {
        const name = node.attrs.name as string;
        if (name && !vars.includes(name)) {
          vars.push(name);
        }
      }
    });
    return vars;
  }, [editor?.state.doc, editor]);

  // Generate preview HTML when debounced content or test data changes
  useEffect(() => {
    if (!debouncedContent) {
      return;
    }

    try {
      const content = JSON.parse(debouncedContent);
      // Serialize to React Email JSX string, then we'll render it
      const _reactEmailJsx = tiptapToReactEmail(content, testData);
      // For now, create a simple HTML preview
      // In production, you'd render the React Email component server-side
      setHtmlContent(generatePreviewHtml(content, testData, darkMode));
    } catch {
      setHtmlContent("<p>Error generating preview</p>");
    }
  }, [debouncedContent, testData, darkMode]);

  // Adjust iframe height when content changes
  useEffect(() => {
    if (!htmlContent) {
      return;
    }

    // Wait for iframe to render content, then adjust height
    const timeouts = [
      setTimeout(adjustIframeHeight, 100),
      setTimeout(adjustIframeHeight, 300),
      setTimeout(adjustIframeHeight, 500),
    ];

    return () => timeouts.forEach(clearTimeout);
  }, [htmlContent, adjustIframeHeight]);

  const handleTestDataChange = (key: string, value: string) => {
    setTestData({ ...testData, [key]: value });
  };

  // Device labels for display
  const deviceLabels: Record<DeviceType, string> = {
    desktop: "Desktop",
    tablet: "Tablet",
    mobile: "Mobile",
  };

  const deviceIcons: Record<DeviceType, React.ReactNode> = {
    desktop: <Monitor className="h-4 w-4" />,
    tablet: <Tablet className="h-4 w-4" />,
    mobile: <Smartphone className="h-4 w-4" />,
  };

  return (
    <div className="flex h-full flex-col">
      {/* Preview Controls - Compact Header */}
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
        {/* Left: Current device indicator */}
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          {deviceIcons[device]}
          <span className="hidden sm:inline">{deviceWidths[device]}px</span>
          {darkMode && <Moon className="h-3 w-3" />}
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-1">
          {/* Device Toggle - Compact */}
          <ToggleGroup
            className="hidden sm:flex"
            onValueChange={(value) => value && setDevice(value as DeviceType)}
            size="sm"
            type="single"
            value={device}
            variant="outline"
          >
            <ToggleGroupItem
              aria-label="Desktop"
              className="h-8 w-8 p-0"
              value="desktop"
            >
              <Monitor className="h-3.5 w-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem
              aria-label="Tablet"
              className="h-8 w-8 p-0"
              value="tablet"
            >
              <Tablet className="h-3.5 w-3.5" />
            </ToggleGroupItem>
            <ToggleGroupItem
              aria-label="Mobile"
              className="h-8 w-8 p-0"
              value="mobile"
            >
              <Smartphone className="h-3.5 w-3.5" />
            </ToggleGroupItem>
          </ToggleGroup>

          {/* Dark Mode Toggle - Single button */}
          <Button
            className="h-8 w-8 p-0"
            onClick={() => setDarkMode(!darkMode)}
            size="sm"
            title={darkMode ? "Light mode" : "Dark mode"}
            variant={darkMode ? "secondary" : "ghost"}
          >
            {darkMode ? (
              <Moon className="h-3.5 w-3.5" />
            ) : (
              <Sun className="h-3.5 w-3.5" />
            )}
          </Button>

          {/* Settings Dropdown - Combines device (mobile) + test data */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="h-8 w-8 p-0" size="sm" variant="ghost">
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {/* Device selection for mobile */}
              <DropdownMenuLabel className="sm:hidden">
                Device
              </DropdownMenuLabel>
              <div className="sm:hidden">
                {(["desktop", "tablet", "mobile"] as DeviceType[]).map((d) => (
                  <DropdownMenuItem key={d} onClick={() => setDevice(d)}>
                    <span className="flex items-center gap-2">
                      {deviceIcons[d]}
                      {deviceLabels[d]}
                    </span>
                    {device === d && <Check className="ml-auto h-4 w-4" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </div>

              <DropdownMenuLabel>Theme</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setDarkMode(false)}>
                <Sun className="mr-2 h-4 w-4" />
                Light
                {!darkMode && <Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDarkMode(true)}>
                <Moon className="mr-2 h-4 w-4" />
                Dark
                {darkMode && <Check className="ml-auto h-4 w-4" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Test Data Sheet */}
          <Sheet>
            <SheetTrigger asChild>
              <Button className="h-8 gap-1.5 px-2" size="sm" variant="outline">
                <span className="text-xs">Test Data</span>
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Test Data</SheetTitle>
                <SheetDescription>
                  Set values for variables to preview how your email will look
                  with real data.
                </SheetDescription>
              </SheetHeader>
              <ScrollArea className="mt-4 h-[calc(100vh-180px)]">
                <div className="space-y-4 pr-4">
                  {variables.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No variables found in your template. Add variables using
                      the Variable block.
                    </p>
                  ) : (
                    variables.map((variable) => (
                      <div className="space-y-2" key={variable}>
                        <Label htmlFor={variable}>{`{{${variable}}}`}</Label>
                        <Input
                          id={variable}
                          onChange={(e) =>
                            handleTestDataChange(variable, e.target.value)
                          }
                          placeholder={`Enter test value for ${variable}`}
                          value={(testData[variable] as string) || ""}
                        />
                      </div>
                    ))
                  )}

                  {/* Common test data suggestions */}
                  <div className="border-t pt-4">
                    <p className="mb-2 font-medium text-sm">Quick Fill</p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() =>
                          setTestData({
                            ...testData,
                            firstName: "John",
                            lastName: "Doe",
                            email: "john@example.com",
                            company: "Acme Inc",
                          })
                        }
                        size="sm"
                        variant="outline"
                      >
                        Sample User
                      </Button>
                      <Button
                        onClick={() =>
                          setTestData({
                            ...testData,
                            orderNumber: "ORD-12345",
                            orderTotal: "$99.00",
                            orderDate: new Date().toLocaleDateString(),
                          })
                        }
                        size="sm"
                        variant="outline"
                      >
                        Sample Order
                      </Button>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Preview Frame */}
      <div
        className={`flex-1 overflow-auto transition-colors duration-200 ${
          darkMode ? "bg-zinc-900" : "bg-muted/50"
        }`}
      >
        <div className="flex min-h-full flex-col items-center py-6">
          {/* Email container with device-specific styling */}
          <div
            className={`rounded-lg shadow-2xl transition-all duration-200 ${
              darkMode
                ? "bg-zinc-800 ring-1 ring-zinc-700"
                : "bg-white ring-1 ring-gray-200"
            }`}
            style={{
              width: deviceWidths[device],
              maxWidth: "100%",
            }}
          >
            <iframe
              className="w-full border-0 transition-[height] duration-200"
              onLoad={adjustIframeHeight}
              ref={iframeRef}
              sandbox="allow-same-origin"
              srcDoc={htmlContent}
              style={{
                height: iframeHeight,
                minHeight: "400px",
              }}
              title="Email Preview"
            />
          </div>

          {/* Device indicator */}
          <div className="mt-4 text-center">
            <span
              className={`text-xs ${darkMode ? "text-zinc-500" : "text-muted-foreground"}`}
            >
              {device === "desktop" && "Desktop (600px)"}
              {device === "tablet" && "Tablet (480px)"}
              {device === "mobile" && "Mobile (375px)"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple HTML generator for preview (placeholder - actual implementation uses React Email)
function generatePreviewHtml(
  content: { type?: string; content?: unknown[] },
  testData: Record<string, unknown>,
  darkMode = false
): string {
  const colors = darkMode
    ? {
        bg: "#1f2937",
        text: "#f9fafb",
        muted: "#9ca3af",
        border: "#374151",
        buttonBg: "#6366f1",
      }
    : {
        bg: "#ffffff",
        text: "#1f2937",
        muted: "#6b7280",
        border: "#e5e7eb",
        buttonBg: "#5046e5",
      };
  const replaceVariables = (text: string): string =>
    text.replace(
      /\{\{(\w+)\}\}/g,
      (match, varName) => (testData[varName] as string) || match
    );

  const renderNode = (node: {
    type?: string;
    attrs?: Record<string, unknown>;
    content?: unknown[];
    text?: string;
  }): string => {
    if (!node.type) {
      return "";
    }

    switch (node.type) {
      case "doc":
        return (node.content || [])
          .map((n) =>
            renderNode(
              n as {
                type?: string;
                attrs?: Record<string, unknown>;
                content?: unknown[];
                text?: string;
              }
            )
          )
          .join("");

      case "paragraph": {
        const pContent = (node.content || [])
          .map((n) =>
            renderNode(
              n as {
                type?: string;
                attrs?: Record<string, unknown>;
                content?: unknown[];
                text?: string;
              }
            )
          )
          .join("");
        return `<p style="margin: 0 0 16px 0; line-height: 1.5;">${pContent}</p>`;
      }

      case "heading": {
        const level = (node.attrs?.level as number) || 1;
        const hContent = (node.content || [])
          .map((n) =>
            renderNode(
              n as {
                type?: string;
                attrs?: Record<string, unknown>;
                content?: unknown[];
                text?: string;
              }
            )
          )
          .join("");
        const sizes: Record<number, string> = {
          1: "24px",
          2: "20px",
          3: "18px",
        };
        return `<h${level} style="margin: 0 0 16px 0; font-size: ${sizes[level] || "16px"}; font-weight: 600;">${hContent}</h${level}>`;
      }

      case "text":
        return replaceVariables(node.text || "");

      case "variable": {
        const varName = node.attrs?.name as string;
        const value = testData[varName];
        return value !== undefined ? String(value) : `{{${varName}}}`;
      }

      case "emailButton": {
        const attrs = node.attrs || {};
        const align = (attrs.align as string) || "left";
        const btnContent = (node.content || [])
          .map((n) =>
            renderNode(
              n as {
                type?: string;
                attrs?: Record<string, unknown>;
                content?: unknown[];
                text?: string;
              }
            )
          )
          .join("");
        return `<div style="text-align: ${align};"><a href="${attrs.href || "#"}" style="display: inline-block; padding: ${attrs.padding || "12px 24px"}; background-color: ${attrs.backgroundColor || "#5046e5"}; color: ${attrs.color || "#ffffff"}; border-radius: ${attrs.borderRadius || "6px"}; text-decoration: none; font-weight: ${attrs.fontWeight || "600"}; font-size: ${attrs.fontSize || "14px"};">${btnContent || "Click here"}</a></div>`;
      }

      case "emailSection": {
        const attrs = node.attrs || {};
        const sectionContent = (node.content || [])
          .map((n) =>
            renderNode(
              n as {
                type?: string;
                attrs?: Record<string, unknown>;
                content?: unknown[];
                text?: string;
              }
            )
          )
          .join("");
        return `<div style="padding: ${attrs.padding || "24px"}; background-color: ${attrs.backgroundColor || "transparent"}; border-radius: ${attrs.borderRadius || "0"};">${sectionContent}</div>`;
      }

      case "emailImage": {
        const attrs = node.attrs || {};
        const align = (attrs.align as string) || "center";
        return `<div style="text-align: ${align};"><img src="${attrs.src || "https://placehold.co/600x200"}" alt="${attrs.alt || ""}" width="${attrs.width || "100%"}" style="display: inline-block; max-width: 100%; height: auto;" /></div>`;
      }

      case "emailDivider": {
        const attrs = node.attrs || {};
        return `<hr style="border: none; border-top: ${attrs.thickness || "1px"} solid ${attrs.color || "#e5e7eb"}; margin: ${attrs.margin || "24px"} 0;" />`;
      }

      case "emailSpacer": {
        const attrs = node.attrs || {};
        return `<div style="height: ${attrs.height || "24px"};"></div>`;
      }

      case "bulletList": {
        const ulContent = (node.content || [])
          .map((n) =>
            renderNode(
              n as {
                type?: string;
                attrs?: Record<string, unknown>;
                content?: unknown[];
                text?: string;
              }
            )
          )
          .join("");
        return `<ul style="margin: 0 0 16px 0; padding-left: 24px;">${ulContent}</ul>`;
      }

      case "orderedList": {
        const olContent = (node.content || [])
          .map((n) =>
            renderNode(
              n as {
                type?: string;
                attrs?: Record<string, unknown>;
                content?: unknown[];
                text?: string;
              }
            )
          )
          .join("");
        return `<ol style="margin: 0 0 16px 0; padding-left: 24px;">${olContent}</ol>`;
      }

      case "listItem": {
        const liContent = (node.content || [])
          .map((n) =>
            renderNode(
              n as {
                type?: string;
                attrs?: Record<string, unknown>;
                content?: unknown[];
                text?: string;
              }
            )
          )
          .join("");
        return `<li style="margin-bottom: 8px;">${liContent}</li>`;
      }

      case "blockquote": {
        const bqContent = (node.content || [])
          .map((n) =>
            renderNode(
              n as {
                type?: string;
                attrs?: Record<string, unknown>;
                content?: unknown[];
                text?: string;
              }
            )
          )
          .join("");
        return `<blockquote style="margin: 0 0 16px 0; padding-left: 16px; border-left: 4px solid #e5e7eb; color: #6b7280;">${bqContent}</blockquote>`;
      }

      case "conditional": {
        const attrs = node.attrs || {};
        const varValue = testData[attrs.variable as string];
        const compareValue = attrs.value;
        const operator = attrs.operator || "equals";

        let showContent = false;
        switch (operator) {
          case "equals":
            showContent = varValue === compareValue;
            break;
          case "notEquals":
            showContent = varValue !== compareValue;
            break;
          case "exists":
            showContent =
              varValue !== undefined && varValue !== null && varValue !== "";
            break;
          case "contains":
            showContent = String(varValue || "").includes(
              String(compareValue || "")
            );
            break;
          case "greaterThan":
            showContent = Number(varValue) > Number(compareValue);
            break;
          case "lessThan":
            showContent = Number(varValue) < Number(compareValue);
            break;
        }

        if (showContent) {
          return (node.content || [])
            .map((n) =>
              renderNode(
                n as {
                  type?: string;
                  attrs?: Record<string, unknown>;
                  content?: unknown[];
                  text?: string;
                }
              )
            )
            .join("");
        }
        return "";
      }

      default:
        // For unknown nodes, try to render children
        if (node.content) {
          return (node.content || [])
            .map((n) =>
              renderNode(
                n as {
                  type?: string;
                  attrs?: Record<string, unknown>;
                  content?: unknown[];
                  text?: string;
                }
              )
            )
            .join("");
        }
        return "";
    }
  };

  const bodyHtml = renderNode(
    content as {
      type?: string;
      attrs?: Record<string, unknown>;
      content?: unknown[];
      text?: string;
    }
  );

  return `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<style>
		body {
			margin: 0;
			padding: 24px;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
			font-size: 14px;
			line-height: 1.5;
			color: ${colors.text};
			background-color: ${colors.bg};
		}
		* {
			box-sizing: border-box;
		}
		a {
			color: ${darkMode ? "#818cf8" : "#5046e5"};
		}
		hr {
			border-color: ${colors.border};
		}
		blockquote {
			border-left-color: ${colors.border};
			color: ${colors.muted};
		}
	</style>
</head>
<body>
	${bodyHtml}
</body>
</html>
	`.trim();
}
