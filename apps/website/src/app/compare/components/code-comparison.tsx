"use client";

import { Card, CardContent } from "@wraps/ui/components/ui/card";
import {
  CodeBlock,
  CodeBlockBody,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockFiles,
  CodeBlockHeader,
  CodeBlockItem,
} from "@/components/ui/shadcn-io/code-block";

type CodeSide = {
  label: string;
  filename: string;
  language: string;
  code: string;
  highlight?: boolean;
};

/**
 * Side-by-side "Before / After" code comparison using CodeBlock.
 * Used across compare pages for SDK migration examples.
 */
export function CodeComparison({
  before,
  after,
}: {
  before: CodeSide;
  after: CodeSide;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardContent>
          <p className="mb-3 font-mono text-2xs text-muted-foreground uppercase tracking-widest">
            {before.label}
          </p>
          <CodeBlock
            className="h-auto"
            data={[
              {
                language: before.language,
                filename: before.filename,
                code: before.code,
              },
            ]}
            defaultValue={before.language}
          >
            <CodeBlockHeader>
              <CodeBlockFiles>
                {(item) => (
                  <CodeBlockFilename key={item.language} value={item.language}>
                    {item.filename}
                  </CodeBlockFilename>
                )}
              </CodeBlockFiles>
              <CodeBlockCopyButton />
            </CodeBlockHeader>
            <CodeBlockBody>
              {(item) => (
                <CodeBlockItem
                  key={item.language}
                  lineNumbers={false}
                  value={item.language}
                >
                  <CodeBlockContent language={item.language}>
                    {item.code}
                  </CodeBlockContent>
                </CodeBlockItem>
              )}
            </CodeBlockBody>
          </CodeBlock>
        </CardContent>
      </Card>
      <Card className={after.highlight ? "border-brand/40" : undefined}>
        <CardContent>
          <p
            className={`mb-3 font-mono text-2xs uppercase tracking-widest ${after.highlight ? "text-brand-text" : "text-muted-foreground"}`}
          >
            {after.label}
          </p>
          <CodeBlock
            className="h-auto"
            data={[
              {
                language: after.language,
                filename: after.filename,
                code: after.code,
              },
            ]}
            defaultValue={after.language}
          >
            <CodeBlockHeader>
              <CodeBlockFiles>
                {(item) => (
                  <CodeBlockFilename key={item.language} value={item.language}>
                    {item.filename}
                  </CodeBlockFilename>
                )}
              </CodeBlockFiles>
              <CodeBlockCopyButton />
            </CodeBlockHeader>
            <CodeBlockBody>
              {(item) => (
                <CodeBlockItem
                  key={item.language}
                  lineNumbers={false}
                  value={item.language}
                >
                  <CodeBlockContent language={item.language}>
                    {item.code}
                  </CodeBlockContent>
                </CodeBlockItem>
              )}
            </CodeBlockBody>
          </CodeBlock>
        </CardContent>
      </Card>
    </div>
  );
}
