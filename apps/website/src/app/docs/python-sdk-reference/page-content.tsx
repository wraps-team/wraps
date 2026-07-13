"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { ArrowRight, Info } from "lucide-react";
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
import {
  Snippet,
  SnippetCopyButton,
  SnippetHeader,
  SnippetTabsContent,
  SnippetTabsList,
  SnippetTabsTrigger,
} from "@/components/ui/shadcn-io/snippet";

const installCommands = {
  pip: "pip install wraps-email",
  uv: "uv add wraps-email",
  poetry: "poetry add wraps-email",
};

const quickStartCode = `from wraps.email import WrapsEmail

email = WrapsEmail()

result = email.send(
    from_="hello@yourdomain.com",
    to="user@example.com",
    subject="Welcome!",
    html="<h1>Hello!</h1>",
)

print("Message ID:", result.message_id)`;

const configCode = `from wraps.email import WrapsEmail

# Default AWS credential chain (env vars, shared config, SSO, OIDC, IMDS)
email = WrapsEmail()

# Explicit region + static credentials
email = WrapsEmail(
    region="us-west-2",
    credentials={
        "access_key_id": "...",
        "secret_access_key": "...",
        "session_token": "...",  # optional
    },
)

# Named AWS profile
email = WrapsEmail(profile="my-profile")

# Assume an IAM role (OIDC / cross-account)
email = WrapsEmail(role_arn="arn:aws:iam::123456789012:role/MyRole")`;

const basicEmailCode = `result = email.send(
    from_="hello@yourdomain.com",
    to="user@example.com",
    subject="Welcome to our app",
    html="<h1>Welcome!</h1><p>Thanks for signing up.</p>",
    text="Welcome! Thanks for signing up.",
)

print("Message ID:", result.message_id)
print("Request ID:", result.request_id)`;

const multipleRecipientsCode = `result = email.send(
    from_="newsletter@yourdomain.com",
    to=["user1@example.com", "user2@example.com"],
    cc="manager@yourdomain.com",
    bcc=["archive@yourdomain.com"],
    reply_to="support@yourdomain.com",
    subject="Weekly Newsletter",
    html="<h1>This week's updates</h1>",
)`;

const tagsCode = `# Add SES tags for tracking and analytics
email.send(
    from_="you@yourdomain.com",
    to="user@example.com",
    subject="Newsletter",
    html="<p>Content</p>",
    tags={"campaign": "newsletter-2026-07", "type": "marketing"},
    configuration_set_name="wraps-email-tracking",  # optional
)`;

const attachmentsCode = `from wraps.email import Attachment

result = email.send(
    from_="hello@yourdomain.com",
    to="user@example.com",
    subject="Your report",
    html="<p>See attached.</p>",
    attachments=[
        Attachment(
            filename="report.csv",
            content="date,sends\\n2026-07-13,42\\n",
            content_type="text/csv",
        ),
        # Binary content works too — pass raw bytes:
        Attachment(filename="logo.png", content=open("logo.png", "rb").read()),
    ],
)`;

const batchCode = `result = email.send_batch(
    [
        {"from_": "you@x.com", "to": "a@y.com", "subject": "Hi", "text": "1"},
        {"from_": "you@x.com", "to": "b@y.com", "subject": "Hi", "text": "2"},
    ],
    max_concurrency=10,
)

print(result.success_count, result.failure_count)

# Results are aligned to input order
for entry in result.results:
    if not entry.success:
        print(entry.index, entry.error_code, entry.error)`;

const templatesCode = `# Create a stored template — rendered server-side by SES at send time
email.templates.create(
    name="welcome",
    subject="Hi {{name}}",
    html="<h1>Welcome, {{name}}!</h1>",
    text="Welcome, {{name}}!",
)

email.templates.get("welcome")                 # -> Template
email.templates.list(page_size=20)             # -> .templates, .next_token
email.templates.update(
    name="welcome", subject="Hey {{name}}", html="<h1>{{name}}</h1>"
)
email.templates.delete("welcome")`;

const sendTemplateCode = `result = email.send_template(
    template="welcome",
    from_="hello@yourdomain.com",
    to="user@example.com",
    data={"name": "Sam"},
)`;

const suppressionCode = `# Account-level SES suppression list (bounces + complaints)
email.suppression.add("bad@example.com", "COMPLAINT")
email.suppression.get("bad@example.com")       # -> SuppressionEntry | None
email.suppression.list(reason="BOUNCE")        # -> .entries, .next_token
email.suppression.remove("bad@example.com")`;

const errorsCode = `from wraps.email import CredentialsError, SESError, ValidationError

try:
    email.send(
        from_="you@x.com", to="user@y.com", subject="Hi", html="<p>Hi</p>"
    )
except ValidationError as err:
    print("Invalid input:", err, err.field)      # caught before any AWS call
except CredentialsError:
    print("No AWS credentials found")
except SESError as err:
    print(err.code, err.request_id, err.retryable, err.status)`;

