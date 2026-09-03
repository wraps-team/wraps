"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
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

const structureCode = `// The split that makes this work: structure is code, copy is data.
//
// Engineers own the layout, the components, and the variable contract.
// Marketing owns the words that go in the slots.

import { Button, Heading, Section, Text } from "@react-email/components";

type Props = {
  firstName: string;
  // Every string marketing is allowed to change is a prop with a default.
  // The default is what ships if nobody touches it.
  headline?: string;
  body?: string;
  ctaLabel?: string;
};

export default function Welcome({
  firstName,
  headline = "Welcome aboard",
  body = "Your account is ready. Here is how to get started.",
  ctaLabel = "Open the dashboard",
}: Props) {
  return (
    <Section>
      <Heading>{headline}</Heading>
      <Text>Hi {firstName},</Text>
      <Text>{body}</Text>
      <Button href="https://app.example.com">{ctaLabel}</Button>
    </Section>
  );
}`;

const pushCode = `# See what would change before anything moves
wraps email templates push --dry-run

# Push everything that changed since the last push
wraps email templates push

# Push one template
wraps email templates push --template welcome

# Overwrite a template that was edited on the dashboard.
# This discards the dashboard version. There is no undo.
wraps email templates push --template welcome --force`;

const conflictCode = `$ wraps email templates push

  ✔ Synced 4 templates to dashboard
  ✖ welcome was edited on the dashboard. Use --force to overwrite.

# The push did not fail. Four templates went out and one was refused,
# because somebody changed it in the dashboard after your last push and
# the CLI will not silently throw that away.`;

export default function TemplateHandoffPageContent() {
  return (
    <DocsLayout>
      <div className="mb-10">
        <Badge className="mb-3" variant="outline">
          Guide
        </Badge>
        <h1 className="mb-4 font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
          Sharing templates with marketing
        </h1>
        <p className="text-lg text-muted-foreground">
          Engineers keep templates in git. Marketing wants to change the subject
          line without opening a pull request. Both are reasonable, and the
          place they meet is a field called <code>lastEditedFrom</code>.
        </p>
      </div>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          Separate structure from copy
        </h2>
        <p className="mb-4 text-muted-foreground">
          Do this first and most of the process problem disappears. A template
          where every editable string is a prop with a sensible default gives
          marketing real room to work without letting a copy change break the
          layout or drop a variable the send depends on.
        </p>
        <CodeBlock
          className="mb-6 h-auto"
          data={[
            {
              language: "typescript",
              filename: "emails/welcome.tsx",
              code: structureCode,
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
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          Who edits where
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="py-3 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Change
                </th>
                <th className="py-3 pr-4 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Where
                </th>
                <th className="py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">
                  Review
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-border/60 border-b align-top">
                <td className="py-3 pr-4">Layout, components, new variables</td>
                <td className="py-3 pr-4 text-muted-foreground">
                  Repo, then <code>push</code>
                </td>
                <td className="py-3 text-muted-foreground">Pull request</td>
              </tr>
              <tr className="border-border/60 border-b align-top">
                <td className="py-3 pr-4">Subject line, headline, body copy</td>
                <td className="py-3 pr-4 text-muted-foreground">Dashboard</td>
                <td className="py-3 text-muted-foreground">
                  Preview and a test send
                </td>
              </tr>
              <tr className="border-border/60 border-b align-top">
                <td className="py-3 pr-4">Anything sent to every customer</td>
                <td className="py-3 pr-4 text-muted-foreground">
                  Either, then a test send
                </td>
                <td className="py-3 text-muted-foreground">
                  A second person looks at it
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          How the two sides notice each other
        </h2>
        <p className="mb-4 text-muted-foreground">
          Every template records where it was last edited, as either{" "}
          <code>cli</code> or <code>dashboard</code>. The CLI also keeps a hash
          of the source it last pushed. Between them, a push knows three things:
          whether your local file changed, whether the template still exists
          remotely, and whether somebody edited it in the dashboard since you
          last pushed.
        </p>
        <CodeBlock
          className="mb-6 h-auto"
          data={[{ language: "bash", filename: "terminal", code: pushCode }]}
          defaultValue="bash"
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
        <p className="mb-4 text-muted-foreground">
          When marketing has edited a template and you push over it, the push
          does not fail. It syncs everything else and refuses that one:
        </p>
        <CodeBlock
          className="mb-6 h-auto"
          data={[
            { language: "bash", filename: "terminal", code: conflictCode },
          ]}
          defaultValue="bash"
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
        <p className="text-muted-foreground">
          Workflows behave the same way. A workflow last edited in the dashboard
          refuses a CLI push unless you pass <code>--force</code>.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          The limit worth planning around
        </h2>
        <Card className="border-yellow-500/40 bg-yellow-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-yellow-600 dark:text-yellow-500" />
              There is no <code>templates pull</code>
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            <p className="mb-3">
              The CLI pushes. It does not pull a dashboard edit back down into
              your repo. So when marketing changes copy in the dashboard, that
              change lives only in the dashboard, and your next{" "}
              <code>--force</code> push overwrites it silently.
            </p>
            <p>
              The conflict message is doing real work here: it is the signal to
              go copy the dashboard version into the template before you force.
              Treat a 409 as a task, not an obstacle.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
          A workflow that holds up
        </h2>
        <ul className="grid gap-3 text-muted-foreground">
          <li className="flex gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
            Engineers push from CI on merge to main, never from a laptop. The
            repo is then the only thing that can introduce a structural change.
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
            Marketing edits copy in the dashboard and sends themselves a test
            before anything goes out.
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
            When CI reports a conflict, whoever owns the template copies the
            dashboard wording into the repo, opens a small pull request, and
            pushes with <code>--force</code> after it merges. The repo becomes
            true again.
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
            Run <code>--dry-run</code> in CI on pull requests so a reviewer can
            see which templates a merge would touch.
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border bg-muted/30 p-6">
        <h2 className="mb-2 font-heading font-semibold text-xl tracking-tight">
          Next steps
        </h2>
        <p className="mb-5 text-muted-foreground">
          The templates guide covers authoring and the push mechanics in full.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/docs/guides/templates">
              Templates as code
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/for/marketing">Wraps for marketing teams</Link>
          </Button>
        </div>
      </section>
    </DocsLayout>
  );
}
