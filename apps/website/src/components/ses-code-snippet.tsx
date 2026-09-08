"use client";

import {
  CodeBlock,
  CodeBlockBody,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockItem,
} from "@/components/ui/shadcn-io/code-block";

/**
 * CodeBlockBody takes a render prop, and a function cannot cross the
 * server/client boundary as a child. The SES error pages are server
 * components, so the render prop has to live inside a client module of its
 * own rather than inline in the article.
 */
export function SesCodeSnippet({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  const data = [{ language, filename: language, code }];
  return (
    <div className="mt-4">
      <CodeBlock data={data} defaultValue={language}>
        <CodeBlockBody>
          {(item) => (
            <CodeBlockItem key={item.language} value={item.language}>
              <CodeBlockContent language={item.language}>
                {item.code}
              </CodeBlockContent>
              <CodeBlockCopyButton />
            </CodeBlockItem>
          )}
        </CodeBlockBody>
      </CodeBlock>
    </div>
  );
}
