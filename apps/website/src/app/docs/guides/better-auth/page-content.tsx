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
  Cloud,
  Mail,
  ShieldCheck,
  UserPlus,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { AgentQuickstartPrompt } from "@/components/docs/agent-quickstart-prompt";
import { AwsCredentialsPrereqs } from "@/components/docs/aws-credentials-prereqs";
import { DocsLayout } from "@/components/docs-layout";
import { ToolSignupBox } from "@/components/tool-signup-box";
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
import { guideCta } from "@/lib/tool-cta";

// ── Install ─────────────────────────────────────────────────────────

const installCommands = {
  npm: "npm install @wraps.dev/better-auth @wraps.dev/email",
  pnpm: "pnpm add @wraps.dev/better-auth @wraps.dev/email",
  yarn: "yarn add @wraps.dev/better-auth @wraps.dev/email",
  bun: "bun add @wraps.dev/better-auth @wraps.dev/email",
};

// ── Agent prompt ────────────────────────────────────────────────────

const agentPrompt = `Wire Better Auth's transactional email through my own AWS SES account using the Wraps plugin.

1. Verify AWS credentials with: aws sts get-caller-identity
   If that fails, help me configure credentials before continuing.
2. Ask me for my sending domain, then verify it in SES:
   npx @wraps.dev/cli email domains add -d <domain>
   npx @wraps.dev/cli email domains verify -d <domain>
   Show me the DNS records to add, and re-run verify after I confirm they are in place.
3. Check whether the account is still in the SES sandbox. If it is, tell me — auth emails
   will only reach verified addresses until AWS grants production access.
4. Install the plugin: npm install @wraps.dev/better-auth @wraps.dev/email
5. Add the wraps() plugin to my Better Auth config with only the \`email\` option set
   (no API key), using my domain for \`from\` and my app URL for \`appUrl\`.
6. Wire an onError handler that logs the stage, so a failed send is never silent.
7. Trigger a signup against a verified address and report whether the verification
   email arrived, including the SES messageId.

Full Wraps docs (agent-readable): https://wraps.dev/llms-full.txt`;

// ── Code Examples ───────────────────────────────────────────────────

const verificationCode = `import { betterAuth } from 'better-auth';
import { wraps } from '@wraps.dev/better-auth';

export const auth = betterAuth({
  emailAndPassword: { enabled: true },
  emailVerification: { sendOnSignUp: true },
  plugins: [
    wraps({
      email: {
        from: 'Acme <auth@acme.com>',
        appName: 'Acme',
        appUrl: 'https://app.acme.com',
      },
    }),
  ],
});`;

const sendersCode = `import { wrapsAuthEmails } from '@wraps.dev/better-auth';
import { emailOTP, magicLink, organization } from 'better-auth/plugins';

const emails = wrapsAuthEmails({
  from: 'Acme <auth@acme.com>',
  appName: 'Acme',
  appUrl: 'https://app.acme.com', // builds the invitation link
});

export const auth = betterAuth({
  plugins: [
    magicLink({ sendMagicLink: emails.magicLink }),
    emailOTP({ sendVerificationOTP: emails.otp }),
    organization({ sendInvitationEmail: emails.invitation }),
  ],
});`;

const credentialsCode = `wraps({
  email: {
    from: 'auth@acme.com',
    ses: {
      region: 'us-east-1',
      // OIDC role assumption on Vercel or GitHub Actions
      roleArn: 'arn:aws:iam::123456789012:role/AcmeMail',
    },
  },
});`;

const brandCode = `wraps({
  email: {
    from: 'Acme <auth@acme.com>',
    appName: 'Acme',
    brand: {
      logoUrl: 'https://acme.com/logo.png',
      primaryColor: '#4f46e5',
      supportEmail: 'help@acme.com',
      footerText: 'Acme Inc, 2500 Larimer St, Denver CO',
    },
  },
});`;

