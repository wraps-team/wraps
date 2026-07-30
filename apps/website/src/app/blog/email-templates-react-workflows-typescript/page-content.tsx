"use client";

import { Card } from "@wraps/ui/components/ui/card";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Code2,
  GitBranch,
  Layout,
  Mail,
  Pause,
  Play,
  RotateCcw,
  Send,
  X,
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
    code.includes("import ") ||
    code.includes("export ") ||
    code.includes("<") ||
    code.includes("const ")
  ) {
    if (code.includes("tsx") || code.includes("React") || code.includes("<")) {
      return "tsx";
    }
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

// Compilation pipeline diagram with animation
export function CompilationDiagram() {
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const steps = [
    { id: "esbuild", label: "esbuild", icon: Zap, color: "yellow" as const },
    {
      id: "proxy",
      label: "Proxy",
      icon: Code2,
      color: "violet" as const,
    },
    {
      id: "react-email",
      label: "React Email",
      icon: Mail,
      color: "blue" as const,
    },
    { id: "ses", label: "SES", icon: Send, color: "orange" as const },
    {
      id: "dashboard",
      label: "Dashboard",
      icon: Layout,
      color: "green" as const,
    },
    {
      id: "lockfile",
      label: "Lockfile",
      icon: GitBranch,
      color: "purple" as const,
    },
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
    yellow: {
      bg: "bg-yellow-500/10 dark:bg-yellow-500/20",
      border: "border-yellow-500/50",
      text: "text-yellow-600 dark:text-yellow-400",
      glow: "shadow-yellow-500/25",
    },
    violet: {
      bg: "bg-violet-500/10 dark:bg-violet-500/20",
      border: "border-violet-500/50",
      text: "text-violet-600 dark:text-violet-400",
      glow: "shadow-violet-500/25",
    },
    blue: {
      bg: "bg-blue-500/10 dark:bg-blue-500/20",
      border: "border-blue-500/50",
      text: "text-blue-600 dark:text-blue-400",
      glow: "shadow-blue-500/25",
    },
    orange: {
      bg: "bg-orange-500/10 dark:bg-orange-500/20",
      border: "border-orange-500/50",
      text: "text-orange-600 dark:text-orange-400",
      glow: "shadow-orange-500/25",
    },
    green: {
      bg: "bg-green-500/10 dark:bg-green-500/20",
      border: "border-green-500/50",
      text: "text-green-600 dark:text-green-400",
      glow: "shadow-green-500/25",
    },
    purple: {
      bg: "bg-purple-500/10 dark:bg-purple-500/20",
      border: "border-purple-500/50",
      text: "text-purple-600 dark:text-purple-400",
      glow: "shadow-purple-500/25",
    },
  };

  const descriptions = [
    "TypeScript compiled to JavaScript with esbuild",
    "Props extracted for dashboard variable editing",
    "React components rendered to HTML via React Email",
    "HTML uploaded to SES as a named template",
    "Template synced to dashboard for visual editing",
    "Lockfile written to prevent overwrite conflicts",
  ];

  return (
    <Card className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h4 className="font-semibold text-foreground text-lg">
          Template Compilation Pipeline
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
                      index < activeStep
                        ? "text-violet-600 dark:text-violet-500"
                        : "text-muted-foreground/50"
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

// Workflow code examples with tabs
export function WorkflowCodeTabs() {
  const codes = {
    "Welcome Sequence": `import {
  defineWorkflow, sendEmail, delay,
} from '@wraps.dev/client';

export default defineWorkflow({
  name: 'Welcome Sequence',
  trigger: { type: 'event', eventName: 'contact.subscribed' },

  steps: [
    sendEmail('send-welcome', {
      template: 'welcome',
    }),

    delay('wait-3d', { days: 3 }),

    sendEmail('send-tips', {
      template: 'getting-started-tips',
    }),

    delay('wait-7d', { days: 7 }),

    sendEmail('send-case-study', {
      template: 'case-study',
    }),
  ],
});`,
    Cascade: `import {
  defineWorkflow, cascade,
} from '@wraps.dev/client';

export default defineWorkflow({
  name: 'Re-engagement',
  trigger: { type: 'event', eventName: 'contact.inactive' },

  steps: [
    // Cascade: try each channel, stop on engagement
    ...cascade('re-engage', {
      channels: [
        { type: 'email', template: 'we-miss-you', wait: { days: 3 } },
        { type: 'email', template: 'special-offer', wait: { days: 5 } },
        { type: 'email', template: 'last-chance' },
      ],
    }),
  ],
});`,
    "Event Trigger": `import {
  defineWorkflow, sendEmail, condition,
} from '@wraps.dev/client';

export default defineWorkflow({
  name: 'Order Confirmation',
  trigger: { type: 'event', eventName: 'order.completed' },

  steps: [
    sendEmail('send-receipt', {
      template: 'order-receipt',
    }),

    condition('check-vip', {
      field: 'event.total',
      operator: 'greater_than',
      value: 100,
      branches: {
        yes: [
          sendEmail('send-vip-thanks', {
            template: 'vip-thank-you',
          }),
        ],
        no: [],
      },
    }),
  ],
});`,
  };

  return <CodeTabs className="my-6" codes={codes} lang="typescript" />;
}

// Expandable workflow steps table
export function WorkflowStepsTable() {
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const steps = [
    {
      type: "sendEmail",
      description:
        "Send an email using a named template with variable substitution",
      example: `sendEmail('send-welcome', {
  template: 'welcome',
  subject: 'Welcome!', // optional override
})`,
    },
    {
      type: "delay",
      description:
        "Wait a duration before continuing (minutes, hours, days, weeks)",
      example: `delay('wait-3d', { days: 3 })
delay('wait-2h', { hours: 2 })
delay('short-pause', { minutes: 30 })`,
    },
    {
      type: "condition",
      description: "Branch on a field comparison with yes/no paths",
      example: `condition('check-plan', {
  field: 'contact.plan',
  operator: 'equals',
  value: 'pro',
  branches: {
    yes: [sendEmail('pro-email', { template: 'pro-tips' })],
    no: [sendEmail('free-email', { template: 'upgrade-cta' })],
  },
})`,
    },
    {
      type: "cascade",
      description: "Try channels sequentially, stop when the contact engages",
      example: `// Must be spread into steps array
...cascade('re-engage', {
  channels: [
    { type: 'email', template: 'nudge-1', wait: { days: 3 } },
    { type: 'email', template: 'nudge-2', wait: { days: 5 } },
    { type: 'email', template: 'final' },
  ],
})`,
    },
  ];

  return (
    <div className="my-6 overflow-hidden rounded-xl border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left font-semibold text-sm">
              Primitive
            </th>
            <th className="px-4 py-3 text-left font-semibold text-sm">
              Description
            </th>
            <th className="w-12 px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => (
            <Fragment key={s.type}>
              <tr
                className="cursor-pointer border-b transition-colors hover:bg-muted/30"
                onClick={() => setExpandedRow(expandedRow === i ? null : i)}
              >
                <td className="px-4 py-3">
                  <code className="rounded bg-violet-500/10 px-2 py-1 font-mono text-violet-600 text-sm dark:text-violet-400">
                    {s.type}
                  </code>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-sm">
                  {s.description}
                </td>
                <td className="px-4 py-3">
                  {expandedRow === i ? (
                    <ChevronUp className="text-muted-foreground" size={16} />
                  ) : (
                    <ChevronDown className="text-muted-foreground" size={16} />
                  )}
                </td>
              </tr>
              {expandedRow === i && (
                <tr>
                  <td className="bg-muted/20 px-4 py-3" colSpan={3}>
                    <CodeTabs
                      codes={{ example: s.example }}
                      copyButton
                      lang="typescript"
                    />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Traditional vs Wraps comparison table
export function GuaranteeComparison() {
  const rows = [
    {
      dimension: "Templates",
      traditional: "GUI editor only",
      wraps: "React components + GUI",
    },
    {
      dimension: "Version control",
      traditional: "Manual exports",
      wraps: "Git-native",
    },
    { dimension: "Type safety", traditional: "None", wraps: "Full TypeScript" },
    {
      dimension: "Code review",
      traditional: "Screenshot diffs",
      wraps: "PR diffs",
    },
    {
      dimension: "Workflows",
      traditional: "Drag-and-drop",
      wraps: "TypeScript + visual builder",
    },
    {
      dimension: "Testing",
      traditional: "Manual sends",
      wraps: "Unit testable",
    },
    {
      dimension: "Rollback",
      traditional: "Manual restore",
      wraps: "git revert",
    },
    {
      dimension: "Collaboration",
      traditional: "One editor at a time",
      wraps: "Branches + PRs",
    },
  ];

  return (
    <div className="my-6 overflow-hidden rounded-xl border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left font-semibold text-sm" />
            <th className="px-4 py-3 text-left font-semibold text-sm">
              Traditional
            </th>
            <th className="px-4 py-3 text-left font-semibold text-sm">Wraps</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr className="border-b" key={row.dimension}>
              <td className="px-4 py-3 font-medium text-sm">{row.dimension}</td>
              <td className="px-4 py-3">
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  <X className="text-red-400" size={14} />
                  {row.traditional}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="flex items-center gap-2 text-sm">
                  <Check className="text-green-500" size={14} />
                  {row.wraps}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// SDK send examples with tabs
export function SdkCodeTabs() {
  const codes = {
    "Templated Send": `import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

await email.sendTemplate({
  from: 'hello@yourapp.com',
  to: 'user@example.com',
  template: 'welcome',
  templateData: {
    name: 'Jane',
    activationUrl: 'https://yourapp.com/activate?token=abc',
  },
});`,
    "React Email Send": `import { WrapsEmail } from '@wraps.dev/email';
import { WelcomeEmail } from './templates/welcome';
import { render } from '@react-email/render';

const email = new WrapsEmail();

const html = await render(
  WelcomeEmail({ name: 'Jane' })
);

await email.send({
  from: 'hello@yourapp.com',
  to: 'user@example.com',
  subject: 'Welcome to YourApp!',
  html,
});`,
  };

  return <CodeTabs className="my-6" codes={codes} lang="typescript" />;
}

// CLI Demo terminal animation
export function CLIDemo() {
  return (
    <Terminal className="my-6 max-w-full">
      <TypingAnimation delay={0} duration={40}>
        npx @wraps.dev/cli email templates init
      </TypingAnimation>

      <AnimatedSpan className="text-muted-foreground" delay={1500}>
        ◐ Scaffolding templates directory...
      </AnimatedSpan>

      <AnimatedSpan className="text-green-500" delay={2500}>
        ✓ Created wraps/templates/
      </AnimatedSpan>

      <AnimatedSpan className="text-muted-foreground" delay={2800}>
        {"  "}✓ welcome.tsx
      </AnimatedSpan>
      <AnimatedSpan className="text-muted-foreground" delay={3100}>
        {"  "}✓ brand.ts
      </AnimatedSpan>
      <AnimatedSpan className="text-muted-foreground" delay={3400}>
        {"  "}✓ wraps.config.ts
      </AnimatedSpan>

      <AnimatedSpan className="text-green-500" delay={4200}>
        ✓ Templates initialized!
      </AnimatedSpan>

      <AnimatedSpan className="text-muted-foreground" delay={5000}>
        {" "}
      </AnimatedSpan>

      <TypingAnimation delay={5500} duration={40}>
        npx @wraps.dev/cli email templates push
      </TypingAnimation>

      <AnimatedSpan className="text-muted-foreground" delay={7000}>
        ◐ Compiling templates...
      </AnimatedSpan>

      <AnimatedSpan className="text-muted-foreground" delay={7800}>
        {"  "}✓ welcome.tsx → welcome (esbuild 12ms)
      </AnimatedSpan>

      <AnimatedSpan className="text-muted-foreground" delay={8400}>
        ◐ Uploading to SES...
      </AnimatedSpan>

      <AnimatedSpan className="text-green-500" delay={9200}>
        ✓ 1 template pushed to SES
      </AnimatedSpan>

      <AnimatedSpan className="text-violet-500" delay={9800}>
        ✓ Dashboard synced
      </AnimatedSpan>

      <AnimatedSpan className="text-muted-foreground" delay={10_400}>
        ✓ Lockfile updated
      </AnimatedSpan>
    </Terminal>
  );
}
