"use client";

import { CodeTabs } from "@/components/ui/shadcn-io/code-tabs";

type CodeBlockProps = {
  code: string;
  title?: string;
  lang?: string;
};

export function CodeBlock({ code, title = "terminal", lang }: CodeBlockProps) {
  const codes = { [title]: code };
  return (
    <CodeTabs className="my-4" codes={codes} copyButton lang={lang ?? "bash"} />
  );
}
