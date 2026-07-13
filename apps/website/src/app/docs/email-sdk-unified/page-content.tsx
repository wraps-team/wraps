"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Info } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
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
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*  Page-level language state — one toggle drives every code block on the page */
/* -------------------------------------------------------------------------- */

type Lang = "typescript" | "python";

const LangContext = createContext<{
  lang: Lang;
  setLang: (lang: Lang) => void;
}>({
  lang: "typescript",
  setLang: () => {
    // default no-op; real setter provided by the page component
  },
});

const useLang = () => useContext(LangContext);

const STORAGE_KEY = "wraps-docs-lang";

function LanguageToggle() {
  const { lang, setLang } = useLang();
  const options: { value: Lang; label: string }[] = [
    { value: "typescript", label: "TypeScript" },
    { value: "python", label: "Python" },
  ];
  return (
    <div
      aria-label="SDK language"
      className="inline-flex rounded-lg border bg-muted p-1"
      role="tablist"
    >
      {options.map((opt) => (
        <button
          aria-selected={lang === opt.value}
          className={cn(
            "rounded-md px-4 py-1.5 font-medium text-sm transition-colors",
            lang === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
          key={opt.value}
          onClick={() => setLang(opt.value)}
          role="tab"
          type="button"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A code sample defined in both languages. The active language is controlled by
 * the page-level toggle, so switching one switches all of them at once.
 */
function Sample({
  ts,
  py,
  tsFile = "example.ts",
  pyFile = "example.py",
}: {
  ts: string;
  py: string;
  tsFile?: string;
  pyFile?: string;
}) {
  const { lang, setLang } = useLang();
  const data = [
    { language: "typescript", filename: tsFile, code: ts },
    { language: "python", filename: pyFile, code: py },
  ];
  return (
    <CodeBlock
      className="h-auto"
      data={data}
      onValueChange={(value) => setLang(value as Lang)}
      value={lang}
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

/* -------------------------------------------------------------------------- */
/*  Install commands differ by language                                        */
/* -------------------------------------------------------------------------- */

const tsInstall = {
  npm: "npm install @wraps.dev/email",
  pnpm: "pnpm add @wraps.dev/email",
  yarn: "yarn add @wraps.dev/email",
  bun: "bun add @wraps.dev/email",
};

const pyInstall = {
  pip: "pip install wraps-email",
  uv: "uv add wraps-email",
  poetry: "poetry add wraps-email",
};

function InstallSnippet() {
  const { lang } = useLang();
  const commands = lang === "python" ? pyInstall : tsInstall;
  const managers = Object.keys(commands);
  return (
    <Snippet defaultValue={managers[0]} key={lang}>
      <SnippetHeader>
        <SnippetTabsList>
          {managers.map((m) => (
            <SnippetTabsTrigger key={m} value={m}>
              {m}
            </SnippetTabsTrigger>
          ))}
        </SnippetTabsList>
        <SnippetCopyButton value={Object.values(commands)[0]} />
      </SnippetHeader>
      {Object.entries(commands).map(([key, command]) => (
        <SnippetTabsContent key={key} value={key}>
          {command}
        </SnippetTabsContent>
      ))}
    </Snippet>
  );
}

/* -------------------------------------------------------------------------- */
/*  Samples (both languages, idiomatic)                                        */
/* -------------------------------------------------------------------------- */

const quickStart = {
  ts: `import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

const result = await email.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Hello!</h1>',
});

console.log('Message ID:', result.messageId);`,
  py: `from wraps.email import WrapsEmail

email = WrapsEmail()

result = email.send(
    from_="hello@yourdomain.com",
    to="user@example.com",
    subject="Welcome!",
    html="<h1>Hello!</h1>",
)

print("Message ID:", result.message_id)`,
};

const recipients = {
  ts: `const result = await email.send({
  from: 'newsletter@yourdomain.com',
  to: ['user1@example.com', 'user2@example.com'],
  cc: 'manager@yourdomain.com',
  bcc: ['archive@yourdomain.com'],
  replyTo: 'support@yourdomain.com',
  subject: 'Weekly Newsletter',
  html: "<h1>This week's updates</h1>",
});`,
  py: `result = email.send(
    from_="newsletter@yourdomain.com",
    to=["user1@example.com", "user2@example.com"],
    cc="manager@yourdomain.com",
    bcc=["archive@yourdomain.com"],
    reply_to="support@yourdomain.com",
    subject="Weekly Newsletter",
    html="<h1>This week's updates</h1>",
)`,
};

const attachments = {
  ts: `import { readFileSync } from 'node:fs';

await email.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Your report',
  html: '<p>See attached.</p>',
  attachments: [
    { filename: 'report.csv', content: 'date,sends\\n2026-07-13,42\\n' },
    { filename: 'logo.png', content: readFileSync('logo.png') },
  ],
});`,
  py: `from wraps.email import Attachment

email.send(
    from_="hello@yourdomain.com",
    to="user@example.com",
    subject="Your report",
    html="<p>See attached.</p>",
    attachments=[
        Attachment(filename="report.csv", content="date,sends\\n2026-07-13,42\\n"),
        Attachment(filename="logo.png", content=open("logo.png", "rb").read()),
    ],
)`,
};

const templates = {
  ts: `await email.templates.create({
  name: 'welcome',
  subject: 'Hi {{name}}',
  html: '<h1>Welcome, {{name}}!</h1>',
});

await email.sendTemplate({
  template: 'welcome',
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  data: { name: 'Sam' },
});`,
  py: `email.templates.create(
    name="welcome",
    subject="Hi {{name}}",
    html="<h1>Welcome, {{name}}!</h1>",
)

email.send_template(
    template="welcome",
    from_="hello@yourdomain.com",
    to="user@example.com",
    data={"name": "Sam"},
)`,
};

const suppression = {
  ts: `await email.suppression.add('bad@example.com', 'COMPLAINT');
const entry = await email.suppression.get('bad@example.com');
await email.suppression.list({ reason: 'BOUNCE' });
await email.suppression.remove('bad@example.com');`,
  py: `email.suppression.add("bad@example.com", "COMPLAINT")
entry = email.suppression.get("bad@example.com")
email.suppression.list(reason="BOUNCE")
email.suppression.remove("bad@example.com")`,
};

const errors = {
  ts: `import { SESError, ValidationError } from '@wraps.dev/email';

try {
  await email.send({ from: 'you@x.com', to: 'user@y.com', subject: 'Hi', html: '<p>Hi</p>' });
} catch (err) {
  if (err instanceof ValidationError) {
    console.error('Invalid input:', err.field);
  } else if (err instanceof SESError) {
    console.error(err.code, err.requestId, err.retryable);
  } else {
    throw err;
  }
}`,
  py: `from wraps.email import SESError, ValidationError

try:
    email.send(from_="you@x.com", to="user@y.com", subject="Hi", html="<p>Hi</p>")
except ValidationError as err:
    print("Invalid input:", err.field)
except SESError as err:
    print(err.code, err.request_id, err.retryable)`,
};

function Section({
  title,
  id,
  children,
}: {
  title: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      <h2 className="mb-4 font-bold text-2xl" id={id}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

export default function EmailSDKUnifiedPageContent() {
  const [lang, setLang] = useState<Lang>("typescript");

  // Remember the reader's language choice across pages/visits.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "python" || stored === "typescript") {
      setLang(stored);
    }
  }, []);
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <DocsLayout>
        {/* Header */}
        <div className="mb-8">
          <Badge className="mb-4" variant="outline">
            Prototype · Unified SDK Docs
          </Badge>
          <h1 className="mb-4 font-bold text-4xl tracking-tight">Email SDK</h1>
          <p className="text-lg text-muted-foreground">
            Send email through your Wraps-deployed AWS SES infrastructure. Pick
            your language once — every example on this page follows.
          </p>
        </div>

        {/* Sticky global language toggle */}
        <div className="sticky top-2 z-10 mb-10 flex items-center justify-between gap-4 rounded-xl border bg-background/80 p-3 backdrop-blur">
          <span className="pl-1 text-muted-foreground text-sm">Language</span>
          <LanguageToggle />
        </div>

        <Section id="installation" title="Installation">
          <InstallSnippet />
          <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
            <p className="flex items-center gap-2 font-medium text-sm">
              <Info className="h-4 w-4" />
              One page, both languages
            </p>
            <p className="mt-2 text-muted-foreground text-sm">
              The toggle above controls every code block and the install command
              at once, and your choice is remembered. This is the Stripe-style
              model — shared prose, per-language code.
            </p>
          </div>
        </Section>

        <Section id="quick-start" title="Quick Start">
          <Sample py={quickStart.py} ts={quickStart.ts} />
        </Section>

        <Section id="sending" title="Sending Emails">
          <p className="mb-4 text-muted-foreground">
            Recipient fields accept a single address or a list.
          </p>
          <Sample py={recipients.py} ts={recipients.ts} />
        </Section>

        <Section id="attachments" title="Attachments">
          <p className="mb-4 text-muted-foreground">
            Attachments switch the send to a raw MIME message automatically.
          </p>
          <Sample py={attachments.py} ts={attachments.ts} />
        </Section>

        <Section id="templates" title="Templates">
          <p className="mb-4 text-muted-foreground">
            Manage SES-stored templates and let SES render them at send time.
          </p>
          <Sample py={templates.py} ts={templates.ts} />
        </Section>

        <Section id="suppression" title="Suppression">
          <p className="mb-4 text-muted-foreground">
            The account-level SES suppression list (bounces and complaints).
          </p>
          <Sample py={suppression.py} ts={suppression.ts} />
        </Section>

        <Section id="error-handling" title="Error Handling">
          <p className="mb-4 text-muted-foreground">
            Both SDKs share the same error hierarchy with structured fields.
          </p>
          <Sample py={errors.py} ts={errors.ts} />
        </Section>
      </DocsLayout>
    </LangContext.Provider>
  );
}
