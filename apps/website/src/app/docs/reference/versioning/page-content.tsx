"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { CopyForAIButton } from "@/components/docs/copy-for-ai-button";
import { SectionHeading } from "@/components/docs/section-heading";
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

const deprecationHeadersExample = `HTTP/1.1 200 OK
Deprecation: Sat, 01 Aug 2026 00:00:00 GMT
Sunset: Sun, 01 Aug 2027 00:00:00 GMT
Link: <https://wraps.dev/docs/reference/versioning>; rel="deprecation"; type="text/html"
Link: <https://api.wraps.dev/contacts>; rel="successor-version"`;

const BREAKING_CHANGES = [
  "Removing an endpoint, or changing its path or method",
  "Removing a field from a response, or changing its type",
  "Adding a required request field, or making an optional one required",
  "Narrowing an accepted value — tightening a format, dropping an enum member",
  "Changing the status code or error `code` a given failure returns",
  "Changing authentication or the scopes an endpoint requires",
];

const NON_BREAKING_CHANGES = [
  "Adding a new endpoint",
  "Adding an optional request field",
  "Adding a field to a response — always parse responses permissively",
  "Adding a new value to an enum you only read (never one you match exhaustively on)",
  "Adding a response header",
  "Changing the prose of an `error` message, while its `code` stays put",
];

// ============================================================================
// MARKDOWN CONTENT FOR AI COPY
// ============================================================================

const SECTION_MD = {
  versioning: `## How the API is versioned

The Wraps Platform API is versioned in the URL. The current version is served at \`https://api.wraps.dev\` and described by the OpenAPI document at \`https://api.wraps.dev/swagger/json\`, whose \`info.version\` names the version you are reading.

A breaking change ships as a new version at a new path. The old version keeps working for the notice period below — it is never changed underneath you.`,

  breaking: `## What counts as a breaking change

These ship only in a new version:

${BREAKING_CHANGES.map((item) => `- ${item}`).join("\n")}`,

  nonBreaking: `## What does not count as a breaking change

These ship into the current version at any time, so build a client that tolerates them:

${NON_BREAKING_CHANGES.map((item) => `- ${item}`).join("\n")}`,

  signals: `## How a deprecation is signaled

A deprecated endpoint keeps working and starts announcing itself on every response:

| Header | Meaning |
|--------|---------|
| \`Deprecation\` | An HTTP date (RFC 9745). The endpoint is deprecated as of this moment. |
| \`Sunset\` | An HTTP date (RFC 8594). The endpoint stops responding after it. |
| \`Link\` with \`rel="deprecation"\` | This page, explaining the policy. |
| \`Link\` with \`rel="successor-version"\` | What to call instead, when there is a direct replacement. |

\`\`\`
${deprecationHeadersExample}
\`\`\`

The same endpoints are marked \`deprecated: true\` in the OpenAPI document, so a generated client sees it at build time rather than at runtime.`,

  notice: `## Notice periods

| Change | Minimum notice |
|--------|----------------|
| Endpoint or field deprecation | 6 months between the \`Deprecation\` date and the \`Sunset\` date |
| Security fix that must break a contract | As much notice as the vulnerability allows, announced to affected organizations directly |

Deprecations are announced in the [changelog](https://wraps.dev/changelog) and emailed to organization owners. Nothing is removed without a \`Sunset\` date having passed.`,

  clients: `## What an integration should do

- Read \`code\`, not \`error\`, when branching on a failure. The \`code\` values are stable and enumerated in the OpenAPI document; the prose is not.
- Ignore response fields you do not recognize instead of rejecting the response.
- Log the \`Deprecation\` and \`Sunset\` headers if they appear. That is the only signal that arrives before something you depend on stops working.
- Pin the OpenAPI document you generate clients from, and re-generate deliberately.`,
};

const FULL_PAGE_MD = `# API Versioning and Deprecation Policy

How the Wraps Platform API is versioned, what counts as a breaking change, and how deprecations are signaled.

${SECTION_MD.versioning}

${SECTION_MD.breaking}

${SECTION_MD.nonBreaking}

${SECTION_MD.signals}

${SECTION_MD.notice}

${SECTION_MD.clients}
`;

const SLASH_COMMAND_MD = `---
description: Wraps API versioning and deprecation policy - use when planning an integration or handling a Sunset header
---

${FULL_PAGE_MD}`;

// ============================================================================
// PAGE CONTENT
// ============================================================================

