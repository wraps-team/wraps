"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { Card } from "@wraps/ui/components/ui/card";
import {
  AlertTriangle,
  ArrowRight,
  Building,
  CheckCircle,
  ChevronDown,
  Lock,
  Server,
  Shield,
  ShieldAlert,
  ShieldOff,
  Terminal,
  XCircle,
} from "lucide-react";
import type * as React from "react";
import { useEffect, useState } from "react";
import { trackEvent } from "@/utils/analytics";

// Animated email headers scrolling in hero section only
export const EmailHeaderScroller = () => {
  const headers = [
    {
      from: "ceo@yourcompany.com",
      auth: "dmarc=fail (p=none)",
      status: "delivered",
      type: "spoof",
    },
    {
      from: "support@bigbank.com",
      auth: "dmarc=pass",
      status: "delivered",
      type: "legit",
    },
    {
      from: "hr@targetcorp.com",
      auth: "dmarc=fail (p=none)",
      status: "delivered",
      type: "spoof",
    },
    {
      from: "billing@saas-vendor.io",
      auth: "spf=softfail dkim=none",
      status: "delivered",
      type: "spoof",
    },
    {
      from: "noreply@healthcare.nz",
      auth: "dmarc=fail (p=none)",
      status: "delivered",
      type: "spoof",
    },
    {
      from: "security@company.com",
      auth: "dmarc=pass",
      status: "delivered",
      type: "legit",
    },
    {
      from: "invoices@supplier.com",
      auth: "dmarc=fail (p=quarantine)",
      status: "quarantined",
      type: "blocked",
    },
    {
      from: "wire-transfer@bank.com",
      auth: "dmarc=fail (p=none)",
      status: "delivered",
      type: "spoof",
    },
    {
      from: "admin@gov-agency.gov",
      auth: "dmarc=pass",
      status: "delivered",
      type: "legit",
    },
    {
      from: "payroll@enterprise.com",
      auth: "dmarc=fail (p=none)",
      status: "delivered",
      type: "spoof",
    },
    {
      from: "alerts@monitoring.io",
      auth: "dmarc=fail (p=reject)",
      status: "rejected",
      type: "blocked",
    },
    {
      from: "cfo@fortune500.com",
      auth: "dmarc=fail (p=none)",
      status: "delivered",
      type: "spoof",
    },
  ];

  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setOffset((prev) => (prev + 1) % (headers.length * 60));
    }, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 mx-auto w-2xl opacity-60 dark:opacity-55">
      <div
        className="whitespace-nowrap text-left font-mono text-foreground text-xs"
        style={{ transform: `translateY(-${offset}px)` }}
      >
        {[...new Array(30)].map((_, i) => (
          <div className="py-1" key={i}>
            {headers.map((h, j) => (
              <div className="py-0.5" key={`${i}-${j}`}>
                <span
                  className="text-muted-foreground"
                  suppressHydrationWarning
                >
                  {new Date(
                    Date.now() - (i * headers.length + j) * 1000
                  ).toISOString()}
                </span>{" "}
                <span
                  className={
                    h.type === "spoof"
                      ? "text-destructive"
                      : h.type === "blocked"
                        ? "text-warning"
                        : "text-success"
                  }
                >
                  {h.status.toUpperCase()}
                </span>{" "}
                <span className="text-info">From:</span> {h.from}{" "}
                <span className="text-brand-text">{h.auth}</span>
                {h.type === "spoof" && (
                  <span className="ml-2 text-destructive">SPOOFED</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

// DMARC Policy Simulator
export const DMARCSimulator = () => {
  const [policy, setPolicy] = useState("none");
  const [incomingEmails, setIncomingEmails] = useState<
    {
      from: string;
      legit: boolean;
      passes: boolean;
      label?: string;
      outcome: string;
      timestamp: string;
      id: number;
    }[]
  >([]);
  const [stats, setStats] = useState({
    delivered: 0,
    quarantined: 0,
    rejected: 0,
    spoofed: 0,
  });

  const emailTypes = [
    { from: "newsletter@yourcompany.com", legit: true, passes: true },
    {
      from: "ceo@yourcompany.com",
      legit: false,
      passes: false,
      label: "SPOOFED by attacker",
    },
    { from: "support@yourcompany.com", legit: true, passes: true },
    {
      from: "hr@yourcompany.com",
      legit: false,
      passes: false,
      label: "BEC attack",
    },
    { from: "billing@yourcompany.com", legit: true, passes: true },
    {
      from: "wire-transfer@yourcompany.com",
      legit: false,
      passes: false,
      label: "$4.7M fraud attempt",
    },
  ];

  useEffect(() => {
    const simulateEmail = () => {
      const email = emailTypes[Math.floor(Math.random() * emailTypes.length)];
      let outcome: string;

      if (email.passes) {
        outcome = "delivered";
      } else if (policy === "none") {
        outcome = "delivered";
      } else if (policy === "quarantine") {
        outcome = "quarantined";
      } else {
        outcome = "rejected";
      }

      const newEmail = {
        ...email,
        outcome,
        timestamp: new Date().toLocaleTimeString(),
        id: Date.now(),
      };

      setIncomingEmails((prev) => [newEmail, ...prev].slice(0, 8));
      setStats((prev) => ({
        ...prev,
        [outcome]: prev[outcome as keyof typeof prev] + 1,
        spoofed:
          prev.spoofed + (email.legit ? 0 : outcome === "delivered" ? 1 : 0),
      }));
    };

    const interval = setInterval(simulateEmail, 1500);
    return () => clearInterval(interval);
  }, [policy]);

  return (
    <Card className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-lg">
          DMARC Policy Simulator
        </h3>
        <div className="flex gap-2">
          {(["none", "quarantine", "reject"] as const).map((p) => (
            <button
              className={`rounded px-3 py-1 font-mono text-sm transition-all ${
                policy === p
                  ? p === "none"
                    ? "bg-destructive text-destructive-foreground"
                    : p === "quarantine"
                      ? "bg-warning text-warning-foreground"
                      : "bg-success text-success-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
              key={p}
              onClick={() => {
                setPolicy(p);
                setStats({
                  delivered: 0,
                  quarantined: 0,
                  rejected: 0,
                  spoofed: 0,
                });
                setIncomingEmails([]);
              }}
            >
              p={p}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-4">
        <div className="rounded-lg bg-muted p-3 text-center">
          <div className="font-bold text-2xl text-success">
            {stats.delivered}
          </div>
          <div className="text-muted-foreground text-xs">Delivered</div>
        </div>
        <div className="rounded-lg bg-muted p-3 text-center">
          <div className="font-bold text-2xl text-warning">
            {stats.quarantined}
          </div>
          <div className="text-muted-foreground text-xs">Quarantined</div>
        </div>
        <div className="rounded-lg bg-muted p-3 text-center">
          <div className="font-bold text-2xl text-info">{stats.rejected}</div>
          <div className="text-muted-foreground text-xs">Rejected</div>
        </div>
        <div className="rounded-lg bg-muted p-3 text-center">
          <div className="font-bold text-2xl text-destructive">
            {stats.spoofed}
          </div>
          <div className="text-muted-foreground text-xs">
            Spoofed & Delivered
          </div>
        </div>
      </div>

      <div className="max-h-64 space-y-2 overflow-y-auto">
        {incomingEmails.map((email) => (
          <div
            className={`flex items-center justify-between rounded-lg p-3 font-mono text-sm ${
              email.outcome === "delivered" && !email.legit
                ? "border border-destructive/50 bg-destructive/10"
                : email.outcome === "quarantined"
                  ? "border border-warning/50 bg-warning/10"
                  : "border bg-muted"
            }`}
            key={email.id}
          >
            <div className="flex items-center gap-3">
              {email.legit ? (
                <CheckCircle className="h-4 w-4 text-success" />
              ) : (
                <ShieldOff className="h-4 w-4 text-destructive" />
              )}
              <span className="text-foreground">{email.from}</span>
              {email.label && (
                <span className="text-destructive text-xs">
                  ({email.label})
                </span>
              )}
            </div>
            <div
              className={`rounded px-2 py-0.5 text-xs ${
                email.outcome === "delivered" && !email.legit
                  ? "bg-destructive text-destructive-foreground"
                  : email.outcome === "delivered"
                    ? "bg-success text-success-foreground"
                    : email.outcome === "quarantined"
                      ? "bg-warning text-black"
                      : "bg-muted-foreground text-background"
              }`}
            >
              {email.outcome}
            </div>
          </div>
        ))}
      </div>

      {policy === "none" && stats.spoofed > 0 && (
        <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-destructive text-sm dark:text-destructive">
            <AlertTriangle className="mr-2 inline h-4 w-4" />
            <strong>{stats.spoofed} spoofed emails delivered.</strong> Your
            p=none policy tells receivers not to enforce authentication
            failures. While some providers may still filter, your domain is
            easier to spoof.
          </p>
        </div>
      )}

      {policy === "reject" && (
        <div className="mt-4 rounded-lg border border-success/50 bg-success/10 p-3">
          <p className="text-success text-sm dark:text-success">
            <Shield className="mr-2 inline h-4 w-4" />
            <strong>Full protection requested.</strong> Major email providers
            will reject spoofed emails.
          </p>
        </div>
      )}
    </Card>
  );
};

// Email Authentication Explainer
export const AuthExplainer = () => {
  const [activeTab, setActiveTab] = useState<"spf" | "dkim" | "dmarc">("spf");

  const content = {
    spf: {
      title: "SPF (Sender Policy Framework)",
      icon: <Server className="h-5 w-5" />,
      description:
        "Specifies which mail servers are authorized to send email for your domain.",
      record: "v=spf1 include:_spf.google.com include:amazonses.com ~all",
      problem:
        "Only checks envelope sender (Return-Path), not the From: header users see. Breaks with forwarding.",
      color: "blue",
    },
    dkim: {
      title: "DKIM (DomainKeys Identified Mail)",
      icon: <Lock className="h-5 w-5" />,
      description:
        "Cryptographically signs emails to prove they haven't been tampered with.",
      record: "v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4...",
      problem:
        "Doesn't specify what to do when verification fails. Emails can still be delivered.",
      color: "purple",
    },
    dmarc: {
      title: "DMARC (Domain-based Message Authentication)",
      icon: <Shield className="h-5 w-5" />,
      description:
        "Tells receivers what to do when SPF/DKIM fail, and where to send reports.",
      record: "v=DMARC1; p=reject; rua=mailto:dmarc@company.com",
      problem:
        "Most domains set p=none (monitoring only), telling receivers not to enforce failures.",
      color: "green",
    },
  };

  const c = content[activeTab];
  const colors: Record<string, string> = {
    blue: "border-l-info bg-info/10",
    purple: "border-l-brand bg-brand/10",
    green: "border-l-success bg-success/10",
  };

  return (
    <Card className="p-6">
      <div className="mb-6 flex gap-2">
        {(Object.keys(content) as Array<keyof typeof content>).map((key) => (
          <button
            className={`rounded-lg px-4 py-2 font-medium transition-all ${
              activeTab === key
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
            key={key}
            onClick={() => setActiveTab(key)}
          >
            {key.toUpperCase()}
          </button>
        ))}
      </div>

      <div className={`rounded-r-lg border-l-4 p-4 ${colors[c.color]}`}>
        <div className="mb-2 flex items-center gap-2">
          {c.icon}
          <h4 className="font-semibold text-foreground">{c.title}</h4>
        </div>
        <p className="mb-4 text-foreground/80">{c.description}</p>

        <div className="mb-4 overflow-x-auto rounded bg-muted p-3 font-mono text-muted-foreground text-sm">
          {c.record}
        </div>

        <div className="flex items-start gap-2 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            <strong>The problem:</strong> {c.problem}
          </span>
        </div>
      </div>
    </Card>
  );
};

// Real Breach Timeline
export const BreachTimeline = () => {
  const breaches = [
    {
      year: "2013-2015",
      company: "Google & Facebook",
      loss: "$122M",
      method: 'Spoofed invoices from fake hardware vendor "Quanta Computer"',
      dmarcIssue: "No sender verification on vendor emails",
      details:
        "Lithuanian scammer Evaldas Rimasauskas created fake company mimicking real vendor. Sentenced to 5 years, ordered to forfeit $49.7M.",
      source:
        "https://www.justice.gov/usao-sdny/pr/lithuanian-man-sentenced-5-years-prison-theft-over-120-million-fraudulent-business",
      sourceLabel: "DOJ Press Release",
      icon: Building,
      color: "red",
    },
    {
      year: "2015",
      company: "Ubiquiti Networks",
      loss: "$46.7M",
      method:
        "Email spoofing + employee impersonation targeting finance department",
      dmarcIssue: "No DMARC policy",
      details:
        "Attackers impersonated executives and redirected wire transfers to overseas accounts. Only $14.9M recovered. CAO resigned.",
      source:
        "https://blog.knowbe4.com/tech-firm-ubiquity-suffers-46m-cyberheist",
      sourceLabel: "KnowBe4",
      icon: Building,
      color: "red",
    },
    {
      year: "2019",
      company: "Toyota Boshoku",
      loss: "$37M",
      method:
        "Business partner impersonation with fraudulent payment instructions",
      dmarcIssue: "Third-party domain spoofing, p=none policy",
      details:
        'European subsidiary received spoofed emails from "business partner" requesting payment account changes. Company forced to amend earnings forecasts.',
      source:
        "https://www.bleepingcomputer.com/news/security/over-37-million-lost-by-toyota-boshoku-subsidiary-in-bec-scam/",
      sourceLabel: "Bleeping Computer",
      icon: Building,
      color: "orange",
    },
    {
      year: "2024",
      company: "Kimsuky APT Campaigns",
      loss: "Intelligence theft",
      method: "Spoofed journalists, academics, and think tank experts",
      dmarcIssue: "Systematically targeted orgs with p=none policies",
      details:
        "FBI/NSA/State Dept joint advisory. North Korean state hackers specifically scan for weak DMARC to enable spearphishing against US policy experts.",
      source:
        "https://www.bleepingcomputer.com/news/security/nsa-warns-of-north-korean-hackers-exploiting-weak-dmarc-email-policies/",
      sourceLabel: "NSA/FBI Advisory",
      icon: ShieldAlert,
      color: "purple",
    },
  ];

  const [expanded, setExpanded] = useState<number | null>(null);

  const getColorClasses = (color: string) => {
    switch (color) {
      case "purple":
        return {
          bg: "bg-info text-info-foreground",
          bgLight: "bg-info/10",
          text: "text-info",
        };
      case "orange":
        return {
          bg: "bg-brand text-brand-foreground",
          bgLight: "bg-brand/10",
          text: "text-brand-text",
        };
      default:
        return {
          bg: "bg-destructive text-destructive-foreground",
          bgLight: "bg-destructive/10",
          text: "text-destructive",
        };
    }
  };

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute top-0 bottom-0 left-[39px] w-0.5 bg-gradient-to-b from-destructive via-brand to-destructive md:left-[119px]" />

      <div className="space-y-6">
        {breaches.map((breach, i) => {
          const colors = getColorClasses(breach.color);
          const isExpanded = expanded === i;

          return (
            <div className="relative flex gap-4 md:gap-6" key={i}>
              {/* Year - hidden on mobile, shown on md+ */}
              <div className="hidden w-24 shrink-0 pt-3 text-right md:block">
                <span className="font-mono text-muted-foreground">
                  {breach.year}
                </span>
              </div>

              {/* Timeline node */}
              <div className="relative z-10 shrink-0">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${colors.bg} shadow-lg ring-4 ring-background`}
                >
                  <breach.icon className="h-5 w-5" />
                </div>
              </div>

              {/* Content card */}
              <div className="flex-1 pb-2">
                <button
                  className={`group w-full rounded-xl border text-left transition-all ${
                    isExpanded
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-card hover:border-primary/30 hover:bg-muted/50"
                  }`}
                  onClick={() => setExpanded(isExpanded ? null : i)}
                >
                  <div className="p-4">
                    {/* Mobile year */}
                    <div className="mb-2 font-mono text-muted-foreground text-xs md:hidden">
                      {breach.year}
                    </div>

                    {/* Header row */}
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-foreground text-lg">
                          {breach.company}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 font-mono text-sm ${colors.bgLight} ${colors.text}`}
                        >
                          {breach.loss}
                        </span>
                      </div>
                      <ChevronDown
                        className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      />
                    </div>

                    {/* Method */}
                    <p className="mb-2 text-foreground/80">{breach.method}</p>

                    {/* DMARC issue tag */}
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                      <span className="text-sm text-warning">
                        {breach.dmarcIssue}
                      </span>
                    </div>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t bg-muted/30 p-4">
                      <p className="mb-3 text-foreground/80">
                        {breach.details}
                      </p>
                      <a
                        className="inline-flex items-center gap-1.5 font-medium text-primary text-sm hover:underline"
                        href={breach.source}
                        onClick={(e) => e.stopPropagation()}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        Read full report: {breach.sourceLabel}
                        <ArrowRight className="h-4 w-4" />
                      </a>
                    </div>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Hint */}
      <p className="mt-6 text-center text-muted-foreground text-sm">
        <span className="inline-flex items-center gap-1.5">
          <ChevronDown className="h-4 w-4" />
          Click any incident to expand details
        </span>
      </p>
    </div>
  );
};

// A parked domain publishes "v=spf1 -all" and nothing else, for which -all is
// exactly right. Only records that authorize a sender get the hardfail hint.
const AUTHORIZING_MECHANISM =
  /^(?:a|mx|ptr)(?:[:/]|$)|^(?:ip4|ip6|include|exists):/i;
const SPF_TERM_SEPARATOR = /\s+/;
const SPF_REDIRECT = /^redirect=/i;
const SPF_QUALIFIER = /^[+\-~?]/;

const authorizesSenders = (record: string | null): boolean =>
  (record ?? "")
    .trim()
    .split(SPF_TERM_SEPARATOR)
    .slice(1)
    .some(
      (term) =>
        SPF_REDIRECT.test(term) ||
        AUTHORIZING_MECHANISM.test(term.replace(SPF_QUALIFIER, ""))
    );

// Real Domain Checker using Wraps API
const API_URL = "https://api.wraps.dev";

type EmailCheckResult = {
  success: boolean;
  domain: string;
  score: {
    grade: string;
    score: number;
    maxScore: number;
    breakdown?: {
      spf: { max: number; score: number };
      dkim: { max: number; score: number };
      dmarc: { max: number; score: number };
      mx: { max: number; score: number };
      blacklist: { max: number; score: number };
      bonus: { earned: number; possible: number };
    };
  };
  spf: {
    exists: boolean;
    valid: boolean;
    record: string | null;
    allMechanism: string | null;
    lookupCount?: number;
  };
  dkim: {
    found: boolean;
    selectorsFound: Array<{
      selector: string;
      keyType: string;
      keyBits: number;
    }>;
    warnings?: string[];
  };
  dmarc: {
    exists: boolean;
    valid: boolean;
    record: string | null;
    policy: string | null;
    reportingEnabled: boolean;
    subdomainPolicy?: string | null;
  };
  domainAge?: {
    ageInDays: number | null;
    createdAt: string | null;
  };
  issues: Array<{
    check: string;
    reason: string;
    severity: "critical" | "warning" | "info";
  }>;
  bonuses?: Array<{
    check: string;
    reason: string;
    points: number;
  }>;
  error?: string;
};

export const DomainChecker = () => {
  const [domain, setDomain] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<EmailCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkDomain = async () => {
    if (!domain.trim()) {
      return;
    }
    setChecking(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(`${API_URL}/tools/email-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim(), quick: true }),
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check domain");
    } finally {
      setChecking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      checkDomain();
    }
  };

  const getSpfStatus = (): "pass" | "warn" | "fail" => {
    if (!result?.spf.exists) {
      return "fail";
    }
    if (!result.spf.valid) {
      return "fail";
    }
    if (result.spf.allMechanism === "+all") {
      return "fail";
    }
    // ~all is the recommendation for a sending domain; -all only earns its keep
    // once DMARC enforces, or it rejects pre-DATA before DKIM can authenticate a
    // forwarded copy. Mirrors hardfailWithoutEnforcingDmarc in @wraps/email-check.
    if (
      result.spf.allMechanism === "-all" &&
      authorizesSenders(result.spf.record)
    ) {
      const enforcing =
        result.dmarc.exists &&
        result.dmarc.valid &&
        (result.dmarc.policy === "quarantine" ||
          result.dmarc.policy === "reject");
      return enforcing ? "pass" : "warn";
    }
    return "pass";
  };

  const getDkimStatus = (): "pass" | "warn" | "fail" => {
    if (!result?.dkim?.found) {
      return "fail";
    }
    // Check for weak keys
    const hasWeakKey = result.dkim?.selectorsFound?.some(
      (s) => s.keyBits < 2048
    );
    if (hasWeakKey) {
      return "warn";
    }
    return "pass";
  };

  const getDmarcStatus = (): "pass" | "warn" | "fail" => {
    if (!result?.dmarc.exists) {
      return "fail";
    }
    if (!result.dmarc.valid) {
      return "fail";
    }
    if (result.dmarc.policy === "none") {
      return "warn";
    }
    if (result.dmarc.policy === "quarantine") {
      return "warn";
    }
    return "pass";
  };

  const gradeColors: Record<string, string> = {
    "A+": "text-success bg-success/20 dark:text-success",
    A: "text-success bg-success/20 dark:text-success",
    "A-": "text-success bg-success/20 dark:text-success",
    "B+": "text-success bg-success/20 dark:text-success",
    B: "text-success bg-success/20 dark:text-success",
    "B-": "text-warning bg-warning/20 dark:text-warning",
    "C+": "text-warning bg-warning/20 dark:text-warning",
    C: "text-brand-text bg-brand/20",
    "C-": "text-brand-text bg-brand/20",
    D: "text-destructive bg-destructive/20 dark:text-destructive",
    F: "text-destructive bg-destructive/20 dark:text-destructive",
  };

  const getStatusIcon = (status: "pass" | "warn" | "fail") => {
    if (status === "pass") {
      return <CheckCircle className="h-5 w-5 text-success" />;
    }
    if (status === "warn") {
      return <AlertTriangle className="h-5 w-5 text-warning" />;
    }
    return <XCircle className="h-5 w-5 text-destructive" />;
  };

  const getMessage = () => {
    if (!result) {
      return "";
    }
    const dmarcPolicy = result.dmarc.policy;
    if (!result.dmarc.exists) {
      return "CRITICAL: No DMARC record found. Your domain is vulnerable to spoofing.";
    }
    if (dmarcPolicy === "none") {
      return "WARNING: p=none tells receivers not to enforce authentication failures. Your domain is easier to spoof.";
    }
    if (dmarcPolicy === "quarantine") {
      return "Partial protection. Spoofed emails go to spam, but may still be seen.";
    }
    if (dmarcPolicy === "reject") {
      return "Full protection requested. Major email providers will reject spoofed emails.";
    }
    return "Check your email authentication configuration.";
  };

  const getMessageStyle = () => {
    if (!result) {
      return "";
    }
    const policy = result.dmarc.policy;
    if (!result.dmarc.exists || policy === "none") {
      return "border border-destructive/50 bg-destructive/10 text-destructive";
    }
    if (policy === "quarantine") {
      return "border border-warning/50 bg-warning/10 text-warning";
    }
    return "border border-success/50 bg-success/10 text-success";
  };

  return (
    <Card className="p-6">
      <h3 className="mb-4 font-semibold text-foreground text-lg">
        Check Your Domain
      </h3>

      <div className="mb-6 flex gap-2">
        <input
          className="flex-1 rounded-lg border bg-background px-4 py-2 text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="yourcompany.com"
          type="text"
          value={domain}
        />
        <Button disabled={checking} onClick={checkDomain}>
          {checking ? "Checking..." : "Check"}
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-destructive text-sm dark:text-destructive">
            {error}
          </p>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-muted-foreground">Security Grade</span>
              <div className="font-mono text-muted-foreground text-sm">
                {result.score.score}/{result.score.maxScore} points
              </div>
            </div>
            <span
              className={`rounded px-4 py-1 font-bold text-4xl ${gradeColors[result.score.grade] || gradeColors.F}`}
            >
              {result.score.grade}
            </span>
          </div>

          {/* Score Breakdown Bars */}
          {result.score.breakdown && (
            <div className="space-y-2">
              {[
                { key: "spf", label: "SPF", data: result.score.breakdown.spf },
                {
                  key: "dkim",
                  label: "DKIM",
                  data: result.score.breakdown.dkim,
                },
                {
                  key: "dmarc",
                  label: "DMARC",
                  data: result.score.breakdown.dmarc,
                },
              ].map(({ key, label, data }) => (
                <div className="flex items-center gap-2" key={key}>
                  <span className="w-14 text-muted-foreground text-xs">
                    {label}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full w-(--score) transition-all ${
                        data.score === data.max
                          ? "bg-success"
                          : data.score >= data.max * 0.5
                            ? "bg-warning"
                            : "bg-destructive"
                      }`}
                      style={
                        {
                          "--score": `${(data.score / data.max) * 100}%`,
                        } as React.CSSProperties
                      }
                    />
                  </div>
                  <span className="w-10 text-right font-mono text-muted-foreground text-xs">
                    {data.score}/{data.max}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-3">
            <div className="flex items-center justify-between rounded-lg bg-muted p-3">
              <div className="flex items-center gap-2">
                {getStatusIcon(getSpfStatus())}
                <span className="font-medium text-foreground uppercase">
                  SPF
                </span>
              </div>
              <span className="font-mono text-muted-foreground text-sm">
                {result.spf.exists
                  ? result.spf.allMechanism || "configured"
                  : "missing"}
                {result.spf.lookupCount
                  ? ` (${result.spf.lookupCount}/10 lookups)`
                  : ""}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted p-3">
              <div className="flex items-center gap-2">
                {getStatusIcon(getDkimStatus())}
                <span className="font-medium text-foreground uppercase">
                  DKIM
                </span>
              </div>
              <span className="font-mono text-muted-foreground text-sm">
                {result.dkim?.found
                  ? (result.dkim?.selectorsFound?.length ?? 0) > 0
                    ? `${result.dkim?.selectorsFound?.[0]?.keyBits}-bit`
                    : "found"
                  : "not found"}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-muted p-3">
              <div className="flex items-center gap-2">
                {getStatusIcon(getDmarcStatus())}
                <span className="font-medium text-foreground uppercase">
                  DMARC
                </span>
              </div>
              <span className="font-mono text-muted-foreground text-sm">
                {result.dmarc.exists
                  ? `p=${result.dmarc.policy}${result.dmarc.subdomainPolicy ? ` sp=${result.dmarc.subdomainPolicy}` : ""}`
                  : "missing"}
              </span>
            </div>
          </div>

          <div className={`rounded-lg p-4 ${getMessageStyle()}`}>
            <p className="text-sm">{getMessage()}</p>
          </div>

          {result.issues.length > 0 && (
            <div className="space-y-2">
              <h4 className="font-medium text-muted-foreground text-sm">
                Issues Found:
              </h4>
              {result.issues.slice(0, 3).map((issue, i) => (
                <div
                  className={`rounded p-2 text-sm ${
                    issue.severity === "critical"
                      ? "bg-destructive/10 text-destructive"
                      : issue.severity === "warning"
                        ? "bg-warning/10 text-warning"
                        : "bg-muted text-muted-foreground"
                  }`}
                  key={i}
                >
                  {issue.reason}
                </div>
              ))}
              {result.issues.length > 3 && (
                <a
                  className="block text-center text-primary text-sm hover:underline"
                  href="/tools"
                >
                  +{result.issues.length - 3} more issues - View full report
                </a>
              )}
            </div>
          )}

          {/* Domain Age */}
          {result.domainAge?.ageInDays !== null &&
            result.domainAge?.ageInDays !== undefined && (
              <div className="flex items-center justify-between border-t pt-3 text-sm">
                <span className="text-muted-foreground">Domain Age</span>
                <span className="font-mono text-foreground">
                  {result.domainAge.ageInDays > 365
                    ? `${Math.floor(result.domainAge.ageInDays / 365)} years`
                    : `${result.domainAge.ageInDays} days`}
                </span>
              </div>
            )}
        </div>
      )}

      {result &&
        (result.score.grade === "D" ||
          result.score.grade === "F" ||
          !result.dmarc.exists ||
          result.dmarc.policy === "none") && (
          <div className="mt-4 rounded-xl border border-brand/30 bg-brand/5 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Terminal className="h-4 w-4 text-brand-text" />
              <p className="font-semibold text-foreground">
                Fix this automatically
              </p>
            </div>
            <p className="mb-3 text-foreground/80 text-sm">
              Wraps CLI deploys DKIM, SPF, and DMARC to your AWS account in one
              command. No manual DNS configuration.
            </p>
            <div className="flex gap-3">
              <Button
                asChild
                className="cursor-pointer"
                size="sm"
                variant="brand"
              >
                <a
                  href="/docs/quickstart"
                  onClick={() =>
                    trackEvent("cta_click", {
                      location: "domain_checker_result",
                      cta_text: "Get Started Free",
                    })
                  }
                >
                  Get Started Free
                </a>
              </Button>
              <Button
                asChild
                className="cursor-pointer"
                size="sm"
                variant="outline"
              >
                <a
                  href="/tools"
                  onClick={() =>
                    trackEvent("cta_click", {
                      location: "domain_checker_result",
                      cta_text: "Full Domain Report",
                    })
                  }
                >
                  Full Domain Report
                </a>
              </Button>
            </div>
          </div>
        )}

      {result &&
        result.score.grade !== "D" &&
        result.score.grade !== "F" &&
        result.dmarc.exists &&
        result.dmarc.policy !== "none" && (
          <p className="mt-4 text-center text-muted-foreground text-sm">
            Looking good! Want to keep it that way?{" "}
            <a
              className="text-primary hover:underline"
              href="/tools"
              onClick={() =>
                trackEvent("cta_click", {
                  location: "domain_checker_result",
                  cta_text: "Monitor with Wraps",
                })
              }
            >
              Get a full domain report
            </a>
          </p>
        )}

      {!result && (
        <p className="mt-4 text-muted-foreground text-xs">
          Real-time DNS analysis powered by{" "}
          <a className="text-primary hover:underline" href="/tools">
            Wraps Email Tools
          </a>
          .
        </p>
      )}
    </Card>
  );
};

// Hero scroll button (needs onClick + scrollIntoView)
export const HeroScrollButton = () => (
  <button
    className="flex items-center justify-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
    onClick={() => {
      document
        .getElementById("article-content")
        ?.scrollIntoView({ behavior: "smooth" });
    }}
    type="button"
  >
    <ChevronDown className="h-5 w-5 animate-bounce" />
    <span className="text-sm">Scroll to see why this matters</span>
  </button>
);
