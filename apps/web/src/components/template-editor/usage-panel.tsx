"use client";

import type { Template } from "@wraps/db";
import { Check, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CodeTabs } from "@/components/ui/shadcn-io/code-tabs";
import { cn } from "@/lib/utils";

type UsagePanelProps = {
  template: Template;
  className?: string;
};

function extractVariables(content: unknown): string[] {
  const variables = new Set<string>();
  const text = JSON.stringify(content);
  const matches = text.matchAll(/\{\{(\w+)\}\}/g);
  for (const match of matches) {
    variables.add(match[1]);
  }
  return Array.from(variables).sort();
}

export function UsagePanel({ template, className }: UsagePanelProps) {
  const variables = extractVariables(template.content);
  const isPublished =
    template.status === "PUBLISHED" && template.sesTemplateName;

  const templateName = template.sesTemplateName || "Your-Template-Name";

  // Build template data example from actual variables
  const templateDataObj =
    variables.length > 0
      ? Object.fromEntries(
          variables.map((v) => [
            v,
            v === "email" ? "user@example.com" : `Example ${v}`,
          ])
        )
      : { firstName: "John", lastName: "Doe" };

  const templateDataStr = JSON.stringify(templateDataObj, null, 4);
  const templateDataIndented = templateDataStr.split("\n").join("\n    ");

  const [templateNameCopied, setTemplateNameCopied] = useState(false);

  const copyTemplateName = () => {
    if (template.sesTemplateName) {
      navigator.clipboard.writeText(template.sesTemplateName);
      setTemplateNameCopied(true);
      setTimeout(() => setTemplateNameCopied(false), 2000);
    }
  };

  // Wraps SDK examples
  const wrapsSingleEmail = `import { WrapsEmail } from "@wraps.dev/email";

const email = new WrapsEmail();

await email.sendTemplate({
  from: "you@yourdomain.com",
  to: "recipient@example.com",
  template: "${templateName}",
  templateData: ${templateDataIndented},
});`;

  const wrapsBulkEmail = `import { WrapsEmail } from "@wraps.dev/email";

const email = new WrapsEmail();

const results = await email.sendBulkTemplate({
  from: "you@yourdomain.com",
  template: "${templateName}",
  destinations: [
    {
      to: "alice@example.com",
      templateData: { firstName: "Alice" },
    },
    {
      to: "bob@example.com",
      templateData: { firstName: "Bob" },
    },
  ],
  defaultTemplateData: ${templateDataIndented},
});

// Check results
results.status.forEach((result, i) => {
  if (result.status === "success") {
    console.log(\`Email \${i + 1} sent: \${result.messageId}\`);
  } else {
    console.log(\`Email \${i + 1} failed: \${result.error}\`);
  }
});`;

  // AWS SDK examples
  const awsSdkTypescript = `import { SESClient, SendTemplatedEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({ region: "us-east-1" });

const command = new SendTemplatedEmailCommand({
  Source: "you@yourdomain.com",
  Destination: {
    ToAddresses: ["recipient@example.com"],
  },
  Template: "${templateName}",
  TemplateData: JSON.stringify(${templateDataIndented}),
});

const response = await ses.send(command);
console.log("Email sent:", response.MessageId);`;

  const awsSdkPython = `import boto3
import json

ses = boto3.client("ses", region_name="us-east-1")

response = ses.send_templated_email(
    Source="you@yourdomain.com",
    Destination={
        "ToAddresses": ["recipient@example.com"]
    },
    Template="${templateName}",
    TemplateData=json.dumps(${templateDataStr.split("\n").join("\n    ")})
)

print(f"Email sent: {response['MessageId']}")`;

  const awsCli = `aws ses send-templated-email \\
  --source "you@yourdomain.com" \\
  --destination '{"ToAddresses":["recipient@example.com"]}' \\
  --template "${templateName}" \\
  --template-data '${JSON.stringify(templateDataObj)}'`;

  return (
    <ScrollArea className={cn("h-full", className)}>
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        {/* Header */}
        <div>
          <h1 className="font-bold text-2xl">Template Usage</h1>
          <p className="text-muted-foreground">
            Send emails using this template with the Wraps SDK or AWS SES
            directly.
          </p>
        </div>

        {/* Status Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Template Status</CardTitle>
              <Badge
                className={cn(
                  "text-xs",
                  isPublished
                    ? "border-green-500/20 bg-green-500/10 text-green-600"
                    : "border-yellow-500/20 bg-yellow-500/10 text-yellow-600"
                )}
                variant="outline"
              >
                {isPublished ? "Published" : "Draft"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {isPublished ? (
              <>
                <div>
                  <p className="mb-1 font-medium text-sm">Template Name</p>
                  <InputGroup>
                    <InputGroupInput
                      className="font-mono text-sm"
                      readOnly
                      value={template.sesTemplateName || ""}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupButton
                        aria-label="Copy template name"
                        onClick={copyTemplateName}
                        size="icon-xs"
                        title="Copy"
                      >
                        {templateNameCopied ? (
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </InputGroupButton>
                    </InputGroupAddon>
                  </InputGroup>
                </div>
                {template.subject && (
                  <div>
                    <p className="mb-1 font-medium text-sm">Subject Line</p>
                    <code className="block rounded bg-muted px-2 py-1 font-mono text-sm">
                      {template.subject}
                    </code>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                Publish this template to get the template name and start sending
                emails.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Variables Card */}
        {variables.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Template Variables</CardTitle>
              <CardDescription>
                Pass these variables in templateData when sending emails.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {variables.map((variable) => (
                  <Badge key={variable} variant="secondary">
                    {`{{${variable}}}`}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Send Single Email - Wraps SDK */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Send Email</CardTitle>
                <CardDescription>
                  Send a single templated email with the Wraps SDK.{" "}
                  <Link
                    className="text-primary hover:underline"
                    href="https://wraps.dev/docs/sdk-reference"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    View SDK docs
                  </Link>
                </CardDescription>
              </div>
              <Badge variant="secondary">Recommended</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <CodeTabs
              codes={{ TypeScript: wrapsSingleEmail }}
              lang="typescript"
            />
          </CardContent>
        </Card>

        {/* Bulk Sending - Wraps SDK */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Bulk Sending</CardTitle>
            <CardDescription>
              Send to multiple recipients with personalized data (up to 50 per
              call).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CodeTabs
              codes={{ TypeScript: wrapsBulkEmail }}
              lang="typescript"
            />
          </CardContent>
        </Card>

        {/* AWS SDK Direct */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Using AWS SDK Directly</CardTitle>
            <CardDescription>
              If you prefer using the AWS SDK directly, here are examples for
              different languages.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CodeTabs
              codes={{
                TypeScript: awsSdkTypescript,
                Python: awsSdkPython,
                "AWS CLI": awsCli,
              }}
              defaultValue="TypeScript"
              lang="typescript"
            />
          </CardContent>
        </Card>

        {/* Resources */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Resources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <a
              className="flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground"
              href="https://www.npmjs.com/package/@wraps.dev/email"
              rel="noopener noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" />
              @wraps.dev/email on npm
            </a>
            <a
              className="flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground"
              href="https://github.com/wraps-team/wraps-js"
              rel="noopener noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" />
              Wraps SDK on GitHub
            </a>
            <a
              className="flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground"
              href="https://docs.aws.amazon.com/ses/latest/dg/send-personalized-email-api.html"
              rel="noopener noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" />
              AWS SES Templated Email Documentation
            </a>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  );
}