const templateOverrideCode = `wraps({
  email: {
    from: 'auth@acme.com',
    templates: {
      verification: ({ user, url, appName }) => ({
        subject: \`Confirm your \${appName} account\`,
        html: renderMyEmail({ user, url }),
        text: \`Confirm your email: \${url}\`,
      }),
    },
  },
});`;

const errorCode = `wraps({
  email: { from: 'auth@acme.com', appName: 'Acme' },
  onError: (error, { stage, user }) => {
    // stage is 'email' | 'contact' | 'event' | 'attribution'
    logger.warn({ err: error, stage, user: user?.email }, 'auth email failed');
  },
});`;

const waitUntilCode = `import { waitUntil } from '@vercel/functions';

wraps({
  apiKey: process.env.WRAPS_API_KEY,
  waitUntil,
});`;

const syncCode = `wraps({
  apiKey: process.env.WRAPS_API_KEY,
  attribution: true, // read utm_source and friends off the signup request

  email: {
    from: 'Acme <auth@acme.com>',
    appName: 'Acme',
  },
});`;

const syncRequestsCode = `POST /v1/contacts/
{
  "externalId": "K3mQx...",      // the better-auth user id
  "email": "ada@example.com",
  "firstName": "Ada",
  "lastName": "Lovelace",
  "emailStatus": "active"
}

POST /v1/events/
{
  "name": "user.signed_up",
  "contactId": "con_...",
  "properties": { "method": "oauth", "provider": "google", "source": "better-auth" }
}`;

const topicsCode = `wraps({
  apiKey: process.env.WRAPS_API_KEY,
  // Only set this when your signup form actually asks for consent.
  topicSlugs: ['product-updates'],
});`;

const optionsCode = `wraps({
  // --- auth emails (no Wraps account required) ---
  email: {
    from: 'Acme <auth@acme.com>',
    appName: 'Acme',
    appUrl: 'https://app.acme.com',
    invitationUrl: ({ id }) => \`https://app.acme.com/join/\${id}\`,
    replyTo: 'support@acme.com',
    configurationSetName: 'acme-auth',
    brand: { logoUrl, primaryColor, supportEmail, footerText },
    templates: { /* per-template overrides */ },
    ses: { /* region, credentials, roleArn, client */ },
  },

  // --- contact sync (needs a Wraps API key) ---
  apiKey: process.env.WRAPS_API_KEY,
  baseUrl: 'https://api.wraps.dev',
  eventName: 'user.signed_up',        // or false to skip the event
  topicSlugs: [],
  emailStatus: 'active',
  attribution: false,                 // true, or { cookieName, fields, fromReferer, parse }
  properties: (user, context) => ({ plan: 'free' }),
  shouldSync: (user, context) => !user.email.endsWith('@internal.acme.com'),
  syncOnUpdate: true,                 // patch the contact on email or name change
  syncOnDelete: false,                // or 'unsubscribe' | 'delete'

  // --- behaviour ---
  waitUntil: (promise) => ctx.waitUntil(promise),
  onContactSynced: ({ userId, contactId, created }) => {},
  onError: (error, { stage }) => logger.warn({ error, stage }),
});`;

const clientCode = `import { createAuthClient } from 'better-auth/client';
import { wrapsClient } from '@wraps.dev/better-auth/client';

export const authClient = createAuthClient({
  plugins: [wrapsClient()],
});`;

