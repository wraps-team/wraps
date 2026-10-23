"use client";

import { CodeTabs } from "@/components/ui/shadcn-io/code-tabs";

type CodeBlockProps = {
  code: string;
  title?: string;
  lang?: string;
};

function detectLanguage(code: string, title: string): string {
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes("terminal") || lowerTitle === "code") {
    return "bash";
  }
  if (lowerTitle.includes("json") || code.trim().startsWith("{")) {
    return "json";
  }
  if (
    code.includes("import ") ||
    code.includes("export ") ||
    code.includes("const ")
  ) {
    return "typescript";
  }
  return "bash";
}

export function CodeBlock({ code, title = "code", lang }: CodeBlockProps) {
  const detectedLang = lang ?? detectLanguage(code, title);
  const codes = { [title]: code };
  return (
    <CodeTabs className="my-4" codes={codes} copyButton lang={detectedLang} />
  );
}
