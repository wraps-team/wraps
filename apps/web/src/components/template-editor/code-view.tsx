"use client";

import type { JSONContent } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import {
  Check,
  Copy,
  Download,
  FileCode2,
  FileJson,
  Loader2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { codeToHtml } from "shiki";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CodeViewProps {
  editor: Editor | null;
}

type CodeFormat = "react-email" | "json" | "html";

/**
 * Generates React Email code as a string from TipTap JSON content
 * Uses Tailwind CSS classes for styling
 */
function generateReactEmailCode(content: JSONContent, indent = 0): string {
  const spaces = "  ".repeat(indent);

  if (!content.type) return "";

  switch (content.type) {
    case "doc": {
      const children = (content.content || [])
        .map((c) => generateReactEmailCode(c, indent))
        .filter(Boolean)
        .join("\n");
      return `import { Html, Head, Body, Container, Text, Button, Section, Img, Hr, Heading, Link, Tailwind } from "@react-email/components";

export default function EmailTemplate() {
  return (
    <Html>
      <Tailwind>
        <Head />
        <Body className="bg-gray-100 font-sans">
          <Container className="bg-white mx-auto p-5 max-w-[600px]">
${children}
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}`;
    }

    case "paragraph": {
      const pContent = (content.content || [])
        .map((c) => generateReactEmailCode(c, 0))
        .join("");
      return `${spaces}          <Text className="my-4 leading-relaxed">${pContent}</Text>`;
    }

    case "heading": {
      const level = content.attrs?.level || 1;
      const hContent = (content.content || [])
        .map((c) => generateReactEmailCode(c, 0))
        .join("");
      const headingClasses: Record<number, string> = {
        1: "text-3xl font-bold my-4",
        2: "text-2xl font-bold my-4",
        3: "text-xl font-semibold my-3",
        4: "text-lg font-semibold my-3",
        5: "text-base font-semibold my-2",
        6: "text-sm font-semibold my-2",
      };
      return `${spaces}          <Heading as="h${level}" className="${headingClasses[level] || headingClasses[1]}">${hContent}</Heading>`;
    }

    case "text":
      return content.text || "";

    case "emailButton": {
      const attrs = content.attrs || {};
      const align = attrs.align || "left";
      const radiusMap: Record<string, string> = {
        "0px": "rounded-none",
        "4px": "rounded",
        "6px": "rounded-md",
        "8px": "rounded-lg",
        "9999px": "rounded-full",
      };
      const roundedClass =
        radiusMap[attrs.borderRadius as string] || "rounded-md";
      const alignClass =
        align === "center"
          ? "text-center"
          : align === "right"
            ? "text-right"
            : "text-left";
      const btnText =
        (content.content || [])
          .map((c) => generateReactEmailCode(c, 0))
          .join("") || "Click here";
      return `${spaces}          <div className="${alignClass}">
${spaces}            <Button
${spaces}              href="${attrs.href || "#"}"
${spaces}              className="bg-indigo-600 text-white px-6 py-3 font-semibold no-underline inline-block ${roundedClass}"
${spaces}            >
${spaces}              ${btnText}
${spaces}            </Button>
${spaces}          </div>`;
    }

    case "emailSection": {
      const sectionChildren = (content.content || [])
        .map((c) => generateReactEmailCode(c, indent + 1))
        .filter(Boolean)
        .join("\n");
      return `${spaces}          <Section className="p-6">
${sectionChildren}
${spaces}          </Section>`;
    }

    case "emailImage": {
      const attrs = content.attrs || {};
      const align = attrs.align || "center";
      const alignClass =
        align === "center"
          ? "text-center"
          : align === "right"
            ? "text-right"
            : "text-left";
      return `${spaces}          <div className="${alignClass}">
${spaces}            <Img
${spaces}              src="${attrs.src || ""}"
${spaces}              alt="${attrs.alt || ""}"
${spaces}              width="${attrs.width || "100%"}"
${spaces}              className="max-w-full h-auto inline-block"
${spaces}            />
${spaces}          </div>`;
    }

    case "emailDivider":
      return `${spaces}          <Hr className="border-gray-200 my-6" />`;

    case "emailSpacer": {
      const height = content.attrs?.height || "24px";
      return `${spaces}          <div className="w-full h-[${height}]" />`;
    }

    case "variable":
      return `{props.${content.attrs?.name || "variable"}}`;

    case "bulletList": {
      const items = (content.content || [])
        .map((c) => generateReactEmailCode(c, indent))
        .join("\n");
      return `${spaces}          <ul className="pl-5 my-4 list-disc">
${items}
${spaces}          </ul>`;
    }

    case "orderedList": {
      const items = (content.content || [])
        .map((c) => generateReactEmailCode(c, indent))
        .join("\n");
      return `${spaces}          <ol className="pl-5 my-4 list-decimal">
${items}
${spaces}          </ol>`;
    }

    case "listItem": {
      const liContent = (content.content || [])
        .map((c) => {
          // For list items, render the paragraph content directly
          if (c.type === "paragraph") {
            return (c.content || [])
              .map((t) => generateReactEmailCode(t, 0))
              .join("");
          }
          return generateReactEmailCode(c, 0);
        })
        .join("");
      return `${spaces}            <li className="my-1">${liContent}</li>`;
    }

    case "blockquote": {
      const bqContent = (content.content || [])
        .map((c) => generateReactEmailCode(c, indent + 1))
        .join("\n");
      return `${spaces}          <blockquote className="border-l-4 border-gray-200 pl-4 my-4 text-gray-500 italic">
${bqContent}
${spaces}          </blockquote>`;
    }

    case "conditional": {
      const attrs = content.attrs || {};
      const condContent = (content.content || [])
        .map((c) => generateReactEmailCode(c, indent + 1))
        .join("\n");
      return `${spaces}          {props.${attrs.variable} ${getOperatorCode(attrs.operator as string)} ${JSON.stringify(attrs.value)} && (
${condContent}
${spaces}          )}`;
    }

    default:
      if (content.content) {
        return (content.content || [])
          .map((c) => generateReactEmailCode(c, indent))
          .filter(Boolean)
          .join("\n");
      }
      return "";
  }
}

function getOperatorCode(operator: string): string {
  switch (operator) {
    case "equals":
      return "===";
    case "notEquals":
      return "!==";
    case "greaterThan":
      return ">";
    case "lessThan":
      return "<";
    case "contains":
      return ".includes";
    default:
      return "===";
  }
}

/**
 * Simple HTML prettifier that adds proper indentation and line breaks
 */
function prettifyHtml(html: string): string {
  // Tags that should have their own line
  const blockTags = new Set([
    "html",
    "head",
    "body",
    "div",
    "p",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ul",
    "ol",
    "li",
    "table",
    "thead",
    "tbody",
    "tr",
    "td",
    "th",
    "section",
    "article",
    "header",
    "footer",
    "nav",
    "aside",
    "main",
    "blockquote",
    "pre",
    "hr",
    "br",
    "img",
    "a",
    "button",
  ]);

  let formatted = "";
  let indent = 0;
  const indentStr = "  ";

  // Normalize the HTML first
  const normalized = html
    .replace(/>\s+</g, "><") // Remove whitespace between tags
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();

  // Process character by character
  let i = 0;
  while (i < normalized.length) {
    // Check if we're at a tag
    if (normalized[i] === "<") {
      const tagEnd = normalized.indexOf(">", i);
      if (tagEnd === -1) {
        formatted += normalized[i];
        i++;
        continue;
      }

      const tag = normalized.slice(i, tagEnd + 1);
      const tagName = tag.match(/<\/?([a-zA-Z0-9]+)/)?.[1]?.toLowerCase() || "";
      const isClosingTag = tag.startsWith("</");
      const isSelfClosing = tag.endsWith("/>") || tag.includes(" />");
      const isVoidElement = /^(br|hr|img|input|meta|link)$/i.test(tagName);

      // Decrease indent for closing tags
      if (isClosingTag && blockTags.has(tagName)) {
        indent = Math.max(0, indent - 1);
      }

      // Add newline and indent for block tags
      if (blockTags.has(tagName)) {
        if (formatted && !formatted.endsWith("\n")) {
          formatted += "\n";
        }
        formatted += indentStr.repeat(indent);
      }

      formatted += tag;

      // Increase indent after opening block tags (but not self-closing or void)
      if (
        !(isClosingTag || isSelfClosing || isVoidElement) &&
        blockTags.has(tagName)
      ) {
        indent++;
        formatted += "\n";
      } else if (blockTags.has(tagName)) {
        formatted += "\n";
      }

      i = tagEnd + 1;
    } else {
      // Regular text content
      const nextTag = normalized.indexOf("<", i);
      const text =
        nextTag === -1 ? normalized.slice(i) : normalized.slice(i, nextTag);

      if (text.trim()) {
        formatted += text.trim();
      }
      i = nextTag === -1 ? normalized.length : nextTag;
    }
  }

  return formatted.trim();
}

// Get Shiki language for format
function getShikiLanguage(format: CodeFormat): "tsx" | "json" | "html" {
  switch (format) {
    case "react-email":
      return "tsx";
    case "json":
      return "json";
    case "html":
      return "html";
  }
}

export function CodeView({ editor }: CodeViewProps) {
  const [format, setFormat] = useState<CodeFormat>("react-email");
  const [code, setCode] = useState<string>("");
  const [highlightedCode, setHighlightedCode] = useState<string>("");
  const [isHighlighting, setIsHighlighting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Generate raw code
  useEffect(() => {
    if (!editor) return;

    const content = editor.getJSON();

    switch (format) {
      case "react-email":
        setCode(generateReactEmailCode(content));
        break;
      case "json":
        setCode(JSON.stringify(content, null, 2));
        break;
      case "html":
        setCode(prettifyHtml(editor.getHTML()));
        break;
    }
  }, [editor?.state.doc, format, editor]);

  // Apply syntax highlighting
  useEffect(() => {
    if (!code) {
      setHighlightedCode("");
      return;
    }

    const highlight = async () => {
      setIsHighlighting(true);
      try {
        const html = await codeToHtml(code, {
          lang: getShikiLanguage(format),
          theme: "github-dark",
        });
        setHighlightedCode(html);
      } catch {
        // Fallback to plain code on error
        setHighlightedCode("");
      } finally {
        setIsHighlighting(false);
      }
    };

    // Debounce highlighting for performance
    const timeoutId = setTimeout(highlight, 100);
    return () => clearTimeout(timeoutId);
  }, [code, format]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Code copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleDownload = () => {
    // Determine file extension based on format
    const extensions: Record<CodeFormat, string> = {
      "react-email": "tsx",
      json: "json",
      html: "html",
    };

    const filename = `email-template.${extensions[format]}`;
    const blob = new Blob([code], { type: "text/plain" });
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

  if (!editor) {
    return null;
  }

  // Format labels for display
  const formatLabels: Record<CodeFormat, string> = {
    "react-email": "React Email",
    json: "JSON",
    html: "HTML",
  };

  return (
    <div className="flex h-full flex-col">
      {/* Controls - Compact Header */}
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
        {/* Left: Current format indicator */}
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <FileCode2 className="h-4 w-4" />
          <span className="hidden sm:inline">{formatLabels[format]}</span>
        </div>

        {/* Right: Controls */}
        <div className="flex items-center gap-1">
          <Select
            onValueChange={(v) => setFormat(v as CodeFormat)}
            value={format}
          >
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="react-email">
                <div className="flex items-center gap-2">
                  <FileCode2 className="h-3.5 w-3.5" />
                  React Email
                </div>
              </SelectItem>
              <SelectItem value="json">
                <div className="flex items-center gap-2">
                  <FileJson className="h-3.5 w-3.5" />
                  JSON
                </div>
              </SelectItem>
              <SelectItem value="html">
                <div className="flex items-center gap-2">
                  <FileCode2 className="h-3.5 w-3.5" />
                  HTML
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          <Button
            className="h-8 w-8 p-0"
            onClick={handleCopy}
            size="sm"
            title={copied ? "Copied!" : "Copy to clipboard"}
            variant={copied ? "secondary" : "ghost"}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>

          <Button
            className="h-8 w-8 p-0"
            onClick={handleDownload}
            size="sm"
            title="Download file"
            variant="ghost"
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Code Display */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {isHighlighting ? (
            <div className="flex items-center justify-center rounded-lg bg-zinc-950 p-8">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : highlightedCode ? (
            <div
              className="shiki-wrapper [&_pre]:!bg-zinc-950 overflow-x-auto rounded-lg [&_code]:font-mono [&_code]:text-sm [&_pre]:p-4"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output is safe
              dangerouslySetInnerHTML={{ __html: highlightedCode }}
            />
          ) : (
            <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 font-mono text-sm text-zinc-100">
              <code>{code}</code>
            </pre>
          )}
        </div>
      </ScrollArea>

      {/* Format Info - Compact */}
      <div className="border-t bg-muted/30 px-3 py-2">
        <p className="text-muted-foreground text-xs">
          {format === "react-email" &&
            "React Email components for use with Wraps SDK"}
          {format === "json" &&
            "TipTap JSON document - can be saved and reloaded"}
          {format === "html" &&
            "Raw HTML - may need email CSS for proper rendering"}
        </p>
      </div>
    </div>
  );
}
