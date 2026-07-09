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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wraps/ui/components/ui/collapsible";
import { Input } from "@wraps/ui/components/ui/input";
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  ChevronDown,
  Globe,
  Info,
  Key,
  Loader2,
  Mail,
  Search,
  Server,
  Settings2,
  Shield,
  ShieldCheck,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import Script from "next/script";
import { parseAsString, useQueryStates } from "nuqs";
import { useEffect, useRef, useState } from "react";

// Turnstile types for Cloudflare bot protection
declare global {
  // biome-ignore lint/style/useConsistentTypeDefinitions: interface required for global Window augmentation
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
          appearance?: "managed" | "non-interactive" | "interaction-only";
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

type EmailCheckResult = {
  success: boolean;
  domain: string;
  checkedAt: string;
  duration: number;
  score: {
    grade: string;
    score: number;
    maxScore: number;
    breakdown: {
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
    lookupCount: number;
    lookupLimit: number;
    allMechanism: string | null;
    includes: string[];
    hasPtr: boolean;
    warnings: string[];
  };
  dkim: {
    found: boolean;
    selectorsFound: Array<{
      selector: string;
      keyType: string;
      keyBits: number;
      testMode: boolean;
    }>;
    selectorsChecked: number;
    warnings: string[];
  };
  dmarc: {
    exists: boolean;
    valid: boolean;
    record: string | null;
    policy: string | null;
    subdomainPolicy: string | null;
    nonExistentSubdomainPolicy: string | null;
    testing: boolean;
    reportingEnabled: boolean;
    pct: number | null;
    alignmentSpf: string;
    alignmentDkim: string;
    ruaAddresses: string[];
    warnings: string[];
  };
  mx: {
    exists: boolean;
    hasRedundancy: boolean;
    records: Array<{
      exchange: string;
      priority: number;
      resolves: boolean;
      ipv4Count: number;
      ipv6Count: number;
    }>;
  };
  domainAge: {
    ageInDays: number | null;
    createdAt: string | null;
    expiresAt: string | null;
    daysUntilExpiry: number | null;
    registrar: string | null;
    source: string;
    privacyEnabled: boolean;
  };
  ipv6: {
    mxHasIpv6: boolean;
    spfIncludesIpv6: boolean;
    mxIpv6Count: number;
  };
  reverseDns: {
    allHavePtr: boolean;
    allConfirm: boolean;
    count: number;
  };
  blacklist: {
    checked: boolean;
    overallClean: boolean;
    domainListings: Array<{
      blacklist: string;
      priority: string;
      delistUrl: string | null;
    }>;
    ipListings: Array<{
      blacklist: string;
      priority: string;
      target: string;
      delistUrl: string | null;
    }>;
  };
  issues: Array<{
    check: string;
    reason: string;
    points: number;
    severity: "critical" | "warning" | "info";
  }>;
  bonuses: Array<{
    check: string;
    reason: string;
    points: number;
  }>;
  error?: string;
};

function GradeDisplay({ grade, score }: { grade: string; score: number }) {
  const gradeColors: Record<string, string> = {
    "A+": "text-green-500 border-green-500",
    A: "text-green-500 border-green-500",
    "A-": "text-green-600 border-green-600",
    "B+": "text-lime-500 border-lime-500",
    B: "text-lime-500 border-lime-500",
    "B-": "text-yellow-500 border-yellow-500",
    "C+": "text-yellow-500 border-yellow-500",
    C: "text-orange-500 border-orange-500",
    "C-": "text-orange-500 border-orange-500",
    D: "text-red-500 border-red-500",
    F: "text-red-600 border-red-600",
  };

  const colorClass = gradeColors[grade] || "text-muted-foreground border-muted";

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`flex h-24 w-24 items-center justify-center rounded-full border-4 font-bold text-4xl ${colorClass}`}
      >
        {grade}
      </div>
      <div className="text-muted-foreground text-sm">{score}/100 points</div>
    </div>
  );
}

