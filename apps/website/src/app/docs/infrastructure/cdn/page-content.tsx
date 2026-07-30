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
  Database,
  Globe,
  HardDrive,
  Layers,
  Lock,
  Network,
  Shield,
  Tag,
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

const architectureDiagram = `# CDN Asset Hosting Architecture
#
# Upload --> S3 Bucket --> CloudFront (Global Edge) --> End Users
#                              |
#                     Origin Access Identity (OAI)
#                              |
#                    (Optional) ACM Certificate
#                              +
#                        Custom Domain
#
# 1. Assets uploaded to private S3 bucket via AWS SDK or CLI
# 2. CloudFront serves assets from 400+ global edge locations
# 3. OAI ensures S3 is only accessible through CloudFront
# 4. Optional custom domain with auto-validated ACM certificate`;

const uploadExample = `import { readFile } from 'node:fs/promises';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { WrapsEmail } from '@wraps.dev/email';

// The CDN is a plain S3 bucket + CloudFront. Upload with the AWS SDK —
// your OIDC role or IAM credentials already have access.
const s3 = new S3Client({ region: 'us-east-1' });

await s3.send(new PutObjectCommand({
  Bucket: 'wraps-cdn-123456789012', // from \`wraps cdn status\`
  Key: 'images/logo.png',
  Body: await readFile('./logo.png'),
  ContentType: 'image/png',
  CacheControl: 'public, max-age=31536000, immutable',
}));

const url = 'https://cdn.yourdomain.com/images/logo.png';

// Reference the CDN URL in your emails
const email = new WrapsEmail();

const result = await email.send({
  from: 'hello@yourapp.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: \`<img src="\${url}" alt="Logo" />\`,
});`;

