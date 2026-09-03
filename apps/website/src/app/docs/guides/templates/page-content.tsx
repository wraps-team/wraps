"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  ArrowRight,
  Code,
  Eye,
  FileCode,
  FolderTree,
  RefreshCw,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { DocsLayout } from "@/components/docs-layout";
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

function CodeExample({
  code,
  filename,
  language = "typescript",
}: {
  code: string;
  filename: string;
  language?: string;
}) {
  return (
    <CodeBlock
      className="h-auto"
      data={[{ language, filename, code }]}
      defaultValue={language}
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
  );
}

const initCommand = "wraps email templates init";

const scaffoldOutput = `wraps/
├── wraps.config.ts          # Project configuration
├── templates/
│   └── welcome.tsx          # Example template
├── brand.ts                 # Brand kit (colors, fonts, logo)
└── _components/             # Shared components`;

const configCode = `import { defineConfig } from '@wraps.dev/client';

export default defineConfig({
  org: 'your-org-slug',
  from: 'hello@yourdomain.com',
  replyTo: 'support@yourdomain.com',
  region: 'us-east-1',
  templatesDir: './templates',
  workflowsDir: './workflows',
  brandFile: './brand.ts',
  preview: {
    port: 3333,
  },
});`;

const templateCode = `// wraps/templates/welcome.tsx
import { Html, Head, Body, Container, Text, Button } from '@react-email/components';
import { brand } from '../brand';

export const subject = 'Welcome, {{name}}!';
export const emailType = 'transactional';
export const previewText = 'Thanks for signing up';

export default function WelcomeEmail(props: {
  name: string;
  dashboardUrl: string;
}) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: brand.fonts.body }}>
        <Container>
          <Text>Hi {props.name},</Text>
          <Text>Welcome to our platform!</Text>
          <Button
            href={props.dashboardUrl}
            style={{ backgroundColor: brand.colors.primary }}
          >
            Go to Dashboard
          </Button>
        </Container>
      </Body>
    </Html>
  );
}`;

const previewCommand = `wraps email templates preview
# Opens http://localhost:3333 with hot-reload`;

const pushCommands = `# Push all changed templates
wraps email templates push

# Push specific template
wraps email templates push --template welcome

# Force push (overwrite dashboard changes)
wraps email templates push --force

# Dry run (see what would change)
wraps email templates push --dry-run`;

const sendCode = `import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

await email.sendTemplate({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  template: 'welcome',
  templateData: {
    name: 'Alice',
    dashboardUrl: 'https://app.example.com',
  },
});`;

