"use client";

import { Card } from "@wraps/ui/components/ui/card";
import {
  ArrowRight,
  Database,
  FileText,
  HardDrive,
  Headphones,
  Mail,
  Package,
  Pause,
  Play,
  RotateCcw,
  Server,
  Terminal as TerminalIcon,
  Users,
  Zap,
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { CodeTabs } from "@/components/ui/shadcn-io/code-tabs";
import {
  AnimatedSpan,
  Terminal,
  TypingAnimation,
} from "@/components/ui/shadcn-io/terminal";

// Simple code block using CodeTabs for single code snippets
type CodeBlockProps = {
  code: string;
  title?: string;
  lang?: string;
};

function detectLanguage(code: string, title: string): string {
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes("terminal") || lowerTitle === "code") {
    return "bash";
  }
  if (lowerTitle.includes("json") || code.trim().startsWith("{")) {
    return "json";
  }
  if (lowerTitle.includes("dns") || lowerTitle.includes("record")) {
    return "text";
  }
  if (
    code.includes("//") ||
    code.includes("const ") ||
    code.includes("export ")
  ) {
    return "typescript";
  }
  return "bash";
}

export function CodeBlock({ code, title = "code", lang }: CodeBlockProps) {
  const detectedLang = lang ?? detectLanguage(code, title);
  const codes = { [title]: code };
  return (
    <CodeTabs className="my-4" codes={codes} copyButton lang={detectedLang} />
  );
}