export default function InfrastructureCdnPageContent() {
  return (
    <DocsLayout>
      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Infrastructure / CDN
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          What Gets Deployed: CDN
        </h1>
        <p className="text-lg text-muted-foreground">
          Every AWS resource Wraps creates when you run{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">wraps cdn init</code>
          .
        </p>
      </div>

      {/* Overview */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Layers className="h-6 w-6 text-primary" />
          Overview
        </h2>
        <p className="mb-4 text-muted-foreground">
          The CDN service provides S3 + CloudFront for hosting email assets and
          images. Assets are stored in a private S3 bucket and served globally
          through CloudFront with HTTPS and edge caching.
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "bash",
              filename: "architecture.txt",
              code: architectureDiagram,
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
      </section>

      {/* Core Resources */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Shield className="h-6 w-6 text-primary" />
          Core Resources
        </h2>
        <p className="mb-6 text-muted-foreground">
          These resources are always created when you deploy the CDN service.
        </p>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <HardDrive className="h-5 w-5 text-primary" />
                S3 Bucket
                <code className="rounded bg-muted px-2 py-0.5 font-mono text-sm">
                  wraps-cdn-&#123;id&#125;
                </code>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                <li>Private bucket (no public access)</li>
                <li>Versioning enabled for asset history</li>
                <li>Server-side encryption (AES-256)</li>
                <li>
                  Unique ID suffix prevents naming conflicts across accounts
                </li>
                <li>
                  Stores images, logos, stylesheets, and other email assets
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Network className="h-5 w-5 text-primary" />
                CloudFront Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                <li>Global edge caching across 400+ locations</li>
                <li>HTTPS enabled by default (CloudFront certificate)</li>
                <li>
                  Origin Access Identity (OAI) restricts S3 access to CloudFront
                  only
                </li>
                <li>
                  Cache behaviors optimized for static assets (images, CSS,
                  fonts)
                </li>
                <li>Gzip and Brotli compression enabled</li>
                <li>
                  Default TTL of 86,400 seconds (24 hours) for edge caching
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lock className="h-5 w-5 text-primary" />
                IAM Role
                <code className="rounded bg-muted px-2 py-0.5 font-mono text-sm">
                  wraps-cdn-role
                </code>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                <li>
                  S3 read/write permissions for uploading and managing assets
                </li>
                <li>CloudFront invalidation permissions for cache busting</li>
                <li>
                  OIDC trust policy for Vercel (or IAM trust for AWS-native
                  providers)
                </li>
                <li>Scoped to the specific S3 bucket and distribution</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Custom Domain Resources */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Globe className="h-6 w-6 text-primary" />
          Custom Domain Resources
        </h2>
        <p className="mb-4 text-muted-foreground">
          When you configure a custom domain (e.g.,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            cdn.yourdomain.com
          </code>
          ), these additional resources are created.
        </p>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="h-5 w-5 text-primary" />
                ACM Certificate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                <li>SSL/TLS certificate for your custom domain</li>
                <li>Auto-validated using DNS (CNAME record)</li>
                <li>
                  Provisioned in{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    us-east-1
                  </code>{" "}
                  (CloudFront requirement, regardless of your chosen region)
                </li>
                <li>Auto-renewing (managed by AWS)</li>
                <li>
                  Free of charge (ACM certificates are free for AWS services)
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Globe className="h-5 w-5 text-primary" />
                DNS Records
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm">
                <li>
                  CNAME record pointing your custom domain to the CloudFront
                  distribution
                </li>
                <li>CNAME record for ACM certificate validation</li>
                <li>
                  If using Route53, records are created automatically.
                  Otherwise, DNS records are displayed for manual configuration.
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">Custom domain is optional</p>
          <p className="mt-1 text-muted-foreground text-sm">
            Without a custom domain, your assets are served from the default
            CloudFront URL (e.g.,{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              d1234abcdef8.cloudfront.net
            </code>
            ). A custom domain provides a branded URL for your email assets.
          </p>
        </div>
      </section>

      {/* Usage Example */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Layers className="h-6 w-6 text-primary" />
          Usage Example
        </h2>
        <p className="mb-4 text-muted-foreground">
          After deploying, use the AWS SDK to upload assets and reference them
          in your emails.
        </p>
        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "typescript",
              filename: "upload-asset.ts",
              code: uploadExample,
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

      {/* Cost Estimate */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Database className="h-6 w-6 text-primary" />
          Cost Estimate
        </h2>
        <p className="mb-4 text-muted-foreground">
          CDN costs are based on storage and data transfer. All costs are billed
          directly by AWS.
        </p>

        <Card className="mb-4">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-4 text-left font-medium">Component</th>
                    <th className="p-4 text-left font-medium">Pricing</th>
                    <th className="p-4 text-left font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-4 font-medium">S3 Storage</td>
                    <td className="p-4 text-muted-foreground">~$0.023/GB/mo</td>
                    <td className="p-4 text-muted-foreground">
                      Standard storage class
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">
                      CloudFront Data Transfer
                    </td>
                    <td className="p-4 text-muted-foreground">~$0.085/GB</td>
                    <td className="p-4 text-muted-foreground">
                      First 10 TB/mo to internet
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">CloudFront Requests</td>
                    <td className="p-4 text-muted-foreground">
                      ~$0.01/10K requests
                    </td>
                    <td className="p-4 text-muted-foreground">
                      HTTPS requests
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">ACM Certificate</td>
                    <td className="p-4 text-muted-foreground">Free</td>
                    <td className="p-4 text-muted-foreground">
                      For use with CloudFront
                    </td>
                  </tr>
                  <tr>
                    <td className="p-4 font-medium">CloudFront Invalidation</td>
                    <td className="p-4 text-muted-foreground">
                      First 1,000 free/mo
                    </td>
                    <td className="p-4 text-muted-foreground">
                      $0.005 per path after
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">Typical cost for email assets</p>
          <p className="mt-1 text-muted-foreground text-sm">
            Most email use cases (logos, header images, stylesheets) use minimal
            storage and transfer. Expect less than $1/mo for typical email asset
            hosting. The AWS Free Tier includes 1 TB of CloudFront data transfer
            for the first 12 months.
          </p>
        </div>
      </section>

      {/* Resource Tags */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Tag className="h-6 w-6 text-primary" />
          Resource Tags
        </h2>
        <p className="mb-4 text-muted-foreground">
          All CDN resources are tagged for identification and cost tracking.
        </p>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-4 text-left font-medium">Tag Key</th>
                    <th className="p-4 text-left font-medium">Tag Value</th>
                    <th className="p-4 text-left font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        ManagedBy
                      </code>
                    </td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        wraps-cli
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Identifies resources managed by Wraps
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Next Steps */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">CDN CLI Reference</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                All available CDN CLI commands and options.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/cli-reference/cdn">
                  View CLI Docs
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">CDN Quickstart</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Deploy CDN infrastructure and upload your first asset.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/quickstart/cdn">
                  Get Started
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Infrastructure as Code</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Deploy CDN infrastructure with{" "}
                <Link
                  className="text-primary underline"
                  href="/docs/cdk-reference"
                >
                  CDK
                </Link>{" "}
                or{" "}
                <Link
                  className="text-primary underline"
                  href="/docs/pulumi-reference"
                >
                  Pulumi
                </Link>{" "}
                instead of the CLI.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/cdk-reference">
                  View CDK Docs
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Help Section */}
      <Card className="bg-muted/50">
        <CardContent className="p-8 text-center">
          <h3 className="mb-2 font-bold text-xl">Need Help?</h3>
          <p className="mb-4 text-muted-foreground">
            If you run into any issues, check our GitHub discussions or open an
            issue.
          </p>
          <Button asChild>
            <a
              href="https://github.com/wraps-team/wraps/discussions"
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