function ChangeList({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default function PageContent() {
  return (
    <DocsLayout
      headerActions={
        <CopyForAIButton
          markdown={FULL_PAGE_MD}
          slashCommand={SLASH_COMMAND_MD}
        />
      }
    >
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Reference
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          API Versioning and Deprecation
        </h1>
        <p className="text-lg text-muted-foreground">
          What you can rely on staying put, what can change under you, and how
          much warning you get before anything is removed.
        </p>
      </div>

      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="how-the-api-is-versioned"
          markdown={SECTION_MD.versioning}
          title="How the API is versioned"
        />
        <p className="mb-4 text-muted-foreground">
          The Wraps Platform API is versioned in the URL. The current version is
          served at{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            https://api.wraps.dev
          </code>{" "}
          and described by the{" "}
          <a
            className="text-orange-500 underline underline-offset-4"
            href="https://api.wraps.dev/swagger/json"
            rel="noopener noreferrer"
            target="_blank"
          >
            OpenAPI document
          </a>
          , whose{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            info.version
          </code>{" "}
          names the version you are reading.
        </p>
        <p className="text-muted-foreground">
          A breaking change ships as a new version at a new path. The old
          version keeps working for the notice period below — it is never
          changed underneath you.
        </p>
      </section>

      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="breaking-changes"
          markdown={SECTION_MD.breaking}
          title="What counts as a breaking change"
        />
        <p className="mb-4 text-muted-foreground">
          These ship only in a new version:
        </p>
        <ChangeList items={BREAKING_CHANGES} />
      </section>

      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="non-breaking-changes"
          markdown={SECTION_MD.nonBreaking}
          title="What does not count as a breaking change"
        />
        <p className="mb-4 text-muted-foreground">
          These ship into the current version at any time, so build a client
          that tolerates them:
        </p>
        <ChangeList items={NON_BREAKING_CHANGES} />
      </section>

      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="deprecation-signals"
          markdown={SECTION_MD.signals}
          title="How a deprecation is signaled"
        />
        <p className="mb-4 text-muted-foreground">
          A deprecated endpoint keeps working and starts announcing itself on
          every response.
        </p>

        <Card className="mb-6">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left font-medium">Header</th>
                    <th className="px-4 py-2 text-left font-medium">Meaning</th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        Deprecation
                      </code>
                    </td>
                    <td className="px-4 py-2">
                      An HTTP date (RFC 9745). The endpoint is deprecated as of
                      this moment.
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        Sunset
                      </code>
                    </td>
                    <td className="px-4 py-2">
                      An HTTP date (RFC 8594). The endpoint stops responding
                      after it.
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        Link; rel=&quot;deprecation&quot;
                      </code>
                    </td>
                    <td className="px-4 py-2">
                      This page, explaining the policy.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2">
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        Link; rel=&quot;successor-version&quot;
                      </code>
                    </td>
                    <td className="px-4 py-2">
                      What to call instead, when there is a direct replacement.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "http",
              filename: "response headers",
              code: deprecationHeadersExample,
            },
          ]}
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
          The same endpoints are marked{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            deprecated: true
          </code>{" "}
          in the OpenAPI document, so a generated client sees it at build time
          rather than at runtime.
        </p>
      </section>

      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="notice-periods"
          markdown={SECTION_MD.notice}
          title="Notice periods"
        />
        <Card className="mb-6">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left font-medium">Change</th>
                    <th className="px-4 py-2 text-left font-medium">
                      Minimum notice
                    </th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  <tr className="border-b">
                    <td className="px-4 py-2">Endpoint or field deprecation</td>
                    <td className="px-4 py-2">
                      6 months between the{" "}
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        Deprecation
                      </code>{" "}
                      date and the{" "}
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        Sunset
                      </code>{" "}
                      date
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2">
                      Security fix that must break a contract
                    </td>
                    <td className="px-4 py-2">
                      As much notice as the vulnerability allows, announced to
                      affected organizations directly
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        <p className="text-muted-foreground">
          Deprecations are announced in the{" "}
          <Link
            className="text-orange-500 underline underline-offset-4"
            href="/changelog"
          >
            changelog
          </Link>{" "}
          and emailed to organization owners. Nothing is removed without a{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">Sunset</code>{" "}
          date having passed.
        </p>
      </section>

      <section className="mb-12">
        <SectionHeading
          className="mb-6"
          id="what-clients-should-do"
          markdown={SECTION_MD.clients}
          title="What an integration should do"
        />
        <ul className="list-disc space-y-2 pl-6 text-muted-foreground">
          <li>
            Read{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">code</code>
            , not{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              error
            </code>
            , when branching on a failure. The{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">code</code>{" "}
            values are stable and enumerated in the OpenAPI document; the prose
            is not.
          </li>
          <li>
            Ignore response fields you do not recognize instead of rejecting the
            response.
          </li>
          <li>
            Log the{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              Deprecation
            </code>{" "}
            and{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
              Sunset
            </code>{" "}
            headers if they appear. That is the only signal that arrives before
            something you depend on stops working.
          </li>
          <li>
            Pin the OpenAPI document you generate clients from, and re-generate
            deliberately.
          </li>
        </ul>
      </section>

      <section>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/docs/reference/errors">
              Error codes <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/docs/reference/rate-limits">
              Rate limits <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/docs/reference/api">
              API reference <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </DocsLayout>
  );
}
