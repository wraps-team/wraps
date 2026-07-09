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
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Shield,
  Zap,
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

const addDomainCommand =
  "npx @wraps.dev/cli email domains add -d yourdomain.com";

const getDkimCommand =
  "npx @wraps.dev/cli email domains get-dkim -d yourdomain.com";

const verifyCommand =
  "npx @wraps.dev/cli email domains verify -d yourdomain.com";

const dkimRecordExample = `# You'll get 3 CNAME records like this:
abc123._domainkey.yourdomain.com → abc123.dkim.amazonses.com
def456._domainkey.yourdomain.com → def456.dkim.amazonses.com
ghi789._domainkey.yourdomain.com → ghi789.dkim.amazonses.com`;

const dmarcRecordExample = `# Add this TXT record to your DNS:
Name:  _dmarc.yourdomain.com
Type:  TXT
Value: v=DMARC1; p=quarantine; sp=quarantine; np=reject; rua=mailto:dmarc@yourdomain.com`;

export default function DomainVerificationPageContent() {
  return (
    <DocsLayout>
      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Guide
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          Domain Verification
        </h1>
        <p className="text-lg text-muted-foreground">
          Set up DKIM, SPF, and DMARC for your domain to improve deliverability
          and protect your sender reputation.
        </p>
        <div className="mt-4 flex items-center gap-4 text-muted-foreground text-sm">
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />4 min read
          </span>
        </div>
      </div>

      {/* Why Verify */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Why Verify Your Domain?</h2>
        <p className="mb-4 text-muted-foreground">
          Email authentication proves to receiving servers that your emails are
          legitimate and haven't been tampered with. If you're new to email
          infrastructure,{" "}
          <a
            className="text-primary hover:underline"
            href="/blog/how-email-works"
          >
            learn how email actually works
          </a>{" "}
          first. Without authentication:
        </p>
        <ul className="mb-4 space-y-2 text-muted-foreground">
          <li className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
            Emails are more likely to land in spam folders
          </li>
          <li className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
            Spammers can spoof your domain to send phishing emails
          </li>
          <li className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
            Your sender reputation can be damaged by abuse
          </li>
        </ul>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <Shield className="h-8 w-8 shrink-0 text-primary" />
              <div>
                <h3 className="font-medium">The Three Pillars of Email Auth</h3>
                <ul className="mt-2 space-y-1 text-muted-foreground text-sm">
                  <li>
                    <strong className="text-foreground">DKIM</strong> — Signs
                    emails cryptographically to prove they weren't modified
                  </li>
                  <li>
                    <strong className="text-foreground">SPF</strong> — Declares
                    which servers can send email for your domain
                  </li>
                  <li>
                    <strong className="text-foreground">DMARC</strong> — Tells
                    receivers what to do with emails that fail DKIM/SPF checks
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Automatic DNS Management */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Zap className="h-6 w-6 text-primary" />
          Automatic DNS Management
        </h2>
        <p className="mb-4 text-muted-foreground">
          The Wraps CLI can automatically create all required DNS records during{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            wraps email init
          </code>{" "}
          if you have the appropriate environment variables set for your DNS
          provider.
        </p>

        <Card className="mb-4">
          <CardContent className="p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">DNS Provider</th>
                  <th className="pb-2 text-left">
                    Required Environment Variable
                  </th>
                  <th className="pb-2 text-left">Optional</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2 font-medium text-foreground">
                    AWS Route53
                  </td>
                  <td className="py-2">
                    <span className="text-muted-foreground/70">
                      (uses AWS credentials)
                    </span>
                  </td>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      AWS_PROFILE
                    </code>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-medium text-foreground">
                    Vercel DNS
                  </td>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      VERCEL_TOKEN
                    </code>
                  </td>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      VERCEL_TEAM_ID
                    </code>
                  </td>
                </tr>
                <tr>
                  <td className="py-2 font-medium text-foreground">
                    Cloudflare
                  </td>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      CLOUDFLARE_API_TOKEN
                    </code>
                  </td>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      CLOUDFLARE_ZONE_ID
                    </code>
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <h3 className="mb-3 font-medium text-lg">Setup Instructions</h3>
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <h4 className="mb-2 font-medium">Vercel DNS</h4>
            <p className="mb-2 text-muted-foreground text-sm">
              Create an API token at{" "}
              <a
                className="font-medium text-primary underline"
                href="https://vercel.com/account/tokens"
                rel="noopener noreferrer"
                target="_blank"
              >
                vercel.com/account/tokens
              </a>
            </p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "bash",
                  filename: "terminal.sh",
                  code: `export VERCEL_TOKEN=your_token_here
# Optional: for team accounts
export VERCEL_TEAM_ID=team_xxxxx`,
                },
              ]}
              defaultValue="bash"
            >
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
          </div>

          <div className="rounded-lg border p-4">
            <h4 className="mb-2 font-medium">Cloudflare</h4>
            <p className="mb-2 text-muted-foreground text-sm">
              Create an API token at{" "}
              <a
                className="font-medium text-primary underline"
                href="https://dash.cloudflare.com/profile/api-tokens"
                rel="noopener noreferrer"
                target="_blank"
              >
                dash.cloudflare.com/profile/api-tokens
              </a>
              . The token needs <strong>Zone.DNS (Edit)</strong> permission.
            </p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "bash",
                  filename: "terminal.sh",
                  code: `export CLOUDFLARE_API_TOKEN=your_token_here
# Optional: auto-detected if not set
export CLOUDFLARE_ZONE_ID=your_zone_id`,
                },
              ]}
              defaultValue="bash"
            >
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
          </div>

          <div className="rounded-lg border p-4">
            <h4 className="mb-2 font-medium">AWS Route53</h4>
            <p className="text-muted-foreground text-sm">
              No additional setup required if you have a hosted zone for your
              domain. The CLI uses your existing AWS credentials.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">Skip manual DNS setup</p>
          <p className="mt-2 text-muted-foreground text-sm">
            With automatic DNS management, you can skip Steps 2-4 below. The CLI
            will create DKIM, SPF, DMARC, and MX records for you during{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              wraps email init
            </code>
            .
          </p>
        </div>
      </section>

      {/* Manual DNS Setup Header */}
      <section className="mb-8">
        <h2 className="mb-2 font-bold text-2xl">Manual DNS Setup</h2>
        <p className="text-muted-foreground">
          If you prefer to add DNS records manually, or your DNS provider isn't
          supported, follow the steps below.
        </p>
      </section>

      {/* Step 1: Add Domain */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            1
          </div>
          Add Your Domain to SES
        </h2>

        <h3 className="mb-3 font-medium text-lg">Using Wraps CLI</h3>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "bash",
              filename: "terminal.sh",
              code: addDomainCommand,
            },
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

        <h3 className="mb-3 font-medium text-lg">Using AWS Console</h3>
        <ol className="mb-4 list-decimal space-y-2 pl-6 text-muted-foreground">
          <li>
            Open the{" "}
            <a
              className="font-medium text-primary underline"
              href="https://console.aws.amazon.com/ses/"
              rel="noopener noreferrer"
              target="_blank"
            >
              Amazon SES console
            </a>
          </li>
          <li>
            Go to <strong className="text-foreground">Identities</strong> →{" "}
            <strong className="text-foreground">Create identity</strong>
          </li>
          <li>
            Select <strong className="text-foreground">Domain</strong> as the
            identity type
          </li>
          <li>Enter your domain name and click Create</li>
        </ol>
        <video
          autoPlay
          className="rounded-lg border"
          loop
          muted
          playsInline
          preload="none"
          src="/docs/ses-create-identity.mp4"
        >
          <track
            kind="descriptions"
            label="Creating a domain identity in SES console"
          />
        </video>
      </section>

      {/* Step 2: DKIM Setup */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            2
          </div>
          Set Up DKIM
        </h2>
        <p className="mb-4 text-muted-foreground">
          After adding your domain, SES generates 3 DKIM tokens. You need to add
          these as CNAME records in your DNS.
        </p>

        <h3 className="mb-3 font-medium text-lg">Get Your DKIM Records</h3>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "bash",
              filename: "terminal.sh",
              code: getDkimCommand,
            },
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

        <p className="mb-4 text-muted-foreground">
          SES will display 3 CNAME records that you need to add to your DNS:
        </p>
        <img
          alt="DKIM records displayed in SES console"
          className="mb-4 rounded-lg border"
          src="/docs/ses-dkim-records.png"
        />

        <h3 className="mb-3 font-medium text-lg">Add Records to Your DNS</h3>
        <p className="mb-4 text-muted-foreground">
          Copy all 3 CNAME records and add them in your DNS provider (Route 53,
          Cloudflare, Namecheap, etc.). The format looks like:
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "text",
              filename: "DKIM Records",
              code: dkimRecordExample,
            },
          ]}
          defaultValue="text"
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
        <img
          alt="Adding CNAME records in DNS provider"
          className="mb-4 rounded-lg border"
          src="/docs/dns-add-cname.png"
        />

        <div className="rounded-lg border-yellow-500 border-l-4 bg-yellow-500/10 p-4">
          <p className="font-medium text-sm">Important: Record Name Format</p>
          <p className="mt-2 text-muted-foreground text-sm">
            Copy the exact record names from SES. Don't add extra underscores or
            modify them. Some DNS providers automatically append your domain, so
            you may only need to enter the part before your domain name.
          </p>
        </div>
      </section>

      {/* Step 3: SPF */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            3
          </div>
          SPF (Automatic)
        </h2>
        <div className="rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">Good news: SPF is automatic!</p>
          <p className="mt-2 text-muted-foreground text-sm">
            When you send through Amazon SES, the MAIL FROM domain is a
            subdomain of{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              amazonses.com
            </code>
            , which already has SPF configured. No additional setup required.
          </p>
        </div>
        <p className="mt-4 text-muted-foreground text-sm">
          If you want to use a custom MAIL FROM domain (advanced), see the{" "}
          <a
            className="font-medium text-primary underline"
            href="https://docs.aws.amazon.com/ses/latest/dg/mail-from.html"
            rel="noopener noreferrer"
            target="_blank"
          >
            AWS documentation
          </a>
          .
        </p>
      </section>

      {/* Step 4: DMARC */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            4
          </div>
          Set Up DMARC
        </h2>
        <p className="mb-4 text-muted-foreground">
          DMARC tells receiving mail servers what to do when emails fail
          authentication checks. SES will prompt you to set up DMARC:
        </p>
        <img
          alt="DMARC setup instructions in SES console"
          className="mb-4 rounded-lg border"
          src="/docs/ses-dmarc-records.png"
        />
        <p className="mb-4 text-muted-foreground">
          Add this TXT record to your DNS:
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "text",
              filename: "DMARC Record",
              code: dmarcRecordExample,
            },
          ]}
          defaultValue="text"
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

        <h3 className="mb-3 font-medium text-lg">DMARC Policy Options</h3>
        <Card className="mb-4">
          <CardContent className="p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Policy</th>
                  <th className="pb-2 text-left">Value</th>
                  <th className="pb-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2 font-medium text-foreground">Monitor</td>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      p=none
                    </code>
                  </td>
                  <td className="py-2">No enforcement, just collect reports</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-medium text-foreground">
                    Quarantine
                  </td>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      p=quarantine
                    </code>
                  </td>
                  <td className="py-2">Send failing emails to spam</td>
                </tr>
                <tr>
                  <td className="py-2 font-medium text-foreground">Reject</td>
                  <td className="py-2">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      p=reject
                    </code>
                  </td>
                  <td className="py-2">Reject failing emails entirely</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
        <div className="rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">
            Recommended: Start with quarantine
          </p>
          <p className="mt-2 text-muted-foreground text-sm">
            Use{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">p=quarantine</code>{" "}
            to start. Once you've confirmed all legitimate emails pass, you can
            upgrade to{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">p=reject</code>.
          </p>
        </div>
      </section>

      {/* Step 5: Verify */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            5
          </div>
          Verify Your Setup
        </h2>
        <p className="mb-4 text-muted-foreground">
          After adding DNS records, verify everything is configured correctly:
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "bash",
              filename: "terminal.sh",
              code: verifyCommand,
            },
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

        <div className="flex items-start gap-4 rounded-lg border p-4">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">DNS propagation takes up to 72 hours</p>
            <p className="mt-1 text-muted-foreground text-sm">
              DKIM verification typically completes within a few hours, but can
              take up to 72 hours for DNS to propagate worldwide.
            </p>
          </div>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Troubleshooting</h2>
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Domain still shows "Pending" after 72 hours
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  Double-check CNAME record names match exactly (no extra
                  underscores)
                </li>
                <li>
                  Some DNS providers auto-append your domain — you may need to
                  remove it from the record name
                </li>
                <li>
                  Try adding a trailing period (.) to the CNAME value for fully
                  qualified domain names
                </li>
                <li>Ensure the underscore (_) is present in record names</li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                DMARC reports show failures
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              <ul className="list-disc space-y-1 pl-4">
                <li>Ensure DKIM records are correctly published</li>
                <li>Check that you're sending from a verified identity</li>
                <li>
                  If using a custom MAIL FROM domain, verify SPF is configured
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Checklist */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Verification Checklist</h2>
        <Card>
          <CardContent className="p-6">
            <ul className="space-y-3">
              <li className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span>Domain added to SES</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span>3 DKIM CNAME records added to DNS</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span>Domain status shows "Verified" in SES</span>
              </li>
              <li className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span>DMARC TXT record added to DNS</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">
                Request Production Access
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Now that your domain is verified, request production access for
                faster approval.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/production-access">
                  Production Access
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Send Your First Email</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Start sending authenticated emails with the Wraps SDK.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/quickstart/email">
                  Email Quickstart
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
