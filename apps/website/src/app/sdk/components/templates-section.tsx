import { ArrowRight } from "lucide-react";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import {
  CodeBlock,
  CodeBlockBody,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockFiles,
  CodeBlockHeader,
  CodeBlockItem,
  CodeBlockSelect,
  CodeBlockSelectContent,
  CodeBlockSelectItem,
  CodeBlockSelectTrigger,
  CodeBlockSelectValue,
} from "@/components/ui/shadcn-io/code-block";

const templateCode = `import { Body, Container, Heading, Text, Button } from "@react-email/components";

export const subject = "Welcome to {{companyName}}";
export const emailType = "transactional" as const;

type Props = {
  name: string;
  companyName: string;
  loginUrl: string;
};

export default function WelcomeEmail({ name, companyName, loginUrl }: Props) {
  return (
    <Body>
      <Container>
        <Heading>Welcome, {name}</Heading>
        <Text>Thanks for joining {companyName}.</Text>
        <Button href={loginUrl}>Get Started</Button>
      </Container>
    </Body>
  );
}`;

const configCode = `import { defineConfig } from "@wraps.dev/client";

export default defineConfig({
  org: "acme",
  from: { email: "hello@acme.com", name: "Acme" },
  region: "us-east-1",
  templatesDir: "./templates",
  brandFile: "./brand.ts",
});`;

const pushCode = `$ wraps email templates push

  Push Templates

  ◆  Found 3 templates in ./wraps/templates
  │
  ◇  Compiled welcome-email (2 variables)
  ◇  Compiled order-confirmation (5 variables)
  ◇  Compiled password-reset (1 variable)
  │
  ◆  Pushed 3 templates to SES`;

const codeData = [
  {
    language: "tsx",
    filename: "wraps/templates/welcome.tsx",
    code: templateCode,
  },
  { language: "ts", filename: "wraps/wraps.config.ts", code: configCode },
  { language: "bash", filename: "Terminal", code: pushCode },
];

export function SdkTemplatesSection() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-14">
          <SectionKicker>Define</SectionKicker>
          <h2 className="font-heading font-semibold text-2xl tracking-tight sm:text-3xl">
            Templates as Code
          </h2>
        </div>

        <div className="grid items-start gap-12 lg:grid-cols-2">
          <div className="space-y-6">
            <p className="text-lg text-muted-foreground">
              Write email templates as React components. Type-safe variables,
              version-controlled, reviewed in PRs. Push to SES with one command.
            </p>

            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div
                  aria-hidden="true"
                  className="mt-2 h-px w-3 shrink-0 bg-brand"
                />
                <p className="text-sm">
                  <span className="font-medium">React Email components</span>
                  <span className="text-muted-foreground">
                    {" "}
                    &mdash; renders correctly in Gmail, Outlook, Apple Mail
                  </span>
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div
                  aria-hidden="true"
                  className="mt-2 h-px w-3 shrink-0 bg-brand"
                />
                <p className="text-sm">
                  <span className="font-medium">Typed variables</span>
                  <span className="text-muted-foreground">
                    {" "}
                    &mdash; catch missing data at compile time, not in
                    production
                  </span>
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div
                  aria-hidden="true"
                  className="mt-2 h-px w-3 shrink-0 bg-brand"
                />
                <p className="text-sm">
                  <span className="font-medium">
                    <code className="font-mono text-xs">
                      wraps email templates push
                    </code>
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    &mdash; compiles, validates, and deploys to SES (shortcut:{" "}
                    <code className="font-mono text-xs">wraps push</code>)
                  </span>
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div
                  aria-hidden="true"
                  className="mt-2 h-px w-3 shrink-0 bg-brand"
                />
                <p className="text-sm">
                  <span className="font-medium">Brand kits</span>
                  <span className="text-muted-foreground">
                    {" "}
                    &mdash; shared colors, fonts, and logo across all templates
                  </span>
                </p>
              </div>
            </div>

            <a
              className="inline-flex items-center gap-1 font-medium text-brand-text text-sm hover:text-brand-text"
              href="/docs/guides/templates"
            >
              Template guide
              <ArrowRight className="size-3" />
            </a>
          </div>

          <div>
            <CodeBlock data={codeData} defaultValue="tsx">
              <CodeBlockHeader>
                <CodeBlockFiles>
                  {(item) => (
                    <CodeBlockFilename
                      key={item.language}
                      value={item.language}
                    >
                      {item.filename}
                    </CodeBlockFilename>
                  )}
                </CodeBlockFiles>
                <CodeBlockSelect>
                  <CodeBlockSelectTrigger>
                    <CodeBlockSelectValue />
                  </CodeBlockSelectTrigger>
                  <CodeBlockSelectContent>
                    {(item) => (
                      <CodeBlockSelectItem
                        key={item.language}
                        value={item.language}
                      >
                        {item.filename}
                      </CodeBlockSelectItem>
                    )}
                  </CodeBlockSelectContent>
                </CodeBlockSelect>
                <CodeBlockCopyButton />
              </CodeBlockHeader>
              <CodeBlockBody>
                {(item) => (
                  <CodeBlockItem key={item.language} value={item.language}>
                    <CodeBlockContent
                      language={
                        item.language === "tsx"
                          ? "tsx"
                          : item.language === "bash"
                            ? "bash"
                            : "typescript"
                      }
                    >
                      {item.code}
                    </CodeBlockContent>
                  </CodeBlockItem>
                )}
              </CodeBlockBody>
            </CodeBlock>
          </div>
        </div>
      </div>
    </section>
  );
}
