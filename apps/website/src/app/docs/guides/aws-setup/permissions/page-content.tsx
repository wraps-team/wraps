"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { ArrowRight, CheckCircle2, Clock, Info, Terminal } from "lucide-react";
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

const permissionsCommand = "npx @wraps.dev/cli permissions";
const permissionsJsonCommand = "npx @wraps.dev/cli permissions --json";
const permissionsPresetCommand =
  "npx @wraps.dev/cli permissions --preset production --json";
const permissionsServiceCommand =
  "npx @wraps.dev/cli permissions --service email --json";
const saveToFileCommand =
  "npx @wraps.dev/cli permissions --json > wraps-policy.json";

const presets = [
  {
    name: "Starter",
    cost: "~$0.05/mo",
    services: ["IAM", "STS", "SES", "CloudWatch"],
    description: "Basic email sending with open/click tracking",
  },
  {
    name: "Production",
    cost: "~$2-5/mo",
    services: [
      "IAM",
      "STS",
      "SES",
      "CloudWatch",
      "EventBridge",
      "SQS",
      "Lambda",
      "DynamoDB",
    ],
    description: "Full event tracking with email history storage",
  },
  {
    name: "Enterprise",
    cost: "~$50-100/mo",
    services: [
      "IAM",
      "STS",
      "SES",
      "CloudWatch",
      "EventBridge",
      "SQS",
      "Lambda",
      "DynamoDB",
      "IAM User Management",
    ],
    description: "All features including SMTP credentials",
  },
];

const optionalPermissions = [
  {
    service: "Route53",
    reason: "Automatic DNS record management",
    alternative: "Add DNS records manually to your provider",
  },
  {
    service: "IAM OIDC Provider",
    reason: "Vercel deployments (OIDC federation)",
    alternative: "Use AWS access keys instead",
  },
];