function Example({
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

function Code({ children }: { children: string }) {
  return <code className="rounded bg-muted px-1.5 py-0.5">{children}</code>;
}

const senders = [
  {
    name: "verification",
    target: "emailVerification.sendVerificationEmail",
    wiring: "Wired for you",
  },
  {
    name: "resetPassword",
    target: "emailAndPassword.sendResetPassword",
    wiring: "Wired for you",
  },
  {
    name: "passwordChanged",
    target: "emailAndPassword.onPasswordReset",
    wiring: "Wired for you",
  },
  {
    name: "magicLink",
    target: "magicLink({ sendMagicLink })",
    wiring: "Pass it in",
  },
  {
    name: "otp",
    target: "emailOTP({ sendVerificationOTP })",
    wiring: "Pass it in",
  },
  {
    name: "invitation",
    target: "organization({ sendInvitationEmail })",
    wiring: "Pass it in",
  },
];

/*
 * Light and dark renders of the same figure, swapped on the site's `.dark`
 * class — it sits on the page background, so a single dark clip reads as a
 * hole punched in the light theme. The still is a CSS background rather than
 * the `poster` attribute: a poster downloads even when the video is
 * display:none, a background-image does not.
 *
 * Source composition: wraps-private, `BetterAuthFlow` / `BetterAuthFlowLight`.
 */
function FlowVideo({ theme }: { theme: "light" | "dark" }) {
  const suffix = theme === "light" ? "-light" : "";

  return (
    <video
      autoPlay
      className={
        theme === "light"
          ? "size-full bg-cover bg-center object-cover bg-(image:--poster) dark:hidden"
          : "hidden size-full bg-cover bg-center object-cover bg-(image:--poster) dark:block"
      }
      loop
      muted
      playsInline
      preload="metadata"
      src={`/docs/better-auth-flow${suffix}.mp4`}
      style={
        {
          "--poster": `url(/docs/better-auth-flow${suffix}.jpg)`,
        } as React.CSSProperties
      }
    >
      <track
        kind="descriptions"
        label="The wraps plugin added to a Better Auth config, supplying senders for verification, password reset, password changed, magic link, one-time code, and organization invite, which SES in your own AWS account delivers from your verified domain, with an optional branch syncing the signup to Wraps Contacts"
      />
    </video>
  );
}

export default function BetterAuthPageContent() {
  return (
    <DocsLayout>
      {/* Header */}
      <div className="mb-8">
        <Badge className="mb-4" variant="outline">
          Guide
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">Better Auth</h1>
        <p className="text-lg text-muted-foreground">
          <Code>@wraps.dev/better-auth</Code> sends every auth email Better Auth
          leaves to you through SES in your own AWS account, from one plugin
          block: verification, password reset, password changed, magic link,
          OTP, and organization invites. The templates ship with it and carry
          your branding, not ours. Sending runs on your AWS credentials alone,
          so no Wraps account is required.
        </p>
      </div>

      {/*
       * The whole integration in one frame, before the prose starts: readers
       * arriving from better-auth.com's provider list are deciding whether
       * "your own AWS account" means real work, and the figure answers that
       * faster than the config example can. The caption carries the same chain
       * in text, for search engines and for anyone the video never plays for.
       */}
      <figure className="mb-8">
        <div className="aspect-[16/9] overflow-hidden rounded-xl border border-border bg-background">
          <FlowVideo theme="light" />
          <FlowVideo theme="dark" />
        </div>
        <figcaption className="mt-3 text-muted-foreground text-sm">
          One plugin block in <Code>auth.ts</Code> gives Better Auth senders for
          all six auth emails. Each one is delivered by SES in your own AWS
          account, from your verified domain. Syncing the signup to Wraps
          Contacts is optional, and the only part that needs a Wraps API key.
        </figcaption>
      </figure>

      {/* Orientation for readers arriving from better-auth.com */}
      <div className="mb-8 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
        <p className="font-medium text-sm">
          Different from the other providers on that list
        </p>
        <p className="mt-2 text-muted-foreground text-sm">
          Resend and Mailtrap hand you an API key and send from their
          infrastructure. This plugin sends from yours, so the domain, the
          reputation, and the AWS bill stay in your account. Most people reach
          for an API key because setting SES up is the annoying part. The CLI
          below does it for you. The prerequisite is still real: an AWS account
          and a verified domain before the first email leaves. If you do not
          have an AWS account and do not want one, use a hosted API.
        </p>
      </div>

      <AgentQuickstartPrompt prompt={agentPrompt} />

      {/* Before you start */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Prerequisites</h2>
        <AwsCredentialsPrereqs
          extraItems={[
            "Better Auth 1.6 or later already installed and configured",
            "A sending domain verified in SES, with DKIM records published",
            "SES production access on the account, or a plan to request it",
          ]}
        />
        <p className="mb-4 text-muted-foreground">
          If the domain is not verified yet, the CLI does it without a trip
          through the console.
        </p>
        <Example
          code={`npx @wraps.dev/cli email domains add -d acme.com
npx @wraps.dev/cli email domains verify -d acme.com`}
          filename="terminal.sh"
          language="bash"
        />
        <div className="mt-6 rounded-lg border-warning border-l-4 bg-warning/10 p-4">
          <p className="font-medium text-sm">
            A new AWS account cannot send auth emails yet
          </p>
          <p className="mt-2 text-muted-foreground text-sm">
            Every SES account starts in the sandbox, where sends to addresses
            you have not individually verified fail with{" "}
            <Code>MessageRejected: Email address is not verified</Code>. Signup
            verification is the worst case for this, because the recipient is by
            definition a stranger. Request production access before launch. AWS
            usually answers within 24 hours, and the decision is theirs. No
            provider, including Wraps, can grant it for you.{" "}
            <Link
              className="underline underline-offset-4"
              href="/docs/guides/production-access"
            >
              Production access guide
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Installation */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Installation</h2>
        <Snippet defaultValue="npm">
          <SnippetHeader>
            <SnippetTabsList>
              <SnippetTabsTrigger value="npm">npm</SnippetTabsTrigger>
              <SnippetTabsTrigger value="pnpm">pnpm</SnippetTabsTrigger>
              <SnippetTabsTrigger value="yarn">yarn</SnippetTabsTrigger>
              <SnippetTabsTrigger value="bun">bun</SnippetTabsTrigger>
            </SnippetTabsList>
            <SnippetCopyButton value={installCommands.npm} />
          </SnippetHeader>
          {Object.entries(installCommands).map(([key, command]) => (
            <SnippetTabsContent key={key} value={key}>
              {command}
            </SnippetTabsContent>
          ))}
        </Snippet>
        <p className="mt-4 text-muted-foreground">
          <Code>@wraps.dev/email</Code> is an optional peer dependency. The
          plugin imports it lazily, so a project using only contact sync never
          pulls the AWS SDK into its bundle. If you set <Code>email</Code>{" "}
          without installing it, the first send fails at import time and the
          error arrives in <Code>onError</Code>.
        </p>
      </section>

      {/* Verification email */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Mail className="h-6 w-6 text-primary" />
          Send the Verification Email
        </h2>
        <p className="mb-4 text-muted-foreground">
          That is the whole setup. There is no API key in it.
        </p>
        <Example code={verificationCode} filename="auth.ts" />
        <p className="mt-4 text-muted-foreground">
          Three senders are now wired: <Code>sendVerificationEmail</Code>,{" "}
          <Code>sendResetPassword</Code>, and <Code>onPasswordReset</Code>. The
          bundled templates are plain HTML with no React dependency and no Wraps
          branding, so they read as coming from your app.
        </p>
        <div className="mt-6 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">Your config always wins</p>
          <p className="mt-2 text-muted-foreground text-sm">
            Better Auth merges plugin options underneath your own. If you
            already define <Code>sendVerificationEmail</Code>, the plugin leaves
            it alone, because the senders it supplies are defaults that fill
            gaps. It also never sets <Code>emailAndPassword.enabled</Code>, so
            setting <Code>email</Code> cannot switch on password auth for an app
            that did not ask for it.
          </p>
        </div>
      </section>

      {/* Other auth emails */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">The Other Auth Emails</h2>
        <p className="mb-4 text-muted-foreground">
          Magic link, OTP, and organization invites belong to other Better Auth
          plugins, so Wraps cannot reach them from its own config. Build the
          senders once and pass them in.
        </p>
        <Example code={sendersCode} filename="auth.ts" />
        <Card className="mt-6">
          <CardContent className="p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Sender</th>
                  <th className="pb-2 text-left">Plugs into</th>
                  <th className="pb-2 text-left">Setup</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                {senders.map((sender) => (
                  <tr className="border-b last:border-0" key={sender.name}>
                    <td className="py-2 font-medium text-foreground">
                      <Code>{sender.name}</Code>
                    </td>
                    <td className="py-2">
                      <Code>{sender.target}</Code>
                    </td>
                    <td className="py-2">{sender.wiring}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <p className="mt-4 text-muted-foreground">
          Invitations need a link. Set <Code>appUrl</Code> and the plugin builds{" "}
          <Code>/accept-invitation/:id</Code> under it, or set{" "}
          <Code>invitationUrl</Code> to build your own. With neither, the
          invitation is not sent, because an invitation carrying a dead link is
          worse than one that never arrived.
        </p>
      </section>

      {/* AWS credentials */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">AWS Credentials</h2>
        <p className="mb-4 text-muted-foreground">
          Credentials follow the standard <Code>@wraps.dev/email</Code>{" "}
          resolution chain. With nothing set, the AWS chain resolves as usual:
          environment variables, shared config, or an instance role. On Vercel
          or GitHub Actions, assume a role over OIDC instead of storing
          long-lived keys.
        </p>
        <Example code={credentialsCode} filename="auth.ts" />
        <p className="mt-4 text-muted-foreground">
          The{" "}
          <Link
            className="underline underline-offset-4"
            href="/docs/guides/vercel-setup"
          >
            Vercel setup guide
          </Link>{" "}
          covers the trust policy and the IAM permissions the role needs.
        </p>
      </section>

      {/* Branding and templates */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Branding and Templates</h2>
        <p className="mb-4 text-muted-foreground">
          Brand tokens apply to every bundled template, which covers most apps
          without writing any markup.
        </p>
        <Example code={brandCode} filename="auth.ts" />
        <p className="mt-4 mb-4 text-muted-foreground">
          When you want the markup itself, override any template. It receives
          the same inputs the bundled one gets and returns a subject, HTML, and
          text.
        </p>
        <Example code={templateOverrideCode} filename="auth.ts" />
      </section>

      {/* Failure handling */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <ShieldCheck className="h-6 w-6 text-primary" />
          When a Send Fails
        </h2>
        <p className="mb-4 text-muted-foreground">
          Every send is wrapped, so an SES throttle cannot break a signup. That
          protection cuts both ways: a failed send does not surface as a thrown
          error either. Wire <Code>onError</Code> and a dead verification email
          shows up in your logs instead of in a support ticket.
        </p>
        <Example code={errorCode} filename="auth.ts" />
        <p className="mt-4 text-muted-foreground">
          With no handler set, failures go to <Code>console.error</Code> rather
          than being dropped silently.
        </p>
      </section>

      {/* Serverless */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Cloud className="h-6 w-6 text-primary" />
          Serverless and waitUntil
        </h2>
        <p className="mb-4 text-muted-foreground">
          Work is awaited by default, which is the safe choice on Lambda: the
          runtime freezes the moment the handler returns, so fire-and-forget
          background work never happens. Pass <Code>waitUntil</Code> only when
          your platform has a real background primitive.
        </p>
        <Example code={waitUntilCode} filename="auth.ts" />
      </section>

      {/* Troubleshooting */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Wrench className="h-6 w-6 text-primary" />
          Troubleshooting
        </h2>
        <Card>
          <CardContent className="p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Symptom</th>
                  <th className="pb-2 text-left">Cause and fix</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-3 pr-4 font-medium text-foreground">
                    <Code>MessageRejected: Email address is not verified</Code>
                  </td>
                  <td className="py-3">
                    The account is still in the SES sandbox, or the{" "}
                    <Code>from</Code> domain is not verified. Verify the domain,
                    then request production access.
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 pr-4 font-medium text-foreground">
                    Nothing arrives and nothing throws
                  </td>
                  <td className="py-3">
                    Sends never throw into auth. Set <Code>onError</Code>, or
                    read <Code>console.error</Code>. The real reason is already
                    being reported.
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 pr-4 font-medium text-foreground">
                    <Code>
                      Cannot find package &apos;@wraps.dev/email&apos;
                    </Code>
                  </td>
                  <td className="py-3">
                    The email peer dependency is not installed. Add{" "}
                    <Code>@wraps.dev/email</Code>.
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 pr-4 font-medium text-foreground">
                    Invitations never send, <Code>onError</Code> fires with{" "}
                    <Code>stage: &apos;email&apos;</Code>
                  </td>
                  <td className="py-3">
                    No invitation link could be built. Set <Code>appUrl</Code>{" "}
                    or <Code>invitationUrl</Code>.
                  </td>
                </tr>
                <tr className="border-b last:border-0">
                  <td className="py-3 pr-4 font-medium text-foreground">
                    Works locally, silent in production
                  </td>
                  <td className="py-3">
                    A <Code>waitUntil</Code> that is not a real background
                    primitive lets the function freeze mid-write. Remove it and
                    let the plugin await.
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Contact sync */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <UserPlus className="h-6 w-6 text-primary" />
          Sync Signups to Wraps Contacts (Optional)
        </h2>
        <p className="mb-4 text-muted-foreground">
          The second half of the plugin turns a new user into a Wraps contact
          and fires a <Code>user.signed_up</Code> event, so a welcome sequence
          or an onboarding workflow can run off the signup. This half needs a
          Wraps API key. Contacts live in the Wraps database; sending still runs
          through your SES.
        </p>
        <Example code={syncCode} filename="auth.ts" />
        <p className="mt-4 mb-4 text-muted-foreground">
          Two requests go out on user creation.
        </p>
        <Example
          code={syncRequestsCode}
          filename="requests.http"
          language="http"
        />
        <p className="mt-4 text-muted-foreground">
          If the email already belongs to a contact — a newsletter subscriber
          converting, say — that contact is patched instead of failing.{" "}
          <Code>properties.method</Code> records how they signed up:{" "}
          <Code>email</Code>, <Code>oauth</Code>, <Code>passkey</Code>,{" "}
          <Code>magic-link</Code>, or <Code>otp</Code>. Every creation path is
          covered, including OAuth: the plugin hangs off{" "}
          <Code>databaseHooks.user.create.after</Code> rather than
          response-level <Code>after</Code> hooks, which Better Auth skips on
          OAuth redirects.
        </p>

        <h3 className="mt-8 mb-3 font-medium text-lg">Consent and topics</h3>
        <p className="mb-4 text-muted-foreground">
          New contacts are subscribed to no topics by default. A signup is a
          transactional relationship, not marketing consent, and quietly adding
          every new account to a marketing list is how SES reputations get
          damaged.
        </p>
        <Example code={topicsCode} filename="auth.ts" />

        <h3 className="mt-8 mb-3 font-medium text-lg">Client plugin</h3>
        <p className="mb-4 text-muted-foreground">
          Type inference only. Everything happens server-side and your API key
          never reaches the browser.
        </p>
        <Example code={clientCode} filename="auth-client.ts" />
      </section>

      {/* Options */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Options</h2>
        <Example code={optionsCode} filename="auth.ts" />
      </section>

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Verify your domain</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                DKIM, SPF, and DMARC for the domain your auth emails send from.
                Do this before launch, not after the first spam complaint.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/domain-verification">
                  Verify a domain
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Leave the SES sandbox</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                What AWS wants in a production access request, and what gets an
                account denied. Verification emails do not work until this is
                done.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/production-access">
                  Request access
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="mb-8">
        <ToolSignupBox
          cta={guideCta()}
          layout="stacked"
          tool="better-auth-guide"
        />
      </div>

      <Card className="bg-muted/50">
        <CardContent className="p-8 text-center">
          <h3 className="mb-2 font-bold text-xl">Need Help?</h3>
          <p className="mb-4 text-muted-foreground">
            The plugin is MIT licensed and developed in the open. Open an issue
            with your Better Auth version and the <Code>onError</Code> stage you
            saw.
          </p>
          <Button asChild>
            <a
              href="https://github.com/wraps-team/better-auth-wraps/issues"
              rel="noopener noreferrer"
              target="_blank"
            >
              Get Help
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </DocsLayout>
  );
}
