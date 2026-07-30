"use client";

import { Card } from "@wraps/ui/components/ui/card";
import {
  ArrowRight,
  Check,
  Copy,
  Database,
  Mail,
  Pause,
  Play,
  RotateCcw,
  Server,
  Terminal,
  Zap,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";

// Animated typing effect hook
function useTypingEffect(
  text: string,
  speed = 50,
  startDelay = 0
): { displayText: string; isComplete: boolean } {
  const [displayText, setDisplayText] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    const startTimeout = setTimeout(() => {
      setHasStarted(true);
    }, startDelay);
    return () => clearTimeout(startTimeout);
  }, [startDelay]);

  useEffect(() => {
    if (!hasStarted) {
      return;
    }
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        setDisplayText(text.slice(0, i + 1));
        i++;
      } else {
        setIsComplete(true);
        clearInterval(timer);
      }
    }, speed);
    return () => clearInterval(timer);
  }, [text, speed, hasStarted]);

  return { displayText, isComplete };
}

// Code block with copy functionality
type CodeBlockProps = {
  code: string;
  title?: string;
  animate?: boolean;
};

export function CodeBlock({ code, title, animate = false }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const { displayText, isComplete } = useTypingEffect(
    code,
    animate ? 30 : 0,
    animate ? 500 : 0
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-muted/30 shadow-2xl">
      {title && (
        <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="h-3 w-3 rounded-full bg-red-500/80" />
              <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
              <div className="h-3 w-3 rounded-full bg-green-500/80" />
            </div>
            <span className="ml-2 font-medium text-muted-foreground text-sm">
              {title}
            </span>
          </div>
          <button
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={handleCopy}
            type="button"
          >
            {copied ? (
              <Check
                className="text-emerald-600 dark:text-emerald-400"
                size={16}
              />
            ) : (
              <Copy size={16} />
            )}
          </button>
        </div>
      )}
      <pre className="overflow-x-auto p-4">
        <code className="font-mono text-foreground/80 text-sm">
          {animate ? displayText : code}
          {animate && !isComplete && (
            <span className="animate-pulse text-emerald-600 dark:text-emerald-400">
              ▋
            </span>
          )}
        </code>
      </pre>
    </div>
  );
}

// Animated counter
type AnimatedCounterProps = {
  end: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
};

export function AnimatedCounter({
  end,
  duration = 2000,
  suffix = "",
  prefix = "",
}: AnimatedCounterProps) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) {
      observer.observe(ref.current);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) {
      return;
    }
    let start = 0;
    const increment = end / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [end, duration, isVisible]);

  return (
    <span ref={ref}>
      {prefix}
      {count}
      {suffix}
    </span>
  );
}

