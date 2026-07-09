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
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Key,
  RefreshCw,
  Shield,
} from "lucide-react";
import Link from "next/link";
import { CLICommand } from "@/components/docs/cli-command";
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

const envVarsExample = `WRAPS_AWS_ROLE_ARN=arn:aws:iam::123456789012:role/wraps-email-role
WRAPS_AWS_REGION=us-east-1`;

const dkimRecordsExample = `# Add these 3 CNAME records to your DNS:
abc123._domainkey.yourdomain.com → abc123.dkim.amazonses.com
def456._domainkey.yourdomain.com → def456.dkim.amazonses.com
ghi789._domainkey.yourdomain.com → ghi789.dkim.amazonses.com`;

const spfRecordExample = `# Add this TXT record:
Name:  yourdomain.com
Type:  TXT
Value: v=spf1 include:amazonses.com ~all`;

const dmarcRecordExample = `# Add this TXT record:
Name:  _dmarc.yourdomain.com
Type:  TXT
Value: v=DMARC1; p=quarantine; sp=quarantine; np=reject; rua=mailto:dmarc@yourdomain.com`;

export default function VercelSetupPageContent() {
  return (
    <DocsLayout>
      {/* Back Link */}
      <div className="mb-8">
        <Button asChild className="gap-2" variant="ghost">
          <Link href="/docs/guides">
            <ArrowLeft className="h-4 w-4" />
            Back to Guides
          </Link>
        </Button>
      </div>

      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Guide
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">Vercel Setup</h1>
        <p className="text-lg text-muted-foreground">
          Deploy email infrastructure with Vercel OIDC federation. Zero stored
          credentials, automatic rotation, and seamless integration with your
          Vercel projects.
        </p>
        <div className="mt-4 flex items-center gap-4 text-muted-foreground text-sm">
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />5 min read
          </span>
        </div>
      </div>

      {/* Overview */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Overview</h2>
        <p className="mb-4 text-muted-foreground">
          When you deploy with the Vercel provider, Wraps sets up OpenID Connect
          (OIDC) federation between Vercel and your AWS account. This means your
          Vercel functions can securely access AWS SES without any stored
          secrets.
        </p>
        <Card>
          <CardContent className="p-6">
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <Key className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <span className="font-medium">Zero stored credentials</span>
                  <p className="text-muted-foreground text-sm">
                    No API keys or secrets to manage, rotate, or leak
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <span className="font-medium">
                    Automatic credential rotation
                  </span>
                  <p className="text-muted-foreground text-sm">
                    Temporary credentials expire after 15 minutes
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Shield className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <span className="font-medium">
                    Scoped to your Vercel team and project
                  </span>
                  <p className="text-muted-foreground text-sm">
                    Only your specific Vercel project can assume the IAM role
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <span className="font-medium">Revocable at any time</span>
                  <p className="text-muted-foreground text-sm">
                    Remove access instantly by deleting the IAM role or OIDC
                    provider
                  </p>
                </div>
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Prerequisites */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Prerequisites</h2>
        <Card>
          <CardContent className="p-6">
            <ul className="space-y-3 text-muted-foreground">
              <li className="flex items-center gap-3">
                <Check className="h-5 w-5 shrink-0 text-green-500" />
                <span>A Vercel project deployed</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="h-5 w-5 shrink-0 text-green-500" />
                <span>AWS account with CLI access configured</span>
              </li>
              <li className="flex items-center gap-3">
                <Check className="h-5 w-5 shrink-0 text-green-500" />
                <span>
                  Wraps CLI installed (
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    npm install -g @wraps.dev/cli
                  </code>
                  )
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Step 1: Deploy with Vercel Provider */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            1
          </div>
          Deploy with Vercel Provider
        </h2>
        <p className="mb-4 text-muted-foreground">
          Run the init command with the Vercel provider flag. The CLI will guide
          you through the setup interactively.
        </p>
        <div className="mb-4">
          <CLICommand command="npx @wraps.dev/cli email init -p vercel" />
        </div>
        <p className="mb-4 text-muted-foreground">The CLI will:</p>
        <ol className="mb-4 list-decimal space-y-2 pl-6 text-muted-foreground">
          <li>Prompt for your Vercel team slug and project name</li>
          <li>Create an OIDC identity provider in your AWS account</li>
          <li>
            Configure an IAM trust policy scoped to your Vercel team and project
          </li>
          <li>
            Deploy SES configuration, event tracking, and supporting
            infrastructure
          </li>
        </ol>
        <div className="rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">Vercel team and project slugs</p>
          <p className="mt-2 text-muted-foreground text-sm">
            Your team slug is visible in your Vercel dashboard URL (e.g.,{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">
              vercel.com/my-team
            </code>
            ). The project name is the name shown in your Vercel project
            settings.
          </p>
        </div>
      </section>

      {/* Step 2: Environment Variables */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            2
          </div>
          Set Environment Variables
        </h2>
        <p className="mb-4 text-muted-foreground">
          After deployment, add the following environment variables to your
          Vercel project. The CLI will display these values after a successful
          deploy.
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "bash",
              filename: ".env",
              code: envVarsExample,
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

        <h3 className="mb-3 font-medium text-lg">
          Per-Environment Configuration
        </h3>
        <p className="mb-4 text-muted-foreground">
          In the Vercel dashboard, you can scope environment variables to
          specific environments for more granular control:
        </p>
        <Card>
          <CardContent className="p-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pb-2 text-left">Environment</th>
                  <th className="pb-2 text-left">Use Case</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b">
                  <td className="py-2 font-medium text-foreground">
                    Production
                  </td>
                  <td className="py-2">
                    Live email sending with verified domain
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-medium text-foreground">Preview</td>
                  <td className="py-2">
                    Test sending to verified addresses only (SES sandbox)
                  </td>
                </tr>
                <tr>
                  <td className="py-2 font-medium text-foreground">
                    Development
                  </td>
                  <td className="py-2">
                    Local development with personal AWS credentials
                  </td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Step 3: Configure DNS */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            3
          </div>
          Configure DNS
        </h2>
        <p className="mb-4 text-muted-foreground">
          Add the following DNS records to verify your domain and enable email
          authentication.
        </p>

        <h3 className="mb-3 font-medium text-lg">DKIM Records (3 CNAMEs)</h3>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "text",
              filename: "DKIM Records",
              code: dkimRecordsExample,
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

        <h3 className="mb-3 font-medium text-lg">SPF Record (TXT)</h3>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "text",
              filename: "SPF Record",
              code: spfRecordExample,
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

        <h3 className="mb-3 font-medium text-lg">DMARC Record (TXT)</h3>
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

        <h3 className="mb-3 font-medium text-lg">Verify DNS Configuration</h3>
        <div className="mb-4">
          <CLICommand command="npx @wraps.dev/cli email domains verify -d yourdomain.com" />
        </div>
        <div className="flex items-start gap-4 rounded-lg border p-4">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">DNS propagation takes up to 48 hours</p>
            <p className="mt-1 text-muted-foreground text-sm">
              DKIM verification typically completes within a few hours, but can
              take up to 48 hours for DNS to fully propagate. Use{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                dig CNAME token._domainkey.yourdomain.com
              </code>{" "}
              to check progress.
            </p>
          </div>
        </div>
      </section>

      {/* How OIDC Works */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">How OIDC Works</h2>
        <p className="mb-4 text-muted-foreground">
          Vercel OIDC federation creates a secure trust chain between your
          Vercel functions and your AWS account, eliminating the need for
          long-lived credentials.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
                  1
                </div>
                Vercel Issues Token
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              When your Vercel function runs, Vercel automatically issues a
              short-lived OIDC token containing your team and project identity.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
                  2
                </div>
                AWS Validates Token
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              The token is presented to AWS STS, which validates it against the
              OIDC provider registered in your account.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
                  3
                </div>
                Temporary Credentials
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              AWS returns temporary credentials with a 15-minute lifetime,
              scoped to the permissions defined in your IAM role.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs">
                  4
                </div>
                SDK Sends Email
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              The Wraps SDK uses the temporary credentials to call AWS SES. No
              secrets are ever stored in your Vercel environment.
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">Why this is better</p>
          <p className="mt-2 text-muted-foreground text-sm">
            No long-lived secrets means nothing to leak, rotate, or manage.
            Credentials rotate automatically every 15 minutes, and every access
            is logged in AWS CloudTrail for a full audit trail.
          </p>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Troubleshooting</h2>
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                "Access Denied" when sending emails
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  Verify the IAM trust policy matches your Vercel team slug and
                  project name exactly
                </li>
                <li>
                  Check that environment variables are set in the correct Vercel
                  environment (Production vs Preview)
                </li>
                <li>
                  Ensure the OIDC provider is in the same AWS region as your SES
                  configuration
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                "Token expired" errors
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  Check your Vercel function timeout settings — long-running
                  functions may exceed the 15-minute credential lifetime
                </li>
                <li>
                  Ensure your function completes SES calls promptly after
                  obtaining credentials
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                "OIDC provider not found"
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  Verify the AWS region in your environment variables matches
                  the region where you deployed
                </li>
                <li>
                  Run{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    wraps email status
                  </code>{" "}
                  to confirm the deployment region
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                DNS records not propagating
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  DNS propagation can take up to 48 hours — wait and check again
                </li>
                <li>
                  Use{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    dig CNAME token._domainkey.yourdomain.com
                  </code>{" "}
                  to check DNS records directly
                </li>
                <li>
                  Some DNS providers auto-append your domain to record names —
                  check for duplicates
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Environment variables not working
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  Check the Vercel dashboard to ensure variables are scoped to
                  the correct environment (Production, Preview, or Development)
                </li>
                <li>
                  Redeploy your project after adding environment variables —
                  they are not applied to existing deployments
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Verify Your Domain</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Set up DKIM, SPF, and DMARC for better deliverability and sender
                reputation.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/domain-verification">
                  Domain Verification
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">
                Request Production Access
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Move out of the SES sandbox to send emails to any address.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/production-access">
                  Production Access
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
