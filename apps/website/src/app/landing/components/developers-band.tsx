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
import { SectionKicker } from "./section-kicker";

const DEPLOY = [
  {
    language: "bash",
    filename: "Deploy",
    code: "npx @wraps.dev/cli email init",
  },
];

const SEND = [
  {
    language: "typescript",
    filename: "Send from your app",
    code: `import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

await email.send({
  from: 'you@company.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Hello World</h1>',
});`,
  },
];

const LINKS = [
  { label: "Quickstart", href: "/docs/quickstart" },
  { label: "SDKs", href: "/sdk" },
  { label: "CLI", href: "/cli" },
  { label: "MCP server", href: "/mcp" },
  { label: "CDK", href: "/docs/cdk-reference" },
  { label: "Pulumi", href: "/docs/pulumi-reference" },
];

function Snippet({
  data,
  lineNumbers = false,
}: {
  data: typeof DEPLOY | typeof SEND;
  lineNumbers?: boolean;
}) {
  return (
    <CodeBlock data={data} defaultValue={data[0].language}>
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
            lineNumbers={lineNumbers}
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

/** The dark band for developers: the ink surface (terminal tokens) in both themes. */
export function DevelopersBand() {
  return (
    <section className="dark border-terminal-border border-y bg-terminal py-16 text-terminal-foreground md:py-20">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:px-8">
        <div>
          <SectionKicker>For developers</SectionKicker>
          <h2 className="text-balance font-heading font-semibold text-3xl text-terminal-foreground leading-tight tracking-tight md:text-4xl">
            A full platform for your team. Full control for you.
          </h2>
          <p className="mt-4 max-w-[56ch] text-pretty text-lg text-terminal-muted leading-relaxed">
            Wraps deploys into your AWS account with the CLI, or with CDK and
            Pulumi if you already manage infrastructure in code. Your app sends
            through Amazon directly with a typed SDK, so mail keeps flowing even
            if Wraps is offline.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2.5">
            {LINKS.map((link) => (
              <li key={link.href}>
                <a
                  className="inline-block border border-terminal-border px-3.5 py-1.5 text-sm text-terminal-foreground hover:border-terminal-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                  href={link.href}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid min-w-0 gap-4">
          <Snippet data={DEPLOY} />
          <Snippet data={SEND} />
        </div>
      </div>
    </section>
  );
}
