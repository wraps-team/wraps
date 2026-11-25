"use client";

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

const files = [
  {
    language: "bash",
    filename: "deploy",
    code: "npx @wraps.dev/cli sms init",
  },
  {
    language: "typescript",
    filename: "send.ts",
    code: `import { WrapsSMS } from "@wraps.dev/sms";

const sms = new WrapsSMS();

// Skip numbers that texted STOP
if (!(await sms.optOuts.check("+14155551234"))) {
  await sms.send({
    to: "+14155551234",
    message: "Your code is 123456",
  });
}`,
  },
];

/** The deploy command and one SDK call, in the shared CodeBlock. */
export function SmsCode() {
  return (
    <CodeBlock className="h-auto" data={files} defaultValue="bash">
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
  );
}