// Architecture diagram with animation
export function ArchitectureDiagram() {
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  const steps = [
    { id: "ses", label: "SES", icon: Mail, color: "emerald" as const },
    {
      id: "eventbridge",
      label: "EventBridge",
      icon: Zap,
      color: "blue" as const,
    },
    { id: "sqs", label: "SQS", icon: Server, color: "purple" as const },
    {
      id: "lambda",
      label: "Lambda",
      icon: Terminal,
      color: "orange" as const,
    },
    {
      id: "dynamodb",
      label: "DynamoDB",
      icon: Database,
      color: "pink" as const,
    },
  ];

  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % steps.length);
    }, 1500);
    return () => clearInterval(timer);
  }, [isPlaying, steps.length]);

  const colorClasses = {
    emerald: {
      bg: "bg-emerald-500/10 dark:bg-emerald-500/20",
      border: "border-emerald-500/50",
      text: "text-emerald-600 dark:text-emerald-400",
      glow: "shadow-emerald-500/25",
    },
    blue: {
      bg: "bg-blue-500/10 dark:bg-blue-500/20",
      border: "border-blue-500/50",
      text: "text-blue-600 dark:text-blue-400",
      glow: "shadow-blue-500/25",
    },
    purple: {
      bg: "bg-purple-500/10 dark:bg-purple-500/20",
      border: "border-purple-500/50",
      text: "text-purple-600 dark:text-purple-400",
      glow: "shadow-purple-500/25",
    },
    orange: {
      bg: "bg-orange-500/10 dark:bg-orange-500/20",
      border: "border-orange-500/50",
      text: "text-orange-600 dark:text-orange-400",
      glow: "shadow-orange-500/25",
    },
    pink: {
      bg: "bg-pink-500/10 dark:bg-pink-500/20",
      border: "border-pink-500/50",
      text: "text-pink-600 dark:text-pink-400",
      glow: "shadow-pink-500/25",
    },
  };

  const descriptions = [
    "Email sent through SES triggers delivery events",
    "EventBridge captures and routes SES events",
    "SQS buffers events for reliable processing",
    "Lambda processes events in real-time",
    "DynamoDB stores your complete email history",
  ];

  return (
    <Card className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h4 className="font-semibold text-foreground text-lg">
          Event Processing Architecture
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

      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
        {steps.map((step, index) => {
          const colors = colorClasses[step.color];
          const isActive = index === activeStep;
          const isPast = index < activeStep;
          const Icon = step.icon;

          return (
            <Fragment key={step.id}>
              <div
                className={`flex min-w-[100px] flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all duration-500 ${
                  isActive
                    ? `${colors.bg} ${colors.border} shadow-lg ${colors.glow}`
                    : "border-border bg-muted/30"
                } ${isPast ? "opacity-50" : ""}`}
              >
                <Icon
                  className={isActive ? colors.text : "text-muted-foreground"}
                  size={24}
                />
                <span
                  className={`font-medium text-sm ${
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
                        ? "text-emerald-600 dark:text-emerald-500"
                        : "text-muted-foreground/50"
                    }`}
                    size={20}
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

// Comparison table
export function ComparisonTable() {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);

  const comparisons = [
    {
      task: "Time to first email",
      manual: "4-8 hours",
      wraps: "~2 minutes",
      savings: "95%+",
    },
    {
      task: "DNS configuration",
      manual: "Manual lookup",
      wraps: "Auto-generated",
      savings: "100%",
    },
    {
      task: "IAM policies",
      manual: "Write from scratch",
      wraps: "Least-privilege included",
      savings: "100%",
    },
    {
      task: "Event tracking",
      manual: "Build pipeline",
      wraps: "One command",
      savings: "95%",
    },
    {
      task: "Credential management",
      manual: "Store secrets",
      wraps: "OIDC (zero secrets)",
      savings: "100%",
    },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border">
      <table className="w-full">
        <thead>
          <tr className="bg-muted/50">
            <th className="px-6 py-4 text-left font-semibold text-foreground/80 text-sm">
              Task
            </th>
            <th className="px-6 py-4 text-left font-semibold text-red-600 dark:text-red-400 text-sm">
              Manual SES
            </th>
            <th className="px-6 py-4 text-left font-semibold text-emerald-600 dark:text-emerald-400 text-sm">
              With Wraps
            </th>
          </tr>
        </thead>
        <tbody>
          {comparisons.map((row, index) => (
            <tr
              className={`border-t transition-colors duration-200 ${
                hoveredRow === index ? "bg-muted/30" : ""
              }`}
              key={row.task}
              onMouseEnter={() => setHoveredRow(index)}
              onMouseLeave={() => setHoveredRow(null)}
            >
              <td className="px-6 py-4 text-foreground/80 text-sm">
                {row.task}
              </td>
              <td className="px-6 py-4 text-muted-foreground text-sm">
                {row.manual}
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 text-sm">
                    {row.wraps}
                  </span>
                  {hoveredRow === index && (
                    <span className="animate-fade-in rounded-full bg-emerald-500/10 dark:bg-emerald-500/20 px-2 py-0.5 text-emerald-600 dark:text-emerald-400 text-xs">
                      {row.savings} less work
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Preset cards
export function PresetCards() {
  const [selected, setSelected] = useState("production");

  const presets = [
    {
      id: "starter",
      name: "Starter",
      cost: "~$0.05",
      description: "MVPs & side projects",
      features: [
        "Open & click tracking",
        "Bounce suppression",
        "Basic metrics",
      ],
    },
    {
      id: "production",
      name: "Production",
      cost: "~$2-5",
      description: "Most production apps",
      features: [
        "Real-time event tracking",
        "90-day email history",
        "All event types",
        "Reputation metrics",
      ],
    },
    {
      id: "enterprise",
      name: "Enterprise",
      cost: "~$50-100",
      description: "High-volume & compliance",
      features: [
        "Dedicated IP address",
        "1-year retention",
        "All 10 SES event types",
        "Priority support",
      ],
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {presets.map((preset) => (
        <button
          className={`relative rounded-2xl p-6 text-left transition-all duration-300 ${
            selected === preset.id
              ? "border-2 border-emerald-500/50 bg-emerald-500/5 dark:bg-emerald-500/10 shadow-lg shadow-emerald-500/10"
              : "border-2 border-border bg-muted/30 hover:border-muted-foreground/30"
          }`}
          key={preset.id}
          onClick={() => setSelected(preset.id)}
          type="button"
        >
          <h4 className="font-semibold text-foreground text-lg">
            {preset.name}
          </h4>
          <p className="mt-1 font-bold text-2xl text-emerald-600 dark:text-emerald-400">
            {preset.cost}
            <span className="font-normal text-muted-foreground text-sm">
              /mo
            </span>
          </p>
          <p className="mt-2 text-muted-foreground text-sm">
            {preset.description}
          </p>
          <ul className="mt-4 space-y-2">
            {preset.features.map((feature) => (
              <li
                className="flex items-center gap-2 text-foreground/80 text-sm"
                key={feature}
              >
                <Check
                  className="text-emerald-600 dark:text-emerald-500"
                  size={14}
                />
                {feature}
              </li>
            ))}
          </ul>
        </button>
      ))}
    </div>
  );
}

// Interactive CLI demo
export function CLIDemo() {
  const [step, setStep] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const steps = [
    {
      command: "npx @wraps.dev/cli email init",
      output: "◐ Validating AWS credentials...",
    },
    {
      command: "",
      output: "✓ AWS credentials valid (account: 123456789012)",
    },
    { command: "", output: "◐ Deploying infrastructure via Pulumi..." },
    {
      command: "",
      output:
        "  ✓ IAM Role: wraps-email-role\n  ✓ IAM Policy: wraps-email-policy\n  ✓ SES Config Set: wraps-email-config-set\n  ✓ EventBridge Rule: wraps-email-events\n  ✓ SQS Queue: wraps-email-queue\n  ✓ Lambda: wraps-email-processor\n  ✓ DynamoDB: wraps-email-history",
    },
    {
      command: "",
      output:
        "✓ Infrastructure deployed successfully!\n\n  Dashboard: http://localhost:3000\n  Docs: https://wraps.dev/docs\n\n  Next: Add a domain with `wraps email domains add -d yourdomain.com`",
    },
  ];

  const runDemo = () => {
    setIsRunning(true);
    setStep(0);

    steps.forEach((_, index) => {
      setTimeout(() => {
        setStep(index);
        if (index === steps.length - 1) {
          setTimeout(() => setIsRunning(false), 500);
        }
      }, index * 1200);
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-muted/30">
      <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500/80" />
            <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
            <div className="h-3 w-3 rounded-full bg-green-500/80" />
          </div>
          <span className="ml-2 font-medium text-muted-foreground text-sm">
            Terminal
          </span>
        </div>
        <button
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium text-sm transition-all ${
            isRunning
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 dark:hover:bg-emerald-500/30"
          }`}
          disabled={isRunning}
          onClick={runDemo}
          type="button"
        >
          <Play size={14} />
          {isRunning ? "Running..." : "Run Demo"}
        </button>
      </div>

      <div className="min-h-[300px] p-4 font-mono text-sm">
        {step >= 0 && steps[0].command && (
          <div className="mb-2 flex items-center gap-2 text-foreground/80">
            <span className="text-emerald-600 dark:text-emerald-400">$</span>
            <span>{steps[0].command}</span>
          </div>
        )}

        {steps.slice(0, step + 1).map((s, index) => (
          <div
            className="mb-2 whitespace-pre-wrap text-muted-foreground"
            key={index}
          >
            {s.output}
          </div>
        ))}

        {isRunning && (
          <span className="animate-pulse text-emerald-600 dark:text-emerald-400">
            ▋
          </span>
        )}
      </div>
    </div>
  );
}

// Tab component for code examples
export function CodeTabs() {
  const [activeTab, setActiveTab] = useState("send");

  const tabs: Record<string, { label: string; code: string }> = {
    send: {
      label: "Send Email",
      code: `import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

await email.send({
  from: 'hello@yourdomain.com',
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Hello from Wraps!</h1>',
});`,
    },
    batch: {
      label: "Batch Send",
      code: `import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail();

// Unique content per recipient, one SES call (max 100)
await email.sendBatch({
  from: 'updates@yourdomain.com',
  entries: [
    { to: 'alice@example.com', subject: 'Product Update', html: '<h1>Hi Alice</h1>' },
    { to: 'bob@example.com', subject: 'Product Update', html: '<h1>Hi Bob</h1>' },
  ],
});`,
    },
    events: {
      label: "Track Events",
      code: `import { createPlatformClient } from '@wraps.dev/client';

const wraps = createPlatformClient({ apiKey: 'sk_...' });

await wraps.track('order.completed', {
  contactEmail: 'user@example.com',
  properties: {
    orderId: 'ord_123',
    total: 99.99,
  },
});`,
    },
  };

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex border-b bg-muted/30">
        {Object.entries(tabs).map(([key, { label }]) => (
          <button
            className={`relative px-4 py-3 font-medium text-sm transition-colors ${
              activeTab === key
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-muted-foreground hover:text-foreground/80"
            }`}
            key={key}
            onClick={() => setActiveTab(key)}
            type="button"
          >
            {label}
            {activeTab === key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-500" />
            )}
          </button>
        ))}
      </div>
      <CodeBlock code={tabs[activeTab].code} />
    </div>
  );
}