export default function TemplatesPageContent() {
  return (
    <DocsLayout>
      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Guide
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          Templates as Code
        </h1>
        <p className="text-lg text-muted-foreground">
          Write email templates as React components using React Email, preview
          them with hot-reload, and push to both SES and the Wraps dashboard.
        </p>
      </div>

      {/* Getting Started */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <FileCode className="h-6 w-6 text-primary" />
          Getting Started
        </h2>
        <p className="mb-4 text-muted-foreground">
          Initialize a templates directory in your project with the scaffold
          command:
        </p>
        <CodeExample
          code={initCommand}
          filename="terminal.sh"
          language="bash"
        />

        <p className="mt-4 mb-4 text-muted-foreground">
          This creates the following structure:
        </p>
        <CodeExample
          code={scaffoldOutput}
          filename="Project Structure"
          language="text"
        />

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderTree className="h-4 w-4 text-primary" />
                templates/
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Each file is a React component that renders to an email. Exported
              metadata like{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">subject</code>{" "}
              and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">emailType</code>{" "}
              are used by the platform.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Code className="h-4 w-4 text-primary" />
                brand.ts
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              A shared brand kit for colors, fonts, and logos. Import it in your
              templates to keep a consistent look across all emails.
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Configuration */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Configuration</h2>
        <p className="mb-4 text-muted-foreground">
          The{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            wraps.config.ts
          </code>{" "}
          file defines your project settings, including default sender
          addresses, template directories, and preview server options.
        </p>
        <CodeExample
          code={configCode}
          filename="wraps.config.ts"
          language="typescript"
        />
      </section>

      {/* Writing Templates */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Code className="h-6 w-6 text-primary" />
          Writing Templates
        </h2>
        <p className="mb-4 text-muted-foreground">
          Templates are standard React components built with{" "}
          <a
            className="font-medium text-primary underline"
            href="https://react.email"
            rel="noopener noreferrer"
            target="_blank"
          >
            React Email
          </a>{" "}
          components. Each template file exports the component as default, along
          with metadata exports for the subject line, email type, and preview
          text.
        </p>
        <CodeExample
          code={templateCode}
          filename="wraps/templates/welcome.tsx"
          language="tsx"
        />

        <div className="mt-4">
          <h3 className="mb-3 font-medium text-lg">Template exports:</h3>
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 pr-4 text-left font-medium">Export</th>
                  <th className="pb-2 pr-4 text-left font-medium">Type</th>
                  <th className="pb-2 text-left font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2 pr-4 font-medium text-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      default
                    </code>
                  </td>
                  <td className="py-2 pr-4">React Component</td>
                  <td className="py-2">
                    The email template component (required)
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4 font-medium text-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      subject
                    </code>
                  </td>
                  <td className="py-2 pr-4">string</td>
                  <td className="py-2">
                    Subject line with {"{{variable}}"} interpolation
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-4 font-medium text-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      emailType
                    </code>
                  </td>
                  <td className="py-2 pr-4">string</td>
                  <td className="py-2">"transactional" or "marketing"</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-medium text-foreground">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      previewText
                    </code>
                  </td>
                  <td className="py-2 pr-4">string</td>
                  <td className="py-2">
                    Preview text shown in email clients (optional)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Preview */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Eye className="h-6 w-6 text-primary" />
          Preview
        </h2>
        <p className="mb-4 text-muted-foreground">
          Start the local preview server to see your templates rendered in the
          browser with hot-reload. Changes to your template files are reflected
          instantly.
        </p>
        <CodeExample
          code={previewCommand}
          filename="terminal.sh"
          language="bash"
        />
        <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">Hot-reload enabled</p>
          <p className="mt-1 text-muted-foreground text-sm">
            The preview server watches for file changes and automatically
            reloads. You can also switch between templates and test different
            prop values in the preview UI.
          </p>
        </div>
      </section>

      {/* Push to SES + Dashboard */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Upload className="h-6 w-6 text-primary" />
          Push to SES + Dashboard
        </h2>
        <p className="mb-4 text-muted-foreground">
          Push your templates to both AWS SES (as SES templates) and the Wraps
          dashboard (for visual editing and analytics). Only modified templates
          are pushed by default.
        </p>
        <CodeExample
          code={pushCommands}
          filename="terminal.sh"
          language="bash"
        />

        <div className="mt-4">
          <h3 className="mb-3 flex items-center gap-2 font-medium text-lg">
            <RefreshCw className="h-5 w-5 text-primary" />
            Change Detection
          </h3>
          <p className="text-muted-foreground">
            Wraps uses a lockfile (
            <code className="rounded bg-muted px-1.5 py-0.5">
              wraps/.wraps-lock.json
            </code>
            ) to track which templates have been pushed and their content
            hashes. Only modified templates are pushed on subsequent runs. Use{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">--force</code> to
            re-push all templates regardless of changes.
          </p>
        </div>
      </section>

      {/* Sending with Templates */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Sending with Templates</h2>
        <p className="mb-4 text-muted-foreground">
          Once a template is pushed, you can send emails using the template name
          and pass in dynamic data through the SDK:
        </p>
        <CodeExample code={sendCode} filename="send.ts" language="typescript" />
        <p className="mt-4 text-muted-foreground text-sm">
          The template data is merged with the template at send time. Variable
          placeholders in the subject line (like{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">{"{{name}}"}</code>)
          are also replaced.
        </p>
      </section>

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Building Workflows</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Create automated email sequences using the Wraps workflow DSL.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/workflows">
                  Workflow Guide
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">
                Sharing Templates With Marketing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                What happens when somebody edits a template in the dashboard
                after you pushed it, and how to split copy from structure.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/template-handoff">
                  Handoff Guide
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Email SDK</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Full SDK reference for sending emails programmatically.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/sdk-reference">
                  SDK Reference
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </DocsLayout>
  );
}
