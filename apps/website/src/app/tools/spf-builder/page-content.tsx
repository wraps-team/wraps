"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Input } from "@wraps/ui/components/ui/input";
import {
  AlertTriangle,
  Check,
  Copy,
  Info,
  Loader2,
  Mail,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildSpfRecord,
  SPF_PROVIDERS as PROVIDERS,
  SPF_QUALIFIERS as QUALIFIERS,
  type SpfQualifier,
} from "@/lib/spf-record";

// Custom include with resolved lookup count
type CustomInclude = {
  domain: string;
  lookups: number | null; // null = loading/unknown
  loading?: boolean;
  error?: string;
};

// Fetch SPF record via Cloudflare DNS-over-HTTPS
async function fetchSpfRecord(domain: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=TXT`,
      { headers: { Accept: "application/dns-json" } }
    );
    const data = await res.json();
    if (!data.Answer) {
      return null;
    }

    // Find the SPF record among TXT records
    for (const answer of data.Answer) {
      const txt = answer.data?.replace(/"/g, "") || "";
      if (txt.startsWith("v=spf1")) {
        return txt;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Count DNS lookups in an SPF record (recursive)
async function countSpfLookups(
  domain: string,
  visited: Set<string> = new Set()
): Promise<number> {
  // Prevent infinite loops
  if (visited.has(domain)) {
    return 0;
  }
  visited.add(domain);

  const record = await fetchSpfRecord(domain);
  if (!record) {
    return 1; // Count the failed lookup attempt
  }

  let count = 0;
  const parts = record.split(/\s+/);

  for (const part of parts) {
    const mechanism = part.replace(/^[+\-~?]/, ""); // Remove qualifier

    if (mechanism.startsWith("include:")) {
      const includeDomain = mechanism.replace("include:", "");
      count += 1; // The include itself is 1 lookup
      count += await countSpfLookups(includeDomain, visited); // Plus nested lookups
    } else if (mechanism.startsWith("redirect=")) {
      const redirectDomain = mechanism.replace("redirect=", "");
      count += 1;
      count += await countSpfLookups(redirectDomain, visited);
    } else if (
      mechanism.startsWith("a:") ||
      mechanism.startsWith("a/") ||
      mechanism === "a"
    ) {
      count += 1;
    } else if (
      mechanism.startsWith("mx:") ||
      mechanism.startsWith("mx/") ||
      mechanism === "mx"
    ) {
      count += 1;
    } else if (mechanism.startsWith("ptr") || mechanism === "ptr") {
      count += 1;
    } else if (mechanism.startsWith("exists:")) {
      count += 1;
    }
    // ip4:, ip6:, all don't count as lookups
  }

  return count;
}

type SpfLookupResult = {
  record: string;
  lookups: number;
  warnings: string[];
};

export default function SPFBuilderWidget() {
  const [selectedProviders, setSelectedProviders] = useState<string[]>(["ses"]);
  const [customIPs, setCustomIPs] = useState<string[]>([]);
  const [customIncludes, setCustomIncludes] = useState<CustomInclude[]>([]);
  const [newIP, setNewIP] = useState("");
  const [newInclude, setNewInclude] = useState("");
  const [newIncludeLoading, setNewIncludeLoading] = useState(false);
  const [qualifier, setQualifier] = useState("~all");
  const [copied, setCopied] = useState(false);

  // SPF lookup state — domain synced to URL
  const [lookupDomain, setLookupDomain] = useQueryState(
    "domain",
    parseAsString.withDefault("")
  );
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<SpfLookupResult | null>(
    null
  );
  const [lookupError, setLookupError] = useState<string | null>(null);

  const lookUpSpf = async () => {
    const trimmed = lookupDomain.trim();
    if (!trimmed) {
      return;
    }

    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);

    try {
      const record = await fetchSpfRecord(trimmed);
      if (!record) {
        setLookupError(`No SPF record found for ${trimmed}`);
        return;
      }

      const lookups = await countSpfLookups(trimmed);

      const warnings: string[] = [];
      if (lookups > 10) {
        warnings.push(
          `Exceeds 10-lookup limit (${lookups} lookups) — SPF will return PermError`
        );
      } else if (lookups > 7) {
        warnings.push(
          `Approaching 10-lookup limit (${lookups}/10 lookups used)`
        );
      }
      if (record.includes("+all")) {
        warnings.push(
          'Uses "+all" — this allows anyone to send as your domain'
        );
      }
      if (record.includes("ptr") || record.includes("ptr:")) {
        warnings.push(
          "Uses deprecated ptr mechanism — should be replaced with ip4/ip6"
        );
      }
      if (!(record.includes("-all") || record.includes("~all"))) {
        warnings.push(
          "Missing -all or ~all — unauthorized senders won't be rejected"
        );
      }

      // Auto-populate the builder from the record
      const parts = record.split(/\s+/);

      // Additional warnings based on parsed record
      if (record.includes("?all")) {
        warnings.push(
          'Uses "?all" (neutral) which provides no protection — switch to "~all"'
        );
      }
      if (record.length > 255) {
        warnings.push(
          `Record is ${record.length} characters — TXT records over 255 characters require splitting and may cause issues with some DNS providers`
        );
      }
      // Check for duplicate includes
      const includes = parts
        .filter((p) => p.replace(/^[+\-~?]/, "").startsWith("include:"))
        .map((p) => p.replace(/^[+\-~?]/, ""));
      const seen = new Set<string>();
      for (const inc of includes) {
        if (seen.has(inc)) {
          warnings.push(
            `Duplicate include found: ${inc.replace("include:", "")} — wastes a DNS lookup`
          );
        }
        seen.add(inc);
      }
      // Check for a/mx mechanisms that cost lookups
      for (const part of parts) {
        const clean = part.replace(/^[+\-~?]/, "");
        if (clean === "a" || clean.startsWith("a:") || clean.startsWith("a/")) {
          warnings.push(
            'Uses "a" mechanism which costs a DNS lookup — consider replacing with explicit IP addresses'
          );
        }
        if (
          clean === "mx" ||
          clean.startsWith("mx:") ||
          clean.startsWith("mx/")
        ) {
          warnings.push(
            'Uses "mx" mechanism which costs a DNS lookup — consider replacing with explicit IP addresses'
          );
        }
      }
      // Check for redirect= with all mechanism
      const hasRedirect = parts.some((p) =>
        p.replace(/^[+\-~?]/, "").startsWith("redirect=")
      );
      const hasAll = parts.some(
        (p) =>
          p === "-all" ||
          p === "~all" ||
          p === "?all" ||
          p === "+all" ||
          p.replace(/^[+\-~?]/, "") === "all"
      );
      if (hasRedirect && hasAll) {
        warnings.push(
          'Record has both "redirect=" and an "all" mechanism — the redirect will be ignored'
        );
      }
      // Check for no mechanisms (only v=spf1 and all)
      const mechanisms = parts.filter((p) => {
        const clean = p.replace(/^[+\-~?]/, "");
        return (
          clean !== "v=spf1" &&
          clean !== "all" &&
          !clean.startsWith("redirect=")
        );
      });
      if (mechanisms.length === 0) {
        const allPart = parts.find(
          (p) => p === "-all" || p === "~all" || p === "?all" || p === "+all"
        );
        warnings.push(
          `Record has no include or IP mechanisms — only the catch-all "${allPart || "all"}" will apply`
        );
      }
      // Check for very high complexity
      if (includes.length >= 8) {
        warnings.push(
          `Record has ${includes.length} includes — consider consolidating providers to reduce complexity`
        );
      }
      const matchedProviders: string[] = [];
      const unmatchedIncludes: string[] = [];
      const detectedIPs: string[] = [];
      let detectedQualifier: string | null = null;

      // Build a reverse map: include domain -> provider key
      const mechanismToProvider = new Map<string, string>();
      for (const [key, provider] of Object.entries(PROVIDERS)) {
        mechanismToProvider.set(provider.mechanism, key);
      }

      for (const part of parts) {
        const clean = part.replace(/^[+\-~?]/, "");

        if (mechanismToProvider.has(clean)) {
          matchedProviders.push(mechanismToProvider.get(clean)!);
        } else if (clean.startsWith("include:")) {
          unmatchedIncludes.push(clean.replace("include:", ""));
        } else if (clean.startsWith("ip4:") || clean.startsWith("ip6:")) {
          detectedIPs.push(clean.replace(/^ip[46]:/, ""));
        } else if (
          clean === "all" ||
          part === "-all" ||
          part === "~all" ||
          part === "?all" ||
          part === "+all"
        ) {
          detectedQualifier = part.startsWith("+")
            ? "+all"
            : part.startsWith("~")
              ? "~all"
              : part.startsWith("?")
                ? "?all"
                : "-all";
        }
      }

      if (matchedProviders.length > 0) {
        setSelectedProviders(matchedProviders);
      }
      if (detectedIPs.length > 0) {
        setCustomIPs(detectedIPs);
      }
      if (detectedQualifier && detectedQualifier in QUALIFIERS) {
        setQualifier(detectedQualifier);
      }
      // Add unmatched includes with lookup resolution
      if (unmatchedIncludes.length > 0) {
        const newIncludes: CustomInclude[] = unmatchedIncludes.map((d) => ({
          domain: d,
          lookups: null,
          loading: true,
        }));
        setCustomIncludes(newIncludes);

        // Resolve lookups for each unmatched include
        for (const inc of unmatchedIncludes) {
          countSpfLookups(inc)
            .then((resolved) => {
              setCustomIncludes((prev) =>
                prev.map((i) =>
                  i.domain === inc
                    ? { ...i, lookups: resolved, loading: false }
                    : i
                )
              );
            })
            .catch(() => {
              setCustomIncludes((prev) =>
                prev.map((i) =>
                  i.domain === inc
                    ? {
                        ...i,
                        lookups: 2,
                        loading: false,
                        error: "Failed to resolve",
                      }
                    : i
                )
              );
            });
        }
      } else {
        setCustomIncludes([]);
      }

      setLookupResult({ record, lookups, warnings });
    } catch {
      setLookupError("Failed to look up SPF record");
    } finally {
      setLookupLoading(false);
    }
  };

  // Auto-lookup on mount if domain is present from URL
  const hasAutoLookedUp = useRef(false);
  useEffect(() => {
    if (lookupDomain && !hasAutoLookedUp.current) {
      hasAutoLookedUp.current = true;
      lookUpSpf();
    }
  }, [lookUpSpf, lookupDomain]); // eslint-disable-line react-hooks/exhaustive-deps

  const built = useMemo(
    () =>
      buildSpfRecord({
        providers: selectedProviders,
        ips: customIPs,
        includes: customIncludes.map((inc) => inc.domain),
        qualifier: qualifier as SpfQualifier,
      }),
    [selectedProviders, customIPs, customIncludes, qualifier]
  );

  // Custom includes resolve their real lookup count over DNS; the library
  // can only assume 2, so the page's total prefers the resolved value.
  const lookupCount = useMemo(() => {
    const providerLookups = selectedProviders.reduce(
      (sum, p) => sum + (PROVIDERS[p]?.lookups || 0),
      0
    );
    const customLookups = customIncludes.reduce(
      (sum, inc) => sum + (inc.lookups ?? 2),
      0
    );
    return providerLookups + customLookups;
  }, [selectedProviders, customIncludes]);

  const spfRecord = built.record;

  const toggleProvider = (key: string) => {
    setSelectedProviders((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const addIP = () => {
    const trimmed = newIP.trim();
    if (trimmed && !customIPs.includes(trimmed)) {
      // Basic validation for IPv4 or IPv6
      const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
      const ipv6Regex = /^[a-fA-F0-9:]+$/;
      if (ipv4Regex.test(trimmed) || ipv6Regex.test(trimmed)) {
        setCustomIPs((prev) => [...prev, trimmed]);
        setNewIP("");
      }
    }
  };

  const removeIP = (ip: string) => {
    setCustomIPs((prev) => prev.filter((i) => i !== ip));
  };

  const addInclude = useCallback(async () => {
    let trimmed = newInclude.trim();
    // Remove include: prefix if user added it
    if (trimmed.startsWith("include:")) {
      trimmed = trimmed.replace("include:", "");
    }
    if (!trimmed || customIncludes.some((inc) => inc.domain === trimmed)) {
      return;
    }

    setNewInclude("");
    setNewIncludeLoading(true);

    // Add with loading state
    const newInc: CustomInclude = {
      domain: trimmed,
      lookups: null,
      loading: true,
    };
    setCustomIncludes((prev) => [...prev, newInc]);

    // Resolve the actual lookup count
    try {
      const lookups = await countSpfLookups(trimmed);
      setCustomIncludes((prev) =>
        prev.map((inc) =>
          inc.domain === trimmed ? { ...inc, lookups, loading: false } : inc
        )
      );
    } catch {
      setCustomIncludes((prev) =>
        prev.map((inc) =>
          inc.domain === trimmed
            ? { ...inc, lookups: 2, loading: false, error: "Failed to resolve" }
            : inc
        )
      );
    }

    setNewIncludeLoading(false);
  }, [newInclude, customIncludes]);

  const removeInclude = (domain: string) => {
    setCustomIncludes((prev) => prev.filter((i) => i.domain !== domain));
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(spfRecord);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getStatusColor = () => {
    if (lookupCount > 10) {
      return "text-destructive";
    }
    if (lookupCount > 7) {
      return "text-warning";
    }
    return "text-success";
  };

  const getProgressColor = () => {
    if (lookupCount > 10) {
      return "bg-destructive";
    }
    if (lookupCount > 7) {
      return "bg-warning";
    }
    return "bg-success";
  };

  return (
    <>
      {/* Current SPF Lookup */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Check Your Current SPF
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            Look up your domain's existing SPF record before building a new one
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Mail className="-translate-y-1/2 absolute top-1/2 left-3 h-5 w-5 text-muted-foreground" />
              <Input
                aria-label="Domain to look up"
                className="h-12 pl-10 text-lg"
                disabled={lookupLoading}
                onChange={(e) => setLookupDomain(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && lookUpSpf()}
                placeholder="Enter your domain (e.g., example.com)"
                value={lookupDomain}
              />
            </div>
            <Button
              className="h-12"
              disabled={lookupLoading || !lookupDomain.trim()}
              onClick={lookUpSpf}
            >
              {lookupLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Looking up...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Look Up
                </>
              )}
            </Button>
          </div>

          {lookupError && (
            <div
              className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-destructive text-sm dark:text-destructive"
              role="alert"
            >
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {lookupError}
            </div>
          )}

          {lookupResult && (
            <div className="mt-4 space-y-3">
              <div>
                <div className="mb-1.5 font-medium text-sm">
                  Current SPF Record
                </div>
                <code className="block overflow-x-auto whitespace-pre-wrap break-all rounded-lg border bg-muted/50 p-3 font-mono text-sm">
                  {lookupResult.record}
                </code>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">
                  DNS Lookups:{" "}
                  <span
                    className={`font-semibold ${
                      lookupResult.lookups > 10
                        ? "text-destructive"
                        : lookupResult.lookups > 7
                          ? "text-warning"
                          : "text-success"
                    }`}
                  >
                    {lookupResult.lookups}/10
                  </span>
                </span>
              </div>
              {lookupResult.warnings.length > 0 && (
                <div className="space-y-2">
                  {lookupResult.warnings.map((warning) => (
                    <div
                      className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 p-3 text-sm text-warning"
                      key={warning}
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      {warning}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6">
        {/* Lookup Counter */}
        <Card>
          <CardContent>
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium text-muted-foreground text-sm">
                DNS Lookups Used
              </span>
              <span className={`font-bold text-2xl ${getStatusColor()}`}>
                {lookupCount} / 10
              </span>
            </div>
            <div
              aria-label="DNS lookups used"
              aria-valuemax={10}
              aria-valuemin={0}
              aria-valuenow={lookupCount}
              className="h-3 overflow-hidden rounded-full bg-muted"
              role="progressbar"
            >
              <div
                className={`h-full w-(--lookups) transition-all duration-500 ${getProgressColor()}`}
                style={
                  {
                    "--lookups": `${Math.min((lookupCount / 10) * 100, 100)}%`,
                  } as React.CSSProperties
                }
              />
            </div>
            {lookupCount > 10 && (
              <div
                className="mt-3 flex items-start gap-2 text-destructive text-sm"
                role="alert"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>
                  Exceeds 10-lookup limit! SPF will return PermError and DMARC
                  will fail. Consider using IP addresses or SPF flattening.
                </span>
              </div>
            )}
            {lookupCount > 7 && lookupCount <= 10 && (
              <div
                aria-live="polite"
                className="mt-3 flex items-start gap-2 text-warning text-sm"
              >
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>
                  Approaching limit. Consider using ip4/ip6 mechanisms (which
                  don't count) or SPF flattening.
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Provider Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Email Service Providers</CardTitle>
            <p className="text-muted-foreground text-sm">
              Select all the services that send email on behalf of your domain
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {Object.entries(PROVIDERS).map(([key, provider]) => (
                <button
                  aria-label={`${provider.name}, ${provider.lookups} lookup${provider.lookups > 1 ? "s" : ""}`}
                  aria-pressed={selectedProviders.includes(key)}
                  className={`flex items-stretch gap-3 rounded-lg border text-left transition-all ${
                    selectedProviders.includes(key)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-muted/30 hover:border-muted-foreground/50"
                  }`}
                  key={key}
                  onClick={() => toggleProvider(key)}
                  type="button"
                >
                  <div className="flex w-12 shrink-0 items-center justify-center rounded-l-lg bg-muted/50 p-2">
                    <img
                      alt={`${provider.name} logo`}
                      className="h-8 w-8 object-contain grayscale"
                      src={`/logos/${provider.logo}`}
                    />
                  </div>
                  <div className="flex flex-col justify-center py-2 pr-3">
                    <span className="font-medium text-sm leading-tight">
                      {provider.name}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      +{provider.lookups} lookup
                      {provider.lookups > 1 ? "s" : ""}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Custom include input */}
            <div className="mt-4 border-t pt-4">
              <p className="mb-2 font-medium text-sm">Other Provider</p>
              <div className="flex gap-2">
                <Input
                  aria-label="Custom SPF include domain"
                  className="flex-1 font-mono text-sm"
                  disabled={newIncludeLoading}
                  onChange={(e) => setNewInclude(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addInclude()}
                  placeholder="_spf.example.com"
                  value={newInclude}
                />
                <Button
                  aria-label="Add include"
                  disabled={newIncludeLoading || !newInclude.trim()}
                  onClick={addInclude}
                  variant="secondary"
                >
                  {newIncludeLoading ? (
                    <Loader2
                      aria-hidden="true"
                      className="h-4 w-4 animate-spin"
                    />
                  ) : (
                    <Plus aria-hidden="true" className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="mt-1.5 text-muted-foreground text-xs">
                Add any SPF include mechanism. We'll resolve the actual lookup
                count.
              </p>
              {customIncludes.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {customIncludes.map((inc) => (
                    <span
                      className="inline-flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1.5 text-sm"
                      key={inc.domain}
                    >
                      <span className="font-mono">include:{inc.domain}</span>
                      <span className="text-muted-foreground">
                        {inc.loading ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          `+${inc.lookups}`
                        )}
                      </span>
                      <button
                        aria-label={`Remove ${inc.domain}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => removeInclude(inc.domain)}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Custom IPs */}
        <Card>
          <CardHeader>
            <CardTitle>Custom IP Addresses</CardTitle>
            <p className="text-muted-foreground text-sm">
              IP mechanisms don't count toward the 10-lookup limit. Add
              dedicated sending IPs here.
            </p>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex gap-2">
              <Input
                aria-label="Custom IP address"
                className="flex-1"
                onChange={(e) => setNewIP(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addIP()}
                placeholder="Enter IPv4 or IPv6 address (e.g., 192.0.2.1 or 2001:db8::1)"
                value={newIP}
              />
              <Button
                aria-label="Add IP address"
                onClick={addIP}
                variant="secondary"
              >
                <Plus aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
            {customIPs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {customIPs.map((ip) => (
                  <span
                    className="inline-flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-1.5 font-mono text-sm"
                    key={ip}
                  >
                    {ip.includes(":") ? "ip6:" : "ip4:"}
                    {ip}
                    <button
                      aria-label={`Remove IP ${ip}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeIP(ip)}
                      type="button"
                    >
                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Qualifier Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Catch-all Qualifier</CardTitle>
            <p className="text-muted-foreground text-sm">
              What should happen to mail from unauthorized sources?
            </p>
          </CardHeader>
          <CardContent>
            <fieldset aria-label="SPF qualifier" className="space-y-2">
              {Object.entries(QUALIFIERS).map(([key, q]) => (
                <label
                  className={`flex w-full cursor-pointer rounded-lg border p-3 text-left transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 ${
                    qualifier === key
                      ? "border-primary bg-primary/10"
                      : "border-border bg-muted/30 hover:border-muted-foreground/50"
                  }`}
                  key={key}
                >
                  <input
                    checked={qualifier === key}
                    className="sr-only"
                    name="spf-qualifier"
                    onChange={() => setQualifier(key)}
                    type="radio"
                    value={key}
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium">
                        {q.label}
                        {q.recommended && (
                          <Badge className="ml-2" variant="secondary">
                            Recommended
                          </Badge>
                        )}
                      </span>
                      {qualifier === key && (
                        <Check className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <p className="mt-1 text-muted-foreground text-sm">
                      {q.description}
                    </p>
                  </div>
                </label>
              ))}
            </fieldset>
          </CardContent>
        </Card>

        {/* Generated Record */}
        <Card className="border-primary/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Generated SPF Record</CardTitle>
              <Button onClick={copyToClipboard} size="sm" variant="secondary">
                <Copy className="mr-2 h-4 w-4" />
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border bg-muted/50 p-4 font-mono text-sm">
              <span className="text-muted-foreground">v=spf1</span>
              {customIPs.map((ip) => (
                <span className="text-brand" key={ip}>
                  {" "}
                  {ip.includes(":") ? "ip6:" : "ip4:"}
                  {ip}
                </span>
              ))}
              {selectedProviders.map((p) => (
                <span className="text-success" key={p}>
                  {" "}
                  {PROVIDERS[p]?.mechanism}
                </span>
              ))}
              {customIncludes.map((inc) => (
                <span className="text-info" key={inc.domain}>
                  {" "}
                  include:{inc.domain}
                </span>
              ))}
              <span
                className={
                  qualifier === "-all" || qualifier === "~all"
                    ? "text-success"
                    : "text-muted-foreground"
                }
              >
                {" "}
                {qualifier}
              </span>
            </div>
            <p className="mt-3 text-muted-foreground text-xs">
              Add this as a TXT record at your domain's root (@). If you already
              have an SPF record, you'll need to merge them — you can only have
              one SPF record per domain.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