const typedCode = `from wraps.email import SendEmailResult, WrapsEmail

email = WrapsEmail()

# Explicit signatures + a PEP 561 py.typed marker mean mypy / ty / Pyright
# check your calls, and editors autocomplete every argument.
result: SendEmailResult = email.send(
    from_="you@yourdomain.com",
    to="user@example.com",
    subject="Typed",
    html="<p>Autocomplete + static checks</p>",
)`;

const SECTION_MD = {
  installation: `## Installation

\`\`\`bash
pip install wraps-email
\`\`\`

Or use uv or poetry:
\`\`\`bash
uv add wraps-email
poetry add wraps-email
\`\`\`

Requires Python 3.10+. Import as \`wraps.email\` (the distribution is \`wraps-email\`).`,

  quickStart: `## Quick Start

\`\`\`python
${quickStartCode}
\`\`\``,

  configuration: `## Configuration

Create a \`WrapsEmail\` client. Credentials are resolved from the standard AWS chain unless you override them.

\`\`\`python
${configCode}
\`\`\`

### Constructor options
- \`region\` (default \`us-east-1\`) — AWS region.
- \`credentials\` — static dict \`{"access_key_id", "secret_access_key"}\` (optional \`session_token\`).
- \`role_arn\` — IAM role to assume (OIDC / cross-account).
- \`role_session_name\` (default \`wraps-email-session\`).
- \`profile\` — named AWS profile.
- \`timeout\` (default \`30.0\`) — per-request timeout in seconds.

### Credential resolution order
1. Explicit static \`credentials\`
2. Assume-role via \`role_arn\`
3. Named \`profile\`
4. Default AWS chain (env vars, shared config, SSO, OIDC, IMDS)`,

  sendEmail: `## Sending Emails

\`\`\`python
${basicEmailCode}
\`\`\`

Recipient fields (\`to\`, \`cc\`, \`bcc\`, \`reply_to\`) accept a string, a list, or \`EmailAddress\` objects:

\`\`\`python
${multipleRecipientsCode}
\`\`\`

Add SES tags and a configuration set for tracking:

\`\`\`python
${tagsCode}
\`\`\``,

  attachments: `## Attachments

Passing \`attachments\` switches the send to a raw MIME message automatically. \`content\` is bytes, or a string decoded per \`encoding\` (\`"utf-8"\` or \`"base64"\`); \`content_type\` is guessed from the filename when omitted. Bcc always rides the SES envelope, never the visible headers.

\`\`\`python
${attachmentsCode}
\`\`\``,

  batch: `## Batch Sending

Send many independent messages concurrently. A failed message never aborts the batch; a malformed entry raises before anything is sent. Results are aligned to input order.

\`\`\`python
${batchCode}
\`\`\``,

  templates: `## Templates

Manage SES-stored templates and let SES render them at send time.

\`\`\`python
${templatesCode}
\`\`\`

Send a rendered template:

\`\`\`python
${sendTemplateCode}
\`\`\``,

  suppression: `## Suppression

The account-level SES suppression list (bounces and complaints). \`get()\` returns \`None\` for a clean address.

\`\`\`python
${suppressionCode}
\`\`\``,

  errorHandling: `## Error Handling

All errors subclass \`WrapsEmailError\`. AWS failures carry structured fields so you can branch on the failure mode instead of parsing strings.

\`\`\`python
${errorsCode}
\`\`\`

- \`ValidationError\` — invalid input, caught before any AWS call (\`.field\`).
- \`CredentialsError\` — no AWS credentials resolved.
- \`SESError\` — AWS SES API error (\`.code\`, \`.request_id\`, \`.retryable\`, \`.status\`).`,

  typed: `## Fully Typed

\`\`\`python
${typedCode}
\`\`\`

Every public method has an explicit typed signature, and the package ships a PEP 561 \`py.typed\` marker — so \`mypy\`, \`ty\`, and Pyright check your calls out of the box.`,
};

const FULL_PAGE_MD = `# wraps-email (Python SDK)

Send email through your Wraps-deployed AWS SES infrastructure from Python. Typed, lightweight (built on \`httpx\` + \`botocore\` signing, no \`boto3\`), and BYOC — your AWS account, no vendor lock-in.

${SECTION_MD.installation}

${SECTION_MD.quickStart}

${SECTION_MD.configuration}

${SECTION_MD.sendEmail}

${SECTION_MD.attachments}

${SECTION_MD.batch}

${SECTION_MD.templates}

${SECTION_MD.suppression}

${SECTION_MD.errorHandling}

${SECTION_MD.typed}

## Resources

- PyPI: https://pypi.org/project/wraps-email/
- GitHub: https://github.com/wraps-team/wraps-py
`;

const SLASH_COMMAND_MD = `---
description: Wraps Email Python SDK reference - use this when helping users send emails with wraps-email (from wraps.email import WrapsEmail)
---

${FULL_PAGE_MD}`;

