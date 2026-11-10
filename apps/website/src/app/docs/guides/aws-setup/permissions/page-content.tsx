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
const permissionsPolicyDirCommand =
  "npx @wraps.dev/cli permissions --policy-dir ./wraps-policy";
const permissionsPresetCommand =
  "npx @wraps.dev/cli permissions --preset production --policy-dir ./wraps-policy";
const permissionsServiceCommand =
  "npx @wraps.dev/cli permissions --service email --policy-dir ./wraps-policy";

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
              <CardTitle className="font-mono text-base">
                --policy-dir &lt;dir&gt;
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-muted-foreground text-sm">
                Write the policy to a folder as{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  wraps-deployer-1.json
                </code>
                ,{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  wraps-deployer-2.json
                </code>
                , and so on. Each file is a bare IAM policy small enough for one
                managed policy: IAM caps a managed policy at 6,144 characters,
                whitespace not counted, and the full Wraps policy is larger. The
                folder is created if it&apos;s missing. Older{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  wraps-deployer-&lt;n&gt;.json
                </code>{" "}
                files numbered above the new count are removed; nothing else in
                the folder is touched.
              </p>
              <CodeBlock
                className="h-auto"
                data={[
                  {
                    language: "bash",
                    filename: "terminal.sh",
                    code: permissionsPolicyDirCommand,
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
              <CardTitle className="font-mono text-base">--json</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-muted-foreground text-sm">
                For scripts and agents. Prints a JSON envelope (
                <code className="rounded bg-muted px-1.5 py-0.5">
                  {"{ success, command, data }"}
                </code>
                ), not a policy you can paste into IAM.{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  data.policies
                </code>{" "}
                holds the split, one{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  {"{ name, policy }"}
                </code>{" "}
                per{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  wraps-deployer-&lt;n&gt;
                </code>
                .{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  data.policy
                </code>{" "}
                is the merged document: it can exceed 6,144 characters, so it
                only fits as a role&apos;s inline policy (10,240 characters
                across all of that role&apos;s inline policies).
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
                Write the policies for a specific preset (starter, production,
                or enterprise):
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
                Write the policies for a specific service (email, sms, or cdn):
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
          Generate the Policies
        </h2>
        <p className="mb-4 text-muted-foreground">
          Write the IAM policies to a folder. The full Wraps policy is larger
          than one managed policy allows, so it is split into{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            wraps-deployer-1.json
          </code>
          ,{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">
            wraps-deployer-2.json
          </code>
          , and so on. A single service or preset may fit in one file.
        </p>
        <CodeBlock
          className="mb-4 h-auto"
          data={[
            {
              language: "bash",
              filename: "terminal.sh",
              code: permissionsPolicyDirCommand,
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
          Create One Policy per File
        </h2>
        <p className="mb-4 text-muted-foreground">
          Repeat these steps for each file in the folder.
        </p>
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
                  <p>
                    Paste the contents of one file, such as{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      wraps-deployer-1.json
                    </code>
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-sm">
                  5
                </div>
                <div>
                  <p>
                    Name it after the file:{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      wraps-deployer-1
                    </code>
                  </p>
                  <p className="mt-1 text-muted-foreground text-sm">
                    IAM policy names are unique per account. If different users
                    or roles in one account need different scopes, add a suffix,
                    such as{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      wraps-deployer-email-1
                    </code>
                    .
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
                    Search for and select every{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      wraps-deployer-&lt;n&gt;
                    </code>{" "}
                    policy
                  </p>
                </div>
              </li>
            </ol>
            <p className="mt-6 flex items-start gap-2 text-muted-foreground text-sm">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Each user takes up to 10 managed policies by default (20 per
                role, 10 per group), and the policies already attached count
                toward that. Wraps splits its policy into 3 files or fewer.
              </span>
            </p>
          </CardContent>
        </Card>
      </section>

      {/* Updating */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Updating the Policies</h2>
        <p className="mb-4 text-muted-foreground">
          A new Wraps version can add permissions or move a statement to a
          different file. When it does:
        </p>
        <Card>
          <CardContent className="p-6">
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <div>
                  <strong>Regenerate the files</strong>
                  <p className="text-muted-foreground text-sm">
                    Run{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      wraps permissions --policy-dir ./wraps-policy
                    </code>{" "}
                    into the same folder as last time, with the same{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      --service
                    </code>{" "}
                    and{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      --preset
                    </code>{" "}
                    you used before.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <div>
                  <strong>Update every policy</strong>
                  <p className="text-muted-foreground text-sm">
                    Open each{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      wraps-deployer-&lt;n&gt;
                    </code>{" "}
                    policy, choose Edit, and paste its file into the JSON tab.
                    IAM keeps up to 5 versions of a managed policy; when you
                    save a sixth, the console asks you to delete an old one.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <div>
                  <strong>Match the number of files</strong>
                  <p className="text-muted-foreground text-sm">
                    Create and attach a policy for each new file. The CLI lists
                    the files it removed from the folder: detach and delete the
                    policies named after them. If you used a new folder, delete
                    any{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      wraps-deployer-&lt;n&gt;
                    </code>{" "}
                    policy numbered above the new file count.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <div>
                  <strong>Replace an old single policy</strong>
                  <p className="text-muted-foreground text-sm">
                    If you attached one{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      WrapsDeploymentPolicy
                    </code>{" "}
                    before, attach the{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      wraps-deployer-&lt;n&gt;
                    </code>{" "}
                    policies, then detach it.
                  </p>
                </div>
              </li>
            </ul>
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
                      wraps permissions --policy-dir ./wraps-policy
                    </code>{" "}
                    and update each{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      wraps-deployer-&lt;n&gt;
                    </code>{" "}
                    policy from its file
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