export default function PermissionsPageContent() {
  return (
    <DocsLayout>
      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Guide
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          IAM Permissions
        </h1>
        <p className="text-lg text-muted-foreground">
          View and configure the exact AWS IAM permissions required for Wraps to
          deploy infrastructure to your account.
        </p>
        <div className="mt-4 flex items-center gap-4 text-muted-foreground text-sm">
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />5 min
          </span>
        </div>
      </div>

      {/* Quick Command */}
      <section className="mb-12">
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <Terminal className="h-6 w-6 text-primary" />
              <CardTitle>View Required Permissions</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-muted-foreground">
              Use the CLI to see exactly what permissions are needed for your
              configuration:
            </p>
            <CodeBlock
              className="h-auto"
              data={[
                {
                  language: "bash",
                  filename: "terminal.sh",
                  code: permissionsCommand,
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
          </CardContent>
        </Card>
      </section>

      {/* Command Options */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Command Options</h2>
        <p className="mb-4 text-muted-foreground">
          The{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">permissions</code>{" "}
          command supports several options to customize the output:
        </p>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-base">--json</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-muted-foreground text-sm">
                Output the full IAM policy as JSON (ready to paste into AWS
                Console):
              </p>
              <CodeBlock
                className="h-auto"
                data={[
                  {
                    language: "bash",
                    filename: "terminal.sh",
                    code: permissionsJsonCommand,
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-base">
                --preset &lt;name&gt;
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-muted-foreground text-sm">
                Get permissions for a specific preset (starter, production, or
                enterprise):
              </p>
              <CodeBlock
                className="h-auto"
                data={[
                  {
                    language: "bash",
                    filename: "terminal.sh",
                    code: permissionsPresetCommand,
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-mono text-base">
                --service &lt;name&gt;
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-muted-foreground text-sm">
                Get permissions for a specific service (email, sms, or cdn):
              </p>
              <CodeBlock
                className="h-auto"
                data={[
                  {
                    language: "bash",
                    filename: "terminal.sh",
                    code: permissionsServiceCommand,
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
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Permissions by Preset */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Permissions by Preset</h2>
        <p className="mb-4 text-muted-foreground">
          The AWS services required depend on which configuration preset you
          choose:
        </p>

        <div className="space-y-4">
          {presets.map((preset) => (
            <Card key={preset.name}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{preset.name}</CardTitle>
                  <Badge variant="secondary">{preset.cost}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-muted-foreground text-sm">
                  {preset.description}
                </p>
                <div className="flex flex-wrap gap-2">
                  {preset.services.map((service) => (
                    <Badge
                      className="font-mono"
                      key={service}
                      variant="outline"
                    >
                      {service}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Optional Permissions */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Optional Permissions</h2>
        <p className="mb-4 text-muted-foreground">
          These permissions enhance functionality but are not required:
        </p>

        <div className="space-y-4">
          {optionalPermissions.map((perm) => (
            <Card key={perm.service}>
              <CardContent className="flex items-start gap-4 p-4">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium">{perm.service}</p>
                  <p className="text-muted-foreground text-sm">{perm.reason}</p>
                  <p className="mt-1 text-muted-foreground text-sm">
                    <strong>Alternative:</strong> {perm.alternative}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Creating the Policy */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            1
          </div>
          Generate the Policy
        </h2>
        <p className="mb-4 text-muted-foreground">
          Save the IAM policy JSON to a file:
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "bash",
              filename: "terminal.sh",
              code: saveToFileCommand,
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

      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            2
          </div>
          Create Policy in AWS Console
        </h2>
        <Card>
          <CardContent className="p-6">
            <ol className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-sm">
                  1
                </div>
                <div>
                  <p>
                    Go to{" "}
                    <a
                      className="font-medium text-primary underline"
                      href="https://console.aws.amazon.com/iam/home#/policies"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      IAM &rarr; Policies
                    </a>{" "}
                    in the AWS Console
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-sm">
                  2
                </div>
                <div>
                  <p>
                    Click{" "}
                    <strong className="text-primary">Create Policy</strong>
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-sm">
                  3
                </div>
                <div>
                  <p>
                    Select the <strong>JSON</strong> tab
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-sm">
                  4
                </div>
                <div>
                  <p>Paste the contents of your policy JSON file</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-sm">
                  5
                </div>
                <div>
                  <p>
                    Name it{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      WrapsDeploymentPolicy
                    </code>
                  </p>
                </div>
              </li>
            </ol>
          </CardContent>
        </Card>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            3
          </div>
          Attach to Your IAM User/Role
        </h2>
        <Card>
          <CardContent className="p-6">
            <ol className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-sm">
                  1
                </div>
                <div>
                  <p>
                    Go to{" "}
                    <a
                      className="font-medium text-primary underline"
                      href="https://console.aws.amazon.com/iam/home#/users"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      IAM &rarr; Users
                    </a>{" "}
                    (or Roles)
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-sm">
                  2
                </div>
                <div>
                  <p>Select your user or role</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-sm">
                  3
                </div>
                <div>
                  <p>
                    Click{" "}
                    <strong className="text-primary">
                      Add permissions &rarr; Attach policies
                    </strong>
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-sm">
                  4
                </div>
                <div>
                  <p>
                    Search for and select{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      WrapsDeploymentPolicy
                    </code>
                  </p>
                </div>
              </li>
            </ol>
          </CardContent>
        </Card>
      </section>

      {/* Troubleshooting */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Permission Errors</h2>
        <p className="mb-4 text-muted-foreground">
          If you encounter permission errors during deployment:
        </p>
        <Card>
          <CardContent className="p-6">
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <div>
                  <strong>Check the error message</strong>
                  <p className="text-muted-foreground text-sm">
                    Wraps provides specific guidance for each permission error
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <div>
                  <strong>Regenerate the policy</strong>
                  <p className="text-muted-foreground text-sm">
                    Run{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      wraps permissions --json
                    </code>{" "}
                    to get the latest required permissions
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <div>
                  <strong>Check for SCPs</strong>
                  <p className="text-muted-foreground text-sm">
                    AWS Organizations may have Service Control Policies
                    restricting what you can do
                  </p>
                </div>
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
              <CardTitle className="text-lg">Deploy Infrastructure</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Now that permissions are set up, deploy your first service.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/quickstart/email">
                  Deploy Email
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Troubleshooting</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Having issues? Check common problems and solutions.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/aws-setup/troubleshooting">
                  Troubleshooting
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