function StatusBadge({
  status,
  label,
}: {
  status: "pass" | "warn" | "fail" | "none" | "info";
  label: string;
}) {
  const config = {
    pass: {
      icon: Check,
      className: "bg-green-500/10 text-green-600 border-green-500/20",
    },
    warn: {
      icon: AlertTriangle,
      className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
    },
    fail: {
      icon: X,
      className: "bg-red-500/10 text-red-600 border-red-500/20",
    },
    info: {
      icon: Info,
      className: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    },
    none: {
      icon: X,
      className: "bg-muted text-muted-foreground border-muted",
    },
  };

  const { icon: Icon, className } = config[status];

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}

function RecordDisplay({
  label,
  record,
  status,
  warnings,
  extra,
}: {
  label: string;
  record: string | null;
  status: "pass" | "warn" | "fail" | "none" | "info";
  warnings?: string[];
  extra?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-lg border bg-card">
      <Collapsible onOpenChange={setIsOpen} open={isOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between p-4 hover:bg-muted/50">
          <div className="flex items-center gap-3">
            <StatusBadge label={label} status={status} />
            {extra}
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t bg-muted/30 p-4">
            {record ? (
              <code className="block overflow-x-auto whitespace-pre-wrap break-all rounded bg-background p-3 font-mono text-xs">
                {record}
              </code>
            ) : (
              <p className="text-muted-foreground text-sm italic">
                No record found
              </p>
            )}
            {warnings && warnings.length > 0 && (
              <div className="mt-3 space-y-2">
                {warnings.map((warning, i) => (
                  <div
                    className="flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-2.5 text-xs text-yellow-600 dark:text-yellow-400"
                    key={`warning-${i}`}
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    {warning}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

const checkerParsers = {
  domain: parseAsString.withDefault(""),
  dkim: parseAsString.withDefault(""),
};

export default function ToolsPageContent() {
  const [{ domain, dkim }, setParams] = useQueryStates(checkerParsers, {
    shallow: false,
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<EmailCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileToken = useRef<string | null>(null);
  const turnstileWidgetId = useRef<string | null>(null);

  const runCheck = async (checkDomain: string, checkDkim: string = dkim) => {
    if (!checkDomain.trim()) {
      return;
    }

    const token = turnstileToken.current;
    if (!token) {
      setError("Please wait for verification to complete, then try again.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/tools/email-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          domain: checkDomain.trim(),
          quick: true,
          turnstileToken: token,
          ...(checkDkim.trim() && {
            dkimSelectors: checkDkim
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          }),
        }),
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
      setIsLoading(false);
      if (window.turnstile && turnstileWidgetId.current) {
        window.turnstile.reset(turnstileWidgetId.current);
        turnstileToken.current = null;
      }
    }
  };

  // Render Turnstile widget when script is loaded
  useEffect(() => {
    if (!(turnstileReady && window.turnstile)) {
      return;
    }

    const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!sitekey) {
      return;
    }

    const container = document.getElementById("turnstile-container");
    if (!container) {
      return;
    }

    turnstileWidgetId.current = window.turnstile.render(container, {
      sitekey,
      callback: (token: string) => {
        turnstileToken.current = token;
      },
      "expired-callback": () => {
        turnstileToken.current = null;
      },
      appearance: "interaction-only",
    });

    return () => {
      if (turnstileWidgetId.current && window.turnstile) {
        window.turnstile.remove(turnstileWidgetId.current);
        turnstileWidgetId.current = null;
      }
    };
  }, [turnstileReady]);

  const checkDomain = () => runCheck(domain, dkim);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      checkDomain();
    }
  };

  // Score-driven status: green = full points, yellow = partial, red = critical issue, none = missing
  const getScoreStatus = (
    score: number,
    max: number
  ): "pass" | "warn" | "fail" => {
    if (score >= max) {
      return "pass";
    }
    if (score >= max * 0.7) {
      return "warn";
    }
    return "fail";
  };

  const getSpfStatus = (): "pass" | "warn" | "fail" | "none" => {
    if (!result?.spf.exists) {
      return "none";
    }
    if (result.score?.breakdown) {
      return getScoreStatus(
        result.score.breakdown.spf.score,
        result.score.breakdown.spf.max
      );
    }
    // Fallback if no breakdown
    if (!result.spf.valid || result.spf.allMechanism === "+all") {
      return "fail";
    }
    if (
      result.spf.allMechanism === "~all" ||
      result.spf.allMechanism === "?all" ||
      result.spf.lookupCount > result.spf.lookupLimit ||
      result.spf.hasPtr ||
      (result.spf.warnings?.length ?? 0) > 0
    ) {
      return "warn";
    }
    return "pass";
  };

  const getDkimStatus = (): "pass" | "warn" | "fail" | "none" => {
    if (!result?.dkim?.found) {
      return "none";
    }
    if (result.score?.breakdown) {
      return getScoreStatus(
        result.score.breakdown.dkim.score,
        result.score.breakdown.dkim.max
      );
    }
    if ((result.dkim?.warnings?.length ?? 0) > 0) {
      return "warn";
    }
    return "pass";
  };

  // Check if AWS SES is detected but DKIM wasn't found (user should provide selectors)
  const isAwsSesWithoutDkim =
    result &&
    !result.dkim?.found &&
    result.dkim?.warnings?.some((w) => w.toLowerCase().includes("aws ses"));

  const getDmarcStatus = (): "pass" | "warn" | "fail" | "none" => {
    if (!result?.dmarc.exists) {
      return "none";
    }
    if (result.score?.breakdown) {
      return getScoreStatus(
        result.score.breakdown.dmarc.score,
        result.score.breakdown.dmarc.max
      );
    }
    if (!result.dmarc.valid) {
      return "fail";
    }
    if (result.dmarc.policy === "none") {
      return "warn";
    }
    return "pass";
  };

  const getMxStatus = (): "pass" | "warn" | "fail" | "none" => {
    if (!result?.mx.exists) {
      return "none";
    }
    if (result.score?.breakdown) {
      return getScoreStatus(
        result.score.breakdown.mx.score,
        result.score.breakdown.mx.max
      );
    }
    if (result.mx.records.some((r) => !r.resolves)) {
      return "warn";
    }
    return "pass";
  };

  const getStatusLabel = (
    exists: boolean,
    status: "pass" | "warn" | "fail" | "none"
  ): string => {
    if (!exists) {
      return "Missing";
    }
    if (status === "pass") {
      return "Strong";
    }
    if (status === "warn") {
      return "Weak";
    }
    return "Failing";
  };

  return (
    <>
      <Script
        onLoad={() => setTurnstileReady(true)}
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
      />

      {/* Search Box */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Mail className="-translate-y-1/2 absolute top-1/2 left-3 h-5 w-5 text-muted-foreground" />
              <Input
                aria-label="Domain to check"
                className="h-12 pl-10 text-base sm:text-lg"
                disabled={isLoading}
                onChange={(e) => setParams({ domain: e.target.value })}
                onKeyDown={handleKeyDown}
                placeholder="Enter your domain (e.g., example.com)"
                value={domain}
              />
            </div>
            <Button
              className="h-12 w-full px-6 sm:w-auto"
              disabled={isLoading || !domain.trim()}
              onClick={checkDomain}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Check Domain
                </>
              )}
            </Button>
          </div>

          <div className="mt-3" id="turnstile-container" />

          {/* Advanced Options */}
          <Collapsible onOpenChange={setShowAdvanced} open={showAdvanced}>
            <CollapsibleTrigger className="mt-4 flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground">
              <Settings2 className="h-4 w-4" />
              Advanced Options
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                <div className="space-y-3">
                  <div>
                    <label
                      className="mb-1.5 flex items-center gap-2 font-medium text-sm"
                      htmlFor="dkim-selectors"
                    >
                      <Key className="h-4 w-4" />
                      DKIM Selectors
                    </label>
                    <Input
                      disabled={isLoading}
                      id="dkim-selectors"
                      onChange={(e) => setParams({ dkim: e.target.value })}
                      placeholder="e.g., selector1, selector2, selector3"
                      value={dkim}
                    />
                    <p className="mt-1.5 text-muted-foreground text-xs">
                      Enter selector names separated by commas (the part before{" "}
                      <code className="rounded bg-muted px-1">._domainkey</code>
                      ). AWS SES creates 3 selectors - find them in the SES
                      console under "View DNS records" and enter all 3.
                    </p>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="mb-8 border-red-500/20 bg-red-500/5" role="alert">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result?.success && (
        <div className="space-y-6">
          {/* Score Card */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-6 md:flex-row md:justify-between">
                <div className="text-center md:text-left">
                  <h2 className="mb-2 font-bold text-2xl">{result.domain}</h2>
                  <p className="text-muted-foreground">
                    Checked in {result.duration}ms
                  </p>
                </div>
                <GradeDisplay
                  grade={result.score.grade}
                  score={result.score.score}
                />
              </div>
            </CardContent>
          </Card>

          {/* Quick Status */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card className="text-center">
              <CardContent className="pt-4 pb-4">
                <div className="mb-2 font-semibold text-sm">SPF</div>
                <StatusBadge
                  label={getStatusLabel(result.spf.exists, getSpfStatus())}
                  status={getSpfStatus()}
                />
                {result.score?.breakdown && (
                  <div className="mt-1.5 text-muted-foreground text-xs">
                    {result.score.breakdown.spf.score}/
                    {result.score.breakdown.spf.max} pts
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-4 pb-4">
                <div className="mb-2 font-semibold text-sm">DKIM</div>
                <StatusBadge
                  label={
                    isAwsSesWithoutDkim
                      ? "Not Verified"
                      : getStatusLabel(!!result.dkim?.found, getDkimStatus())
                  }
                  status={
                    isAwsSesWithoutDkim
                      ? "info"
                      : result.dkim?.found
                        ? getDkimStatus()
                        : "none"
                  }
                />
                {result.score?.breakdown && (
                  <div className="mt-1.5 text-muted-foreground text-xs">
                    {result.score.breakdown.dkim.score}/
                    {result.score.breakdown.dkim.max} pts
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-4 pb-4">
                <div className="mb-2 font-semibold text-sm">DMARC</div>
                <StatusBadge
                  label={getStatusLabel(result.dmarc.exists, getDmarcStatus())}
                  status={getDmarcStatus()}
                />
                {result.score?.breakdown && (
                  <div className="mt-1.5 text-muted-foreground text-xs">
                    {result.score.breakdown.dmarc.score}/
                    {result.score.breakdown.dmarc.max} pts
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="text-center">
              <CardContent className="pt-4 pb-4">
                <div className="mb-2 font-semibold text-sm">MX</div>
                <StatusBadge
                  label={getStatusLabel(result.mx.exists, getMxStatus())}
                  status={getMxStatus()}
                />
                {result.score?.breakdown && (
                  <div className="mt-1.5 text-muted-foreground text-xs">
                    {result.score.breakdown.mx.score}/
                    {result.score.breakdown.mx.max} pts
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* AWS SES DKIM Prompt */}
          {isAwsSesWithoutDkim && (
            <Card className="border-blue-500/20 bg-blue-500/5">
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <Key className="mt-0.5 h-5 w-5 text-blue-500" />
                    <div>
                      <h3 className="font-semibold">
                        AWS SES Detected — DKIM Likely Configured
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        AWS SES automatically configures DKIM with unique
                        selectors that we can't auto-discover. Your DKIM is most
                        likely set up correctly. To verify, enter your 3 DKIM
                        selectors from the SES console.
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={() => setShowAdvanced(true)}
                    size="sm"
                    variant="outline"
                  >
                    <Settings2 className="mr-2 h-4 w-4" />
                    Enter Selectors
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Score Breakdown - only show if new API format */}
          {result.score?.breakdown && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Score Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    {
                      key: "spf",
                      label: "SPF",
                      data: result.score.breakdown.spf,
                    },
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
                    {
                      key: "mx",
                      label: "MX",
                      data: result.score.breakdown.mx,
                    },
                  ].map(({ key, label, data }) => (
                    <div className="space-y-1" key={key}>
                      <div className="flex items-center justify-between text-sm">
                        <span>{label}</span>
                        <span className="text-muted-foreground">
                          {data.score}/{data.max}
                        </span>
                      </div>
                      <div
                        aria-label={`${label} score`}
                        aria-valuemax={data.max}
                        aria-valuemin={0}
                        aria-valuenow={data.score}
                        className="h-2 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                      >
                        <div
                          className={`h-full transition-all ${
                            data.score === data.max
                              ? "bg-green-500"
                              : data.score >= data.max * 0.5
                                ? "bg-yellow-500"
                                : "bg-red-500"
                          }`}
                          style={{
                            width: `${(data.score / data.max) * 100}%`,
                          }}
                        />
                      </div>
                      {key === "dkim" &&
                        isAwsSesWithoutDkim &&
                        data.score === 0 && (
                          <p className="flex items-center gap-1 text-blue-500 text-xs">
                            <Info className="h-3 w-3" />
                            DKIM score may be inaccurate — AWS SES uses
                            undiscoverable selectors
                          </p>
                        )}
                    </div>
                  ))}
                  {result.score.breakdown.bonus.earned > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1">
                          <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                          Bonus Points
                        </span>
                        <span className="text-muted-foreground">
                          +{result.score.breakdown.bonus.earned}/
                          {result.score.breakdown.bonus.possible}
                        </span>
                      </div>
                      <div
                        aria-label="Bonus points score"
                        aria-valuemax={result.score.breakdown.bonus.possible}
                        aria-valuemin={0}
                        aria-valuenow={result.score.breakdown.bonus.earned}
                        className="h-2 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                      >
                        <div
                          className="h-full bg-purple-500 transition-all"
                          style={{
                            width: `${(result.score.breakdown.bonus.earned / result.score.breakdown.bonus.possible) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Issues */}
          {result.issues.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Issues Found ({result.issues.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {result.issues.map((issue, i) => {
                    const isSpfIssue = issue.check
                      .toLowerCase()
                      .includes("spf");
                    const showSpfBuilderLink =
                      isSpfIssue &&
                      (!result.spf.exists ||
                        result.spf.lookupCount > result.spf.lookupLimit);

                    return (
                      <div
                        className={`rounded-lg border p-4 ${
                          issue.severity === "critical"
                            ? "border-red-500/20 bg-red-500/5"
                            : issue.severity === "warning"
                              ? "border-yellow-500/20 bg-yellow-500/5"
                              : "border-blue-500/20 bg-blue-500/5"
                        }`}
                        key={`issue-${i}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex flex-1 items-start gap-2">
                            {(() => {
                              const iconClass = "mt-0.5 h-4 w-4 flex-shrink-0";
                              if (issue.severity === "critical") {
                                return (
                                  <XCircle
                                    className={`${iconClass} text-red-500`}
                                  />
                                );
                              }
                              if (issue.severity === "warning") {
                                return (
                                  <AlertTriangle
                                    className={`${iconClass} text-yellow-500`}
                                  />
                                );
                              }
                              return (
                                <Info
                                  className={`${iconClass} text-blue-500`}
                                />
                              );
                            })()}
                            <div>
                              <div className="mb-1 font-medium">
                                {issue.check}
                              </div>
                              <p className="text-muted-foreground text-sm">
                                {issue.reason}
                                {showSpfBuilderLink && (
                                  <>
                                    {" "}
                                    <a
                                      className="inline-flex items-center gap-1 text-primary hover:underline"
                                      href="/tools/spf-builder"
                                    >
                                      <ArrowRight className="h-3 w-3" />
                                      {result.spf.exists
                                        ? "Fix with SPF Builder"
                                        : "Create with SPF Builder"}
                                    </a>
                                  </>
                                )}
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant={
                              issue.severity === "critical"
                                ? "destructive"
                                : issue.severity === "warning"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            -{issue.points} pts
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bonuses */}
          {result.bonuses && result.bonuses.length > 0 && (
            <Card className="border-purple-500/20 bg-purple-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                  Bonus Points Earned ({result.bonuses.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {result.bonuses.map((bonus, i) => (
                    <div
                      className="flex items-center justify-between rounded-lg border border-purple-500/20 bg-background p-3"
                      key={`bonus-${i}`}
                    >
                      <div>
                        <span className="font-medium">{bonus.check}</span>
                        <span className="text-muted-foreground">
                          {" "}
                          - {bonus.reason}
                        </span>
                      </div>
                      <Badge
                        className="border-purple-500/50 text-purple-600"
                        variant="outline"
                      >
                        +{bonus.points} pts
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Detailed Records */}
          <Card>
            <CardHeader>
              <CardTitle>DNS Records</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <RecordDisplay
                extra={
                  result.spf.exists ? (
                    <span
                      className={`font-mono text-xs ${
                        result.spf.lookupCount > result.spf.lookupLimit
                          ? "text-red-500"
                          : result.spf.lookupCount > 7
                            ? "text-yellow-500"
                            : "text-green-500"
                      }`}
                    >
                      {result.spf.lookupCount}/{result.spf.lookupLimit} lookups
                    </span>
                  ) : undefined
                }
                label="SPF"
                record={result.spf.record}
                status={getSpfStatus()}
                warnings={result.spf.warnings}
              />
              <RecordDisplay
                label="DMARC"
                record={result.dmarc.record}
                status={getDmarcStatus()}
                warnings={result.dmarc.warnings}
              />
              {(result.dkim?.selectorsFound?.length ?? 0) > 0 && (
                <div className="rounded-lg border bg-card">
                  <div className="flex items-center justify-between p-4">
                    <StatusBadge label="DKIM" status={getDkimStatus()} />
                    <span className="text-muted-foreground text-sm">
                      {result.dkim?.selectorsFound?.length ?? 0} selector(s)
                      found
                    </span>
                  </div>
                  <div className="border-t bg-muted/30 p-4">
                    <div className="space-y-2">
                      {result.dkim?.selectorsFound?.map((sel) => (
                        <div
                          className="flex items-center justify-between rounded bg-background p-2 text-sm"
                          key={sel.selector}
                        >
                          <code className="font-mono">{sel.selector}</code>
                          <span className="text-muted-foreground">
                            {sel.keyType} {sel.keyBits}-bit
                          </span>
                        </div>
                      ))}
                    </div>
                    {(result.dkim?.warnings?.length ?? 0) > 0 && (
                      <div className="mt-3 space-y-2">
                        {result.dkim.warnings.map((warning, i) => (
                          <div
                            className="flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-2.5 text-xs text-yellow-600 dark:text-yellow-400"
                            key={`dkim-warning-${i}`}
                          >
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                            {warning}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {result.mx.records.length > 0 && (
                <div className="rounded-lg border bg-card">
                  <div className="flex items-center justify-between p-4">
                    <StatusBadge label="MX" status={getMxStatus()} />
                    <span className="text-muted-foreground text-sm">
                      {result.mx.records.length} record(s)
                    </span>
                  </div>
                  <div className="border-t bg-muted/30 p-4">
                    <div className="space-y-2">
                      {result.mx.records.map((mx) => (
                        <div
                          className="flex items-center justify-between rounded bg-background p-2 text-sm"
                          key={mx.exchange}
                        >
                          <code className="font-mono">{mx.exchange}</code>
                          <span className="text-muted-foreground">
                            Priority: {mx.priority}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {/* Blacklist Status */}
              {result.blacklist?.checked && (
                <div className="rounded-lg border bg-card">
                  <div className="flex items-center justify-between p-4">
                    <StatusBadge
                      label="Blacklists"
                      status={result.blacklist.overallClean ? "pass" : "fail"}
                    />
                    {result.blacklist.overallClean ? (
                      <Badge variant="outline">Clean</Badge>
                    ) : (
                      <span className="text-red-500 text-sm">
                        {result.blacklist.domainListings.length +
                          result.blacklist.ipListings.length}{" "}
                        listing(s)
                      </span>
                    )}
                  </div>
                  {!result.blacklist.overallClean && (
                    <div className="border-t bg-muted/30 p-4">
                      <div className="space-y-2">
                        {result.blacklist.domainListings.map((listing, i) => (
                          <div
                            className="flex items-center justify-between rounded bg-background p-2 text-sm"
                            key={`domain-bl-${i}`}
                          >
                            <div>
                              <span className="font-medium">
                                {listing.blacklist}
                              </span>
                              <Badge
                                className="ml-2"
                                variant={
                                  listing.priority === "high"
                                    ? "destructive"
                                    : "secondary"
                                }
                              >
                                {listing.priority}
                              </Badge>
                            </div>
                            {listing.delistUrl && (
                              <a
                                className="text-primary text-xs hover:underline"
                                href={listing.delistUrl}
                                rel="noopener noreferrer"
                                target="_blank"
                              >
                                Delist
                              </a>
                            )}
                          </div>
                        ))}
                        {result.blacklist.ipListings.map((listing, i) => (
                          <div
                            className="flex items-center justify-between rounded bg-background p-2 text-sm"
                            key={`ip-bl-${i}`}
                          >
                            <div>
                              <code className="font-mono text-xs">
                                {listing.target}
                              </code>
                              <span className="ml-2 text-muted-foreground">
                                {listing.blacklist}
                              </span>
                              <Badge
                                className="ml-2"
                                variant={
                                  listing.priority === "high"
                                    ? "destructive"
                                    : "secondary"
                                }
                              >
                                {listing.priority}
                              </Badge>
                            </div>
                            {listing.delistUrl && (
                              <a
                                className="text-primary text-xs hover:underline"
                                href={listing.delistUrl}
                                rel="noopener noreferrer"
                                target="_blank"
                              >
                                Delist
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* DMARC Details */}
          {result.dmarc.exists && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  DMARC Policy Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-muted-foreground text-sm">
                      Policy
                    </div>
                    <div className="font-mono text-lg">
                      p={result.dmarc.policy || "none"}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-muted-foreground text-sm">
                      Subdomain Policy
                    </div>
                    <div className="font-mono text-lg">
                      sp={result.dmarc.subdomainPolicy || "inherit"}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-muted-foreground text-sm">
                      Non-Existent Subdomains
                    </div>
                    <div className="font-mono text-lg">
                      np={result.dmarc.nonExistentSubdomainPolicy || "inherit"}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-muted-foreground text-sm">
                      Reporting
                    </div>
                    <div className="font-mono text-lg">
                      {result.dmarc.reportingEnabled ? "Enabled" : "Disabled"}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-muted-foreground text-sm">
                      SPF Alignment
                    </div>
                    <div className="font-mono text-lg">
                      {result.dmarc.alignmentSpf || "relaxed"}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-muted-foreground text-sm">
                      DKIM Alignment
                    </div>
                    <div className="font-mono text-lg">
                      {result.dmarc.alignmentDkim || "relaxed"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Infrastructure Details - only show if new API format */}
          {result.domainAge && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Infrastructure Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Domain Age */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 font-medium">
                      <Calendar className="h-4 w-4" />
                      Domain Age
                    </div>
                    {result.domainAge.ageInDays !== null ? (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Age</span>
                          <span>
                            {result.domainAge.ageInDays > 365
                              ? `${Math.floor(result.domainAge.ageInDays / 365)} years`
                              : `${result.domainAge.ageInDays} days`}
                          </span>
                        </div>
                        {result.domainAge.createdAt && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Created
                            </span>
                            <span>
                              {new Date(
                                result.domainAge.createdAt
                              ).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                        {result.domainAge.daysUntilExpiry !== null && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Expires in
                            </span>
                            <span
                              className={
                                result.domainAge.daysUntilExpiry < 30
                                  ? "text-red-500"
                                  : result.domainAge.daysUntilExpiry < 90
                                    ? "text-yellow-500"
                                    : ""
                              }
                            >
                              {result.domainAge.daysUntilExpiry} days
                            </span>
                          </div>
                        )}
                        {result.domainAge.registrar && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Registrar
                            </span>
                            <span className="max-w-[180px] truncate text-right">
                              {result.domainAge.registrar}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        {result.domainAge.privacyEnabled
                          ? "WHOIS privacy enabled"
                          : "Data unavailable"}
                      </p>
                    )}
                  </div>

                  {/* IPv6 & Reverse DNS */}
                  {result.ipv6 && result.reverseDns && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 font-medium">
                        <Globe className="h-4 w-4" />
                        Network
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            IPv6 on MX
                          </span>
                          <StatusBadge
                            label={result.ipv6.mxHasIpv6 ? "Supported" : "No"}
                            status={result.ipv6.mxHasIpv6 ? "pass" : "none"}
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            IPv6 in SPF
                          </span>
                          <StatusBadge
                            label={result.ipv6.spfIncludesIpv6 ? "Yes" : "No"}
                            status={
                              result.ipv6.spfIncludesIpv6 ? "pass" : "none"
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            Reverse DNS (PTR)
                          </span>
                          <StatusBadge
                            label={
                              result.reverseDns.allHavePtr
                                ? result.reverseDns.allConfirm
                                  ? "Valid"
                                  : "Partial"
                                : "Missing"
                            }
                            status={
                              result.reverseDns.allHavePtr
                                ? result.reverseDns.allConfirm
                                  ? "pass"
                                  : "warn"
                                : "fail"
                            }
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            MX Redundancy
                          </span>
                          <StatusBadge
                            label={result.mx.hasRedundancy ? "Yes" : "Single"}
                            status={result.mx.hasRedundancy ? "pass" : "warn"}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* CTA */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex flex-col items-center gap-4 text-center md:flex-row md:text-left">
                <div className="flex-1">
                  <h3 className="mb-2 font-bold text-xl">
                    Need to set up email infrastructure?
                  </h3>
                  <p className="text-muted-foreground">
                    Wraps deploys production-ready email infrastructure to your
                    AWS account in under 2 minutes.
                  </p>
                </div>
                <Button asChild size="lg">
                  <Link href="/docs/quickstart">
                    Get Started
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Empty State */}
      {!(result || error || isLoading) && (
        <Card className="border-dashed">
          <CardContent className="py-12">
            <div className="flex flex-col items-center text-center">
              <Shield className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 font-semibold text-lg">
                Check Your Email Setup
              </h3>
              <p className="mb-6 max-w-md text-muted-foreground">
                Enter any domain above to analyze its email authentication
                configuration. We'll check SPF, DKIM, DMARC, and MX records.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {["gmail.com", "microsoft.com", "stripe.com"].map((d) => (
                  <Button
                    key={d}
                    onClick={() => setParams({ domain: d })}
                    size="sm"
                    variant="outline"
                  >
                    Try {d}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