function CodeSample({
  code,
  filename,
  language = "python",
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

export default function PythonSDKReferencePageContent() {
  return (
    <DocsLayout
      headerActions={
        <CopyForAIButton
          markdown={FULL_PAGE_MD}
          slashCommand={SLASH_COMMAND_MD}
        />
      }
    >
      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          SDK Reference
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          Python Email SDK
        </h1>
        <p className="text-lg text-muted-foreground">
          Send email through your Wraps-deployed AWS SES infrastructure from
          Python. Typed, lightweight (built on <code>httpx</code> and{" "}
          <code>botocore</code> signing — no <code>boto3</code>), with a simple
          synchronous API.
        </p>
      </div>

      {/* Installation */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="installation"
          markdown={SECTION_MD.installation}
          title="Installation"
        />
        <Snippet defaultValue="pip">
          <SnippetHeader>
            <SnippetTabsList>
              <SnippetTabsTrigger value="pip">pip</SnippetTabsTrigger>
              <SnippetTabsTrigger value="uv">uv</SnippetTabsTrigger>
              <SnippetTabsTrigger value="poetry">poetry</SnippetTabsTrigger>
            </SnippetTabsList>
            <SnippetCopyButton value={installCommands.pip} />
          </SnippetHeader>
          {Object.entries(installCommands).map(([key, command]) => (
            <SnippetTabsContent key={key} value={key}>
              {command}
            </SnippetTabsContent>
          ))}
        </Snippet>
        <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="flex items-center gap-2 font-medium text-sm">
            <Info className="h-4 w-4" />
            Requires Python 3.10+
          </p>
          <p className="mt-2 text-muted-foreground text-sm">
            The distribution is <code>wraps-email</code>; import it as{" "}
            <code>wraps.email</code>. Use <code>from_</code> for the sender —{" "}
            <code>from</code> is a Python keyword.
          </p>
        </div>
      </section>

      {/* Quick Start */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="quick-start"
          markdown={SECTION_MD.quickStart}
          title="Quick Start"
        />
        <CodeSample code={quickStartCode} filename="example.py" />
      </section>

      {/* Configuration */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="configuration"
          markdown={SECTION_MD.configuration}
          title="Configuration"
        />
        <CodeSample code={configCode} filename="client.py" />
        <p className="mt-4 text-muted-foreground text-sm">
          Credentials resolve in this order: explicit <code>credentials</code> →{" "}
          <code>role_arn</code> → <code>profile</code> → the default AWS chain
          (env vars, shared config, SSO, OIDC, IMDS).
        </p>
      </section>

      {/* Sending Emails */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="sending-emails"
          markdown={SECTION_MD.sendEmail}
          title="Sending Emails"
        />
        <div className="space-y-4">
          <CodeSample code={basicEmailCode} filename="send.py" />
          <CodeSample code={multipleRecipientsCode} filename="recipients.py" />
          <CodeSample code={tagsCode} filename="tags.py" />
        </div>
      </section>

      {/* Attachments */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="attachments"
          markdown={SECTION_MD.attachments}
          title="Attachments"
        />
        <CodeSample code={attachmentsCode} filename="attachments.py" />
      </section>

      {/* Batch Sending */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="batch-sending"
          markdown={SECTION_MD.batch}
          title="Batch Sending"
        />
        <CodeSample code={batchCode} filename="batch.py" />
      </section>

      {/* Templates */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="templates"
          markdown={SECTION_MD.templates}
          title="Templates"
        />
        <div className="space-y-4">
          <CodeSample code={templatesCode} filename="templates.py" />
          <CodeSample code={sendTemplateCode} filename="send_template.py" />
        </div>
      </section>

      {/* Suppression */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="suppression"
          markdown={SECTION_MD.suppression}
          title="Suppression"
        />
        <CodeSample code={suppressionCode} filename="suppression.py" />
      </section>

      {/* Error Handling */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="error-handling"
          markdown={SECTION_MD.errorHandling}
          title="Error Handling"
        />
        <CodeSample code={errorsCode} filename="errors.py" />
      </section>

      {/* Fully Typed */}
      <section className="mb-12">
        <SectionHeading
          className="mb-4"
          id="fully-typed"
          markdown={SECTION_MD.typed}
          title="Fully Typed"
        />
        <CodeSample code={typedCode} filename="typed.py" />
      </section>

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">TypeScript SDK</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                The Node/TypeScript email SDK, with React Email, inbound, and
                event tracking.
              </p>
              <Button asChild variant="outline">
                <a href="/docs/sdk-reference">
                  Email SDK Reference
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </CardContent>
          </Card>
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Domain Verification</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Verify your sending domain with DKIM so mail authenticates at
                Gmail and Yahoo.
              </p>
              <Button asChild variant="outline">
                <a href="/docs/guides/domain-verification">
                  Verify a Domain
                  <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Help */}
      <Card className="bg-muted/50">
        <CardContent className="p-8 text-center">
          <h3 className="mb-2 font-bold text-xl">Need Help?</h3>
          <p className="mb-4 text-muted-foreground">
            Found a bug or have a feature request? Open an issue on GitHub.
          </p>
          <Button asChild>
            <a
              href="https://github.com/wraps-team/wraps-py/issues"
              rel="noopener noreferrer"
              target="_blank"
            >
              Open an Issue
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </DocsLayout>
  );
}
