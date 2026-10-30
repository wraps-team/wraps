"use client";

import { useState } from "react";
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
import { cn } from "@/lib/utils";

const jsonPreview = `{
  "emailId": "inb_a1b2c3d4",
  "receivedAt": "2024-01-15T10:30:00Z",
  "from": {
    "address": "customer@example.com",
    "name": "John Doe"
  },
  "to": [
    { "address": "support@yourapp.com" }
  ],
  "subject": "Order #12345 Question",
  "html": "<p>Hi, I have a question...</p>",
  "text": "Hi, I have a question...",
  "attachments": [
    {
      "id": "att_xyz789",
      "filename": "receipt.pdf",
      "contentType": "application/pdf",
      "size": 45678
    }
  ],
  "spamVerdict": "PASS",
  "virusVerdict": "PASS",
  "headers": {
    "message-id": "<abc@mail.example.com>",
    "date": "Mon, 15 Jan 2024 10:30:00 +0000"
  }
}`;

type CodeExamples = Record<
  string,
  {
    label: string;
    filename: string;
    code: string;
  }
>;

export function SdkTabs({ examples }: { examples: CodeExamples }) {
  const exampleKeys = Object.keys(examples) as (keyof typeof examples)[];
  const [activeExample, setActiveExample] = useState<keyof typeof examples>(
    exampleKeys[0]
  );
  const example = examples[activeExample];

  return (
    <>
      {/* Tab buttons */}
      <div className="mb-6 flex flex-wrap gap-2">
        {exampleKeys.map((key) => (
          <button
            className={cn(
              "cursor-pointer rounded-lg px-4 py-2 font-mono text-xs uppercase tracking-widest transition-all",
              activeExample === key
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-card text-muted-foreground hover:text-foreground"
            )}
            key={key}
            onClick={() => setActiveExample(key)}
            type="button"
          >
            {examples[key].label}
          </button>
        ))}
      </div>

      {/* Split view */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Code example */}
        <div>
          <CodeBlock
            className="h-full"
            data={[
              {
                language: "typescript",
                filename: example.filename,
                code: example.code,
              },
            ]}
            defaultValue="typescript"
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
            <CodeBlockBody className="max-h-[400px] overflow-y-auto">
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
        </div>

        {/* JSON preview */}
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-border border-b bg-muted/30 px-4 py-3">
            <span className="font-mono text-muted-foreground text-xs">
              InboundEmail Response
            </span>
            <span className="font-mono text-2xs text-muted-foreground uppercase tracking-eyebrow">
              JSON
            </span>
          </div>
          <pre className="max-h-[400px] overflow-y-auto p-4 font-mono text-foreground/80 text-xs">
            {jsonPreview}
          </pre>
        </div>
      </div>
    </>
  );
}