// Architecture diagram with animation
export function InboundArchitectureDiagram() {
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const steps = [
    { id: "sender", label: "Sender", icon: Mail, color: "gray" as const },
    { id: "ses", label: "SES", icon: Server, color: "orange" as const },
    { id: "s3", label: "S3", icon: HardDrive, color: "green" as const },
    {
      id: "lambda",
      label: "Lambda",
      icon: TerminalIcon,
      color: "yellow" as const,
    },
    {
      id: "eventbridge",
      label: "EventBridge",
      icon: Zap,
      color: "purple" as const,
    },
    { id: "app", label: "Your App", icon: Database, color: "cyan" as const },
  ];

  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, 1200);
    return () => clearInterval(timer);
  }, [isPlaying, steps.length]);

  const colorClasses = {
    gray: {
      bg: "bg-muted-foreground/10 dark:bg-muted-foreground/20",
      border: "border-muted-foreground/50",
      text: "text-muted-foreground",
      glow: "shadow-muted-foreground/25",
    },
    orange: {
      bg: "bg-brand/10",
      border: "border-brand/50",
      text: "text-brand-text",
      glow: "shadow-brand/25",
    },
    green: {
      bg: "bg-success/10 dark:bg-success/20",
      border: "border-success/50",
      text: "text-success",
      glow: "shadow-success/25",
    },
    yellow: {
      bg: "bg-warning/10 dark:bg-warning/20",
      border: "border-warning/50",
      text: "text-warning",
      glow: "shadow-warning/25",
    },
    purple: {
      bg: "bg-info/10 dark:bg-info/20",
      border: "border-info/50",
      text: "text-info",
      glow: "shadow-info/25",
    },
    cyan: {
      bg: "bg-info/10 dark:bg-info/20",
      border: "border-info/50",
      text: "text-info",
      glow: "shadow-info/25",
    },
  };

  const descriptions = [
    "Email arrives at your MX records",
    "SES receives and validates the email",
    "Raw email stored securely in S3",
    "Lambda parses headers, body, attachments",
    "EventBridge triggers your webhooks",
    "Your application processes the email",
  ];

  return (
    <Card className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h4 className="font-semibold text-foreground text-lg">
          Inbound Email Pipeline
        </h4>
        <div className="flex gap-2">
          <button
            className="rounded-lg bg-muted p-2 transition-colors hover:bg-muted/80"
            onClick={() => setIsPlaying(!isPlaying)}
            type="button"
          >
            {isPlaying ? (
              <Pause className="text-muted-foreground" size={16} />
            ) : (
              <Play className="text-muted-foreground" size={16} />
            )}
          </button>
          <button
            className="rounded-lg bg-muted p-2 transition-colors hover:bg-muted/80"
            onClick={() => setActiveStep(0)}
            type="button"
          >
            <RotateCcw className="text-muted-foreground" size={16} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2 sm:gap-2">
        {steps.map((step, index) => {
          const colors = colorClasses[step.color];
          const isActive = index === activeStep;
          const isPast = index < activeStep;
          const Icon = step.icon;

          return (
            <Fragment key={step.id}>
              <div
                className={`flex min-w-[70px] flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all duration-500 sm:min-w-[90px] sm:p-4 ${
                  isActive
                    ? `${colors.bg} ${colors.border} shadow-lg ${colors.glow}`
                    : "border-border bg-muted/30"
                } ${isPast ? "opacity-50" : ""}`}
              >
                <Icon
                  className={isActive ? colors.text : "text-muted-foreground"}
                  size={20}
                />
                <span
                  className={`font-medium text-xs sm:text-sm ${
                    isActive ? colors.text : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div className="flex items-center">
                  <ArrowRight
                    className={`transition-colors duration-300 ${
                      index < activeStep ? "text-info" : "text-muted-foreground"
                    }`}
                    size={16}
                  />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      <p className="mt-4 text-center text-muted-foreground text-sm">
        {descriptions[activeStep]}
      </p>
    </Card>
  );
}

// Use cases grid
export function UseCasesGrid() {
  const useCases = [
    {
      icon: Headphones,
      title: "Support Inbox",
      description:
        "Auto-create tickets from customer emails. Route by subject, extract order IDs, assign to teams.",
      color: "text-info",
      bgColor: "bg-info/10",
    },
    {
      icon: Package,
      title: "Order Processing",
      description:
        "Parse confirmations, extract tracking numbers, update databases automatically.",
      color: "text-brand-text",
      bgColor: "bg-brand/10",
    },
    {
      icon: FileText,
      title: "Email-to-Ticket",
      description: "Integrate with Jira, Linear, GitHub Issues via webhooks.",
      color: "text-muted-foreground",
      bgColor: "bg-muted",
    },
    {
      icon: Mail,
      title: "Auto-Responders",
      description:
        "Send acknowledgments, out-of-office, or follow-up sequences.",
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      icon: Users,
      title: "Lead Capture",
      description: "Extract contact info from inquiries, sync to CRM.",
      color: "text-brand-text",
      bgColor: "bg-brand/10",
    },
    {
      icon: Database,
      title: "Document Processing",
      description: "Extract attachments, process PDFs, trigger workflows.",
      color: "text-muted-foreground",
      bgColor: "bg-muted",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {useCases.map((useCase) => {
        const Icon = useCase.icon;
        return (
          <Card className="p-5" key={useCase.title}>
            <div
              className={`mb-3 flex size-10 items-center justify-center rounded-lg ${useCase.bgColor}`}
            >
              <Icon className={`size-5 ${useCase.color}`} />
            </div>
            <h4 className="mb-1 font-semibold">{useCase.title}</h4>
            <p className="text-muted-foreground text-sm">
              {useCase.description}
            </p>
          </Card>
        );
      })}
    </div>
  );
}

// SDK code tabs using shadcn-io CodeTabs
export function SdkCodeTabs() {
  const codes = {
    List: `import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail({
  inboundBucket: 'your-bucket-name',
});

// List recent inbound emails
const { emails, cursor } = await email.inbox.list({
  limit: 20,
  from: 'customer@example.com', // optional
});

for (const msg of emails) {
  console.log(\`\${msg.from.address}: \${msg.subject}\`);
}`,
    Get: `// Get full email details
const inbound = await email.inbox.get('inb_a1b2c3d4');

console.log('From:', inbound.from.name);
console.log('Subject:', inbound.subject);
console.log('HTML:', inbound.html);

// Access attachments
for (const att of inbound.attachments) {
  console.log(\`\${att.filename} (\${att.size} bytes)\`);
}

// Check spam verdict
if (inbound.spamVerdict === 'PASS') {
  // Safe to process
}`,
    Reply: `// Reply with proper threading headers
await email.inbox.reply('inb_a1b2c3d4', {
  from: 'support@yourapp.com',
  html: \`
    <p>Thanks for reaching out!</p>
    <p>We'll respond within 24 hours.</p>
  \`,
});

// Threading headers (In-Reply-To, References)
// are automatically set`,
    Forward: `// Forward to your team
await email.inbox.forward('inb_a1b2c3d4', {
  to: 'team@yourcompany.com',
  from: 'forwarding@yourapp.com',
  note: 'Please review this inquiry.',
});

// Original message and attachments preserved`,
    Webhook: `// EventBridge Lambda handler
export const handler = async (event) => {
  const email = event.detail;

  // Route based on recipient
  if (email.to[0].address.startsWith('support@')) {
    await createSupportTicket(email);
  }

  // Process attachments
  if (email.attachments.length > 0) {
    await processAttachments(email);
  }

  return { statusCode: 200 };
};`,
  };

  return <CodeTabs className="my-6" codes={codes} lang="typescript" />;
}

// Interactive CLI demo using shadcn-io Terminal
export function CLIDemo() {
  return (
    <Terminal className="my-6 max-w-full">
      <TypingAnimation delay={0} duration={40}>
        npx @wraps.dev/cli email inbound init
      </TypingAnimation>

      <AnimatedSpan className="text-muted-foreground" delay={1500}>
        ◐ Validating AWS credentials...
      </AnimatedSpan>

      <AnimatedSpan className="text-success" delay={2500}>
        ✓ AWS credentials valid (account: 123456789012)
      </AnimatedSpan>

      <AnimatedSpan className="text-muted-foreground" delay={3500}>
        ◐ Deploying inbound infrastructure...
      </AnimatedSpan>

      <AnimatedSpan className="text-muted-foreground" delay={4500}>
        {"  "}✓ S3 Bucket: wraps-inbound-emails
      </AnimatedSpan>
      <AnimatedSpan className="text-muted-foreground" delay={4800}>
        {"  "}✓ SES Receipt Rule Set
      </AnimatedSpan>
      <AnimatedSpan className="text-muted-foreground" delay={5100}>
        {"  "}✓ SES Receipt Rule
      </AnimatedSpan>
      <AnimatedSpan className="text-muted-foreground" delay={5400}>
        {"  "}✓ Lambda: wraps-inbound-processor
      </AnimatedSpan>
      <AnimatedSpan className="text-muted-foreground" delay={5700}>
        {"  "}✓ EventBridge Rule: wraps-inbound-events
      </AnimatedSpan>
      <AnimatedSpan className="text-muted-foreground" delay={6000}>
        {"  "}✓ IAM Policies configured
      </AnimatedSpan>

      <AnimatedSpan className="text-success" delay={7000}>
        ✓ Inbound infrastructure deployed!
      </AnimatedSpan>

      <AnimatedSpan className="text-brand-text" delay={7500}>
        MX Record: 10 inbound-smtp.us-east-1.amazonaws.com
      </AnimatedSpan>

      <AnimatedSpan className="text-muted-foreground" delay={8000}>
        Next: Add the MX record to your DNS
      </AnimatedSpan>
    </Terminal>
  );
}

// Email JSON structure preview using CodeTabs
export function EmailJsonPreview() {
  const codes = {
    "InboundEmail.json": `{
  "emailId": "inb_a1b2c3d4",
  "receivedAt": "2024-01-15T10:30:00Z",
  "from": {
    "address": "customer@example.com",
    "name": "John Doe"
  },
  "to": [{ "address": "support@yourapp.com" }],
  "subject": "Order #12345 Question",
  "html": "<p>Hi, I have a question...</p>",
  "text": "Hi, I have a question...",
  "attachments": [{
    "id": "att_xyz789",
    "filename": "receipt.pdf",
    "contentType": "application/pdf",
    "size": 45678
  }],
  "spamVerdict": "PASS",
  "virusVerdict": "PASS"
}`,
  };

  return <CodeTabs className="my-6" codes={codes} copyButton lang="json" />;
}
