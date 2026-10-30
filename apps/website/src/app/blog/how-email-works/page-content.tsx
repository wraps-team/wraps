"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { Card } from "@wraps/ui/components/ui/card";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Monitor,
  Server,
  X,
} from "lucide-react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
} from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { trackEvent } from "@/utils/analytics";

// ---------------------------------------------------------------------------
// HeroScrollButton — client component for smooth scroll
// ---------------------------------------------------------------------------
export const HeroScrollButton = () => (
  <button
    className="mx-auto flex items-center justify-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
    onClick={() => {
      document
        .getElementById("compose")
        ?.scrollIntoView({ behavior: "smooth" });
    }}
    type="button"
  >
    <ChevronDown className="h-5 w-5 animate-bounce" />
    <span className="text-sm">Start the journey</span>
  </button>
);

// ---------------------------------------------------------------------------
// Zustand store — reading progress tracking
// ---------------------------------------------------------------------------
type ReadingStore = {
  sectionsVisited: Set<string>;
  predictionsCorrect: number;
  predictionsTotal: number;
  completed: boolean;
  markSectionVisited: (id: string) => void;
  recordPrediction: (correct: boolean) => void;
  markComplete: () => void;
};

const useReadingStore = create<ReadingStore>((set) => ({
  sectionsVisited: new Set<string>(),
  predictionsCorrect: 0,
  predictionsTotal: 0,
  completed: false,
  markSectionVisited: (id) =>
    set((s) => {
      const next = new Set(s.sectionsVisited);
      next.add(id);
      return { sectionsVisited: next };
    }),
  recordPrediction: (correct) =>
    set((s) => ({
      predictionsTotal: s.predictionsTotal + 1,
      predictionsCorrect: s.predictionsCorrect + (correct ? 1 : 0),
    })),
  markComplete: () => set({ completed: true }),
}));

// ---------------------------------------------------------------------------
// SectionReveal — fade-in-up wrapper with reduced motion support
// ---------------------------------------------------------------------------
export const SectionReveal = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  const prefersReduced = useReducedMotion();
  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.5, ease: [0.21, 0.47, 0.32, 0.98] }}
      viewport={{ once: true, margin: "-100px" }}
      whileInView={{ opacity: 1, y: 0 }}
    >
      {children}
    </motion.div>
  );
};

// ---------------------------------------------------------------------------
// ReadingProgress — thin progress bar fixed at top
// ---------------------------------------------------------------------------
export const ReadingProgress = () => {
  const prefersReduced = useReducedMotion();
  const { scrollYProgress } = useScroll();

  if (prefersReduced) {
    return null;
  }

  return (
    <motion.div
      className="fixed top-0 right-0 left-0 z-50 h-1 origin-left bg-gradient-to-r from-brand to-warning"
      style={{ scaleX: scrollYProgress }}
    />
  );
};

// ---------------------------------------------------------------------------
// ChapterNav — sticky chapter navigation
// ---------------------------------------------------------------------------
const CHAPTERS = [
  { id: "hero", label: "Intro" },
  { id: "compose", label: "Compose" },
  { id: "handshake", label: "Handshake" },
  { id: "lookup", label: "Lookup" },
  { id: "relay", label: "Relay" },
  { id: "trust", label: "Trust" },
  { id: "inbox", label: "Inbox" },
  { id: "deep-cuts", label: "Deep Cuts" },
];

export const ChapterNav = () => {
  const [activeId, setActiveId] = useState("hero");
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
            useReadingStore.getState().markSectionVisited(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px" }
    );

    for (const ch of CHAPTERS) {
      const el = document.getElementById(ch.id);
      if (el) {
        observer.observe(el);
      }
    }
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: prefersReduced ? "instant" : "smooth" });
  };

  return (
    <nav className="sticky top-2 z-40 mx-auto mb-12 max-w-4xl">
      <div className="flex gap-1 overflow-x-auto rounded-full border bg-background/80 px-2 py-1.5 shadow-sm backdrop-blur-sm">
        {CHAPTERS.map((ch) => (
          <button
            className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeId === ch.id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
            key={ch.id}
            onClick={() => scrollTo(ch.id)}
            type="button"
          >
            {ch.label}
          </button>
        ))}
      </div>
    </nav>
  );
};

// ---------------------------------------------------------------------------
// ParallaxHero — scrolling SMTP conversation background
// ---------------------------------------------------------------------------
const SMTP_CONVERSATIONS = [
  {
    type: "S",
    text: "220 mail.example.com ESMTP ready",
    color: "text-success/70",
  },
  { type: "C", text: "EHLO yourcompany.com", color: "text-info/70" },
  { type: "S", text: "250-mail.example.com Hello", color: "text-success/70" },
  { type: "S", text: "250-STARTTLS", color: "text-success/50" },
  { type: "S", text: "250 Ok", color: "text-success/70" },
  {
    type: "C",
    text: "MAIL FROM:<you@yourcompany.com>",
    color: "text-info/70",
  },
  { type: "S", text: "250 2.1.0 Ok", color: "text-success/70" },
  { type: "C", text: "RCPT TO:<alice@example.com>", color: "text-info/70" },
  { type: "S", text: "250 2.1.5 Ok", color: "text-success/70" },
  { type: "C", text: "DATA", color: "text-info/70" },
  {
    type: "S",
    text: "354 End data with <CR><LF>.<CR><LF>",
    color: "text-success/50",
  },
  { type: "C", text: "From: you@yourcompany.com", color: "text-info/50" },
  { type: "C", text: "To: alice@example.com", color: "text-info/50" },
  { type: "C", text: "Subject: Quick question", color: "text-info/50" },
  { type: "C", text: ".", color: "text-info/70" },
  {
    type: "S",
    text: "250 2.0.0 Ok: queued as ABC123",
    color: "text-success/70",
  },
  { type: "C", text: "QUIT", color: "text-info/70" },
  { type: "S", text: "221 2.0.0 Bye", color: "text-success/70" },
  { type: " ", text: "", color: "text-transparent" },
  {
    type: "S",
    text: "220 mx.recipient.org ESMTP Postfix",
    color: "text-success/70",
  },
  { type: "C", text: "EHLO relay.google.com", color: "text-info/70" },
  { type: "S", text: "250-mx.recipient.org", color: "text-success/70" },
  { type: "S", text: "250-AUTH PLAIN LOGIN", color: "text-success/50" },
  { type: "S", text: "250 Ok", color: "text-success/70" },
  {
    type: "C",
    text: "MAIL FROM:<bounce+id=abc@yourcompany.com>",
    color: "text-info/60",
  },
  { type: "S", text: "250 2.1.0 Ok", color: "text-success/70" },
  { type: "C", text: "RCPT TO:<bob@recipient.org>", color: "text-info/70" },
  { type: "S", text: "250 2.1.5 Ok", color: "text-success/70" },
  { type: "C", text: "DATA", color: "text-info/70" },
  { type: "S", text: "354 Go ahead", color: "text-success/50" },
  {
    type: "C",
    text: "DKIM-Signature: v=1; a=rsa-sha256; d=yourcompany.com",
    color: "text-brand/55",
  },
  {
    type: "C",
    text: "Authentication-Results: spf=pass dkim=pass dmarc=pass",
    color: "text-brand/55",
  },
  { type: "C", text: ".", color: "text-info/70" },
  {
    type: "S",
    text: "250 2.0.0 Ok: queued as DEF456",
    color: "text-success/70",
  },
  { type: "C", text: "QUIT", color: "text-info/70" },
  { type: "S", text: "221 Bye", color: "text-success/70" },
];

export const ParallaxHero = () => {
  const prefersReduced = useReducedMotion();
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (prefersReduced) {
      return;
    }
    const interval = setInterval(() => {
      setOffset((prev) => (prev + 1) % (SMTP_CONVERSATIONS.length * 24));
    }, 60);
    return () => clearInterval(interval);
  }, [prefersReduced]);

  if (prefersReduced) {
    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-15">
        <div className="mx-auto max-w-2xl px-4 pt-16 font-mono text-xs">
          {SMTP_CONVERSATIONS.slice(0, 18).map((line, i) => (
            <div className={line.color.replace(/\/\d+/, "")} key={i}>
              {line.type !== " " && (
                <span className="text-muted-foreground">{line.type}: </span>
              )}
              {line.text}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-80 dark:opacity-70">
      <div
        className="mx-auto max-w-2xl whitespace-nowrap px-4 text-left font-mono text-xs leading-6"
        style={{ transform: `translateY(-${offset}px)` }}
      >
        {/* Repeat the conversation several times so it scrolls continuously */}
        {Array.from({ length: 8 }).map((_, rep) =>
          SMTP_CONVERSATIONS.map((line, i) => (
            <div className={line.color} key={`${rep}-${i}`}>
              {line.type !== " " && (
                <span
                  className={
                    line.type === "S" ? "text-success/60" : "text-info/60"
                  }
                >
                  {line.type}:{" "}
                </span>
              )}
              {line.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ComposeViewer — split-screen compose UI <-> raw SMTP
// ---------------------------------------------------------------------------
export const ComposeViewer = () => {
  const [to, setTo] = useState("alice@example.com");
  const [from, setFrom] = useState("you@yourcompany.com");
  const [subject, setSubject] = useState("Quick question about the project");
  const [body, setBody] = useState(
    "Hi Alice,\n\nJust wanted to follow up on our conversation yesterday.\n\nBest,\nYou"
  );
  const [activeHighlight, setActiveHighlight] = useState<string | null>(null);
  const [messageHeaders, setMessageHeaders] = useState<{
    date: string;
    id: string;
  }>({
    date: "",
    id: "example-id",
  });

  useEffect(() => {
    setMessageHeaders({
      date: new Date().toUTCString(),
      id: String(Date.now()),
    });
  }, []);

  const highlightClass = (field: string) =>
    activeHighlight === field
      ? "bg-brand/20 rounded px-1 -mx-1 transition-colors"
      : "transition-colors";

  const rawMessage = useMemo(() => {
    const _boundary = "----=_Part_001";
    return `EHLO yourcompany.com
MAIL FROM:<${from}>
RCPT TO:<${to}>
DATA
From: ${from}
To: ${to}
Subject: ${subject}
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Date: ${messageHeaders.date}
Message-ID: <${messageHeaders.id}@yourcompany.com>

${body}
.
QUIT`;
  }, [to, from, subject, body, messageHeaders]);

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid md:grid-cols-2">
        {/* Compose UI */}
        <div className="border-b p-4 md:border-r md:border-b-0">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Monitor className="h-4 w-4" />
            What you see
          </div>
          <div className="space-y-3">
            <div>
              <label
                className="mb-1 block text-xs text-muted-foreground"
                htmlFor="compose-from"
              >
                From
              </label>
              <input
                className={`w-full rounded border bg-muted/50 px-3 py-1.5 text-sm ${highlightClass("from")}`}
                id="compose-from"
                onBlur={() => setActiveHighlight(null)}
                onChange={(e) => setFrom(e.target.value)}
                onFocus={() => setActiveHighlight("from")}
                value={from}
              />
            </div>
            <div>
              <label
                className="mb-1 block text-xs text-muted-foreground"
                htmlFor="compose-to"
              >
                To
              </label>
              <input
                className={`w-full rounded border bg-muted/50 px-3 py-1.5 text-sm ${highlightClass("to")}`}
                id="compose-to"
                onBlur={() => setActiveHighlight(null)}
                onChange={(e) => setTo(e.target.value)}
                onFocus={() => setActiveHighlight("to")}
                value={to}
              />
            </div>
            <div>
              <label
                className="mb-1 block text-xs text-muted-foreground"
                htmlFor="compose-subject"
              >
                Subject
              </label>
              <input
                className={`w-full rounded border bg-muted/50 px-3 py-1.5 text-sm ${highlightClass("subject")}`}
                id="compose-subject"
                onBlur={() => setActiveHighlight(null)}
                onChange={(e) => setSubject(e.target.value)}
                onFocus={() => setActiveHighlight("subject")}
                value={subject}
              />
            </div>
            <div>
              <label
                className="mb-1 block text-xs text-muted-foreground"
                htmlFor="compose-body"
              >
                Body
              </label>
              <textarea
                className={`w-full rounded border bg-muted/50 px-3 py-1.5 text-sm ${highlightClass("body")}`}
                id="compose-body"
                onBlur={() => setActiveHighlight(null)}
                onChange={(e) => setBody(e.target.value)}
                onFocus={() => setActiveHighlight("body")}
                rows={5}
                value={body}
              />
            </div>
          </div>
        </div>

        {/* Raw SMTP */}
        <div className="p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Server className="h-4 w-4" />
            What the server sees
          </div>
          <pre className="overflow-x-auto rounded bg-muted/50 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
            {rawMessage.split("\n").map((line, i) => {
              let hl = false;
              if (activeHighlight === "from" && line.includes(from)) {
                hl = true;
              }
              if (activeHighlight === "to" && line.includes(to)) {
                hl = true;
              }
              if (
                activeHighlight === "subject" &&
                line.startsWith("Subject:")
              ) {
                hl = true;
              }
              if (
                activeHighlight === "body" &&
                !line.startsWith("EHLO") &&
                !line.startsWith("MAIL") &&
                !line.startsWith("RCPT") &&
                !line.startsWith("DATA") &&
                !line.startsWith("From:") &&
                !line.startsWith("To:") &&
                !line.startsWith("Subject:") &&
                !line.startsWith("MIME") &&
                !line.startsWith("Content-Type") &&
                !line.startsWith("Date:") &&
                !line.startsWith("Message-ID") &&
                !line.startsWith(".") &&
                !line.startsWith("QUIT") &&
                line.trim() !== "" &&
                i > 10
              ) {
                hl = true;
              }
              return (
                <span
                  className={hl ? "bg-brand/20 text-foreground" : ""}
                  key={i}
                >
                  {line}
                  {"\n"}
                </span>
              );
            })}
          </pre>
        </div>
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// SmtpTerminal — interactive SMTP terminal simulator
// ---------------------------------------------------------------------------
type TerminalLine = {
  type: "client" | "server" | "info";
  text: string;
};

const SMTP_STEPS = [
  {
    hint: "Connect to the mail server",
    expect: "EHLO yourcompany.com",
    match: /^EHLO(\s|$)/i,
    response: [
      "250-mail.example.com Hello yourcompany.com",
      "250-SIZE 35882577",
      "250-8BITMIME",
      "250-STARTTLS",
      "250-AUTH LOGIN PLAIN",
      "250 Ok",
    ],
  },
  {
    hint: "Set the sender (envelope from)",
    expect: "MAIL FROM:<you@yourcompany.com>",
    match: /^MAIL FROM:/i,
    response: ["250 2.1.0 Ok"],
  },
  {
    hint: "Set the recipient",
    expect: "RCPT TO:<alice@example.com>",
    match: /^RCPT TO:/i,
    response: ["250 2.1.5 Ok"],
  },
  {
    hint: "Begin message data",
    expect: "DATA",
    match: /^DATA$/i,
    response: ["354 End data with <CR><LF>.<CR><LF>"],
  },
  {
    hint: "Type your message, then send a single dot (.) on its own line",
    expect: ".",
    match: /^\.$/,
    response: ["250 2.0.0 Ok: queued as ABC123DEF"],
  },
  {
    hint: "End the session",
    expect: "QUIT",
    match: /^QUIT$/i,
    response: ["221 2.0.0 Bye"],
  },
];

export const SmtpTerminal = () => {
  const [history, setHistory] = useState<TerminalLine[]>([
    { type: "server", text: "220 mail.example.com ESMTP ready" },
  ]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"guided" | "free">("guided");
  const [done, setDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || done) {
        return;
      }

      const cmd = input.trim();
      const newLines: TerminalLine[] = [{ type: "client", text: cmd }];

      if (mode === "guided") {
        const currentStep = SMTP_STEPS[step];
        if (currentStep?.match.test(cmd)) {
          // Correct command
          for (const line of currentStep.response) {
            newLines.push({ type: "server", text: line });
          }
          const nextStep = step + 1;
          if (nextStep >= SMTP_STEPS.length) {
            newLines.push({
              type: "info",
              text: "Session complete! You just sent an email via SMTP.",
            });
            setDone(true);
          }
          setStep(nextStep);
        } else {
          newLines.push({
            type: "server",
            text: "502 5.5.2 Error: command not recognized",
          });
          newLines.push({
            type: "info",
            text: `Hint: try ${currentStep?.expect}`,
          });
        }
      } else {
        // Free mode — match any valid SMTP command
        const matched = SMTP_STEPS.find((s) => s.match.test(cmd));
        if (matched) {
          for (const line of matched.response) {
            newLines.push({ type: "server", text: line });
          }
        } else {
          newLines.push({
            type: "server",
            text: "502 5.5.2 Error: command not recognized",
          });
        }
      }

      setHistory((prev) => [...prev, ...newLines]);
      setInput("");
    },
    [input, step, mode, done]
  );

  const reset = () => {
    setHistory([{ type: "server", text: "220 mail.example.com ESMTP ready" }]);
    setStep(0);
    setDone(false);
    setInput("");
  };

  return (
    <Card className="overflow-hidden p-0">
      {/* Terminal header */}
      <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-destructive" />
          <div className="h-3 w-3 rounded-full bg-warning" />
          <div className="h-3 w-3 rounded-full bg-success" />
          <span className="ml-2 font-mono text-xs text-muted-foreground">
            smtp — telnet mail.example.com 25
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={`rounded px-2 py-0.5 font-mono text-xs transition-colors ${
              mode === "guided"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              setMode("guided");
              reset();
            }}
            type="button"
          >
            guided
          </button>
          <button
            className={`rounded px-2 py-0.5 font-mono text-xs transition-colors ${
              mode === "free"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              setMode("free");
              reset();
            }}
            type="button"
          >
            free
          </button>
        </div>
      </div>

      {/* Terminal body */}
      <div
        className="dark h-80 overflow-y-auto bg-terminal p-4 font-mono text-sm"
        ref={scrollRef}
      >
        <AnimatePresence initial={false}>
          {history.map((line, i) => (
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className={`${
                line.type === "server"
                  ? "text-success"
                  : line.type === "info"
                    ? "text-warning italic"
                    : "text-terminal-foreground"
              }`}
              exit={{ opacity: 0 }}
              initial={{ opacity: 0, y: 4 }}
              key={i}
              transition={{ duration: 0.15 }}
            >
              {line.type === "client" && (
                <span className="text-info">{"C: "}</span>
              )}
              {line.type === "server" && (
                <span className="text-success">{"S: "}</span>
              )}
              {line.type === "info" && (
                <span className="text-warning">{"# "}</span>
              )}
              {line.text}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Step indicator for guided mode */}
        {mode === "guided" && !done && step < SMTP_STEPS.length && (
          <div className="mt-2 text-terminal-muted text-xs">
            Step {step + 1}/{SMTP_STEPS.length}: {SMTP_STEPS[step].hint}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        className="dark flex items-center border-t bg-terminal px-4 py-2"
        onSubmit={handleSubmit}
      >
        <span className="mr-2 font-mono text-info text-sm">{">"}</span>
        <input
          aria-label="SMTP command input"
          className="flex-1 bg-transparent font-mono text-sm text-terminal-foreground placeholder-terminal-muted outline-none"
          disabled={done}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            done
              ? "Session ended"
              : mode === "guided" && step < SMTP_STEPS.length
                ? SMTP_STEPS[step].expect
                : "Type an SMTP command..."
          }
          value={input}
        />
        {done && (
          <button
            className="ml-2 rounded bg-terminal-border px-3 py-1 font-mono text-xs text-terminal-foreground hover:bg-terminal-border/70"
            onClick={reset}
            type="button"
          >
            Reset
          </button>
        )}
      </form>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// MxLookup — live MX record lookup
// ---------------------------------------------------------------------------
const API_URL = "https://api.wraps.dev";

export const MxLookup = () => {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    mx?: Array<{ priority: number; exchange: string }>;
    domain?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lookup = async () => {
    if (!domain.trim()) {
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      trackEvent("tool_use", { tool: "mx-lookup" });
      const res = await fetch(`${API_URL}/tools/email-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim(), quick: true }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        // Extract MX records from the response
        setResult({ domain: data.domain, mx: data.mx?.records || [] });
      }
    } catch {
      setError("Failed to look up MX records. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <h3 className="mb-4 font-semibold text-foreground text-lg">
        MX Record Lookup
      </h3>

      <div className="mb-4 flex gap-2">
        <input
          aria-label="Domain name for MX lookup"
          className="flex-1 rounded-lg border bg-background px-4 py-2 text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
          onChange={(e) => setDomain(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
          placeholder="example.com"
          type="text"
          value={domain}
        />
        <Button disabled={loading} onClick={lookup}>
          {loading ? "Looking up..." : "Lookup"}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <p className="text-destructive text-sm dark:text-destructive">
            {error}
          </p>
        </div>
      )}

      {result?.mx && (
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            DNS path:{" "}
            <span className="font-mono text-foreground">
              . → {domain.split(".").pop()} → {result.domain}
            </span>
          </div>

          {result.mx.length > 0 ? (
            <div className="overflow-hidden rounded-lg border">
              <div className="grid grid-cols-[80px_1fr] border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
                <span>Priority</span>
                <span>Mail Server</span>
              </div>
              {result.mx
                .sort((a, b) => a.priority - b.priority)
                .map((record, i) => (
                  <motion.div
                    animate={{ opacity: 1, x: 0 }}
                    className="grid grid-cols-[80px_1fr] border-b px-4 py-2 font-mono text-sm last:border-b-0"
                    initial={{ opacity: 0, x: -10 }}
                    key={i}
                    transition={{ delay: i * 0.1, duration: 0.2 }}
                  >
                    <span className="text-brand-text">{record.priority}</span>
                    <span className="text-foreground">{record.exchange}</span>
                  </motion.div>
                ))}
            </div>
          ) : (
            <div className="rounded-lg border border-warning/50 bg-warning/10 p-3">
              <p className="text-sm text-warning">
                No MX records found. This domain may not accept email.
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------
// AuthVisualizer — three-panel SPF/DKIM/DMARC visualizer
// ---------------------------------------------------------------------------
export const AuthVisualizer = () => {
  const [activePanel, setActivePanel] = useState<"spf" | "dkim" | "dmarc">(
    "spf"
  );

  const panels = {
    spf: {
      title: "SPF",
      color: "blue",
      borderColor: "border-l-info",
      bgColor: "bg-info/10",
      question: "Is this server allowed to send for this domain?",
      steps: [
        "Receiving server extracts Return-Path domain",
        "Queries DNS for SPF record (TXT)",
        "Checks if sending IP is in the allowed list",
        "Returns Pass, Fail, SoftFail, or Neutral",
      ],
    },
    dkim: {
      title: "DKIM",
      color: "brand",
      borderColor: "border-l-brand",
      bgColor: "bg-brand/10",
      question: "Was this email tampered with in transit?",
      steps: [
        "Sending server signs email headers + body with private key",
        "Adds DKIM-Signature header with selector & domain",
        "Receiver queries DNS for public key (selector._domainkey.domain)",
        "Verifies signature — Pass if headers/body unchanged",
      ],
    },
    dmarc: {
      title: "DMARC",
      color: "green",
      borderColor: "border-l-success",
      bgColor: "bg-success/10",
      question:
        "Does the From: domain align with SPF/DKIM, and what to do if not?",
      steps: [
        "Check: does SPF pass AND align with From: domain?",
        "Check: does DKIM pass AND align with From: domain?",
        "If either passes + aligns → DMARC Pass",
        "If both fail → apply policy (none / quarantine / reject)",
      ],
    },
  };

  const p = panels[activePanel];

  return (
    <Card className="p-6">
      <div className="mb-6 flex gap-2">
        {(Object.keys(panels) as Array<keyof typeof panels>).map((key) => (
          <button
            className={`rounded-lg px-4 py-2 font-medium transition-all ${
              activePanel === key
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
            key={key}
            onClick={() => setActivePanel(key)}
            type="button"
          >
            {key.toUpperCase()}
          </button>
        ))}
      </div>

      <div
        className={`rounded-r-lg border-l-4 p-4 ${p.borderColor} ${p.bgColor}`}
      >
        <h4 className="mb-1 font-semibold text-foreground">{p.title}</h4>
        <p className="mb-4 text-sm italic text-muted-foreground">
          {p.question}
        </p>

        <div className="space-y-2">
          {p.steps.map((s, i) => (
            <div className="flex items-start gap-2" key={i}>
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-xs font-medium text-foreground">
                {i + 1}
              </span>
              <span className="text-sm text-foreground/80">{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Chain visualization */}
      <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span className="rounded bg-info/20 px-2 py-0.5 text-info">SPF</span>
        <ArrowRight className="h-3 w-3" />
        <span className="rounded bg-brand/20 px-2 py-0.5 text-brand-text">
          DKIM
        </span>
        <ArrowRight className="h-3 w-3" />
        <span className="rounded bg-success/20 px-2 py-0.5 text-success">
          DMARC
        </span>
        <ArrowRight className="h-3 w-3" />
        <span className="rounded bg-muted px-2 py-0.5 text-foreground">
          Inbox or Reject
        </span>
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// PredictionPrompt — "will this email pass?" quiz
// ---------------------------------------------------------------------------
type PredictionPromptProps = {
  question: string;
  options: Array<{ label: string; correct: boolean; explanation: string }>;
};

export const PredictionPrompt = ({
  question,
  options,
}: PredictionPromptProps) => {
  const [selected, setSelected] = useState<number | null>(null);
  const recordPrediction = useReadingStore((s) => s.recordPrediction);

  const handleSelect = (index: number) => {
    if (selected !== null) {
      return; // Already answered
    }
    setSelected(index);
    recordPrediction(options[index].correct);
  };

  return (
    <Card className="border-warning/30 bg-warning/10 p-6">
      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <span className="font-medium text-sm text-foreground">Prediction</span>
      </div>
      <p className="mb-4 text-foreground">{question}</p>
      <div className="space-y-2">
        {options.map((opt, i) => {
          const isSelected = selected === i;
          const showResult = selected !== null;
          return (
            <button
              className={`w-full rounded-lg border p-3 text-left text-sm transition-all ${
                showResult
                  ? opt.correct
                    ? "border-success/50 bg-success/10"
                    : isSelected
                      ? "border-destructive/50 bg-destructive/10"
                      : "border-border bg-muted/30 opacity-60"
                  : "border-border hover:border-primary/50 hover:bg-muted/50"
              }`}
              disabled={selected !== null}
              key={i}
              onClick={() => handleSelect(i)}
              type="button"
            >
              <div className="flex items-center justify-between">
                <span>{opt.label}</span>
                {showResult && opt.correct && (
                  <Check className="h-4 w-4 text-success" />
                )}
                {showResult && isSelected && !opt.correct && (
                  <X className="h-4 w-4 text-destructive" />
                )}
              </div>
              {showResult && (isSelected || opt.correct) && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {opt.explanation}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// RelayMap — animated server hop diagram
// ---------------------------------------------------------------------------
const RELAY_NODES = [
  { label: "Your Server", header: "Received: from yourcompany.com" },
  { label: "Outbound MTA", header: "Received: by smtp-relay.gmail.com" },
  {
    label: "Recipient MX",
    header: "Received: from smtp-relay by mx.example.com",
  },
  { label: "Inbox Server", header: "Received: by imap.example.com" },
];

export const RelayMap = () => {
  const prefersReduced = useReducedMotion();

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {RELAY_NODES.map((node, i) => (
          <div
            className="flex items-center gap-3 sm:flex-col sm:items-center sm:gap-2 sm:flex-1"
            key={i}
          >
            {/* Node */}
            {prefersReduced ? (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">
                {i + 1}
              </div>
            ) : (
              <motion.div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground"
                initial={{ scale: 0, opacity: 0 }}
                transition={{
                  delay: i * 0.2,
                  duration: 0.4,
                  type: "spring",
                  stiffness: 200,
                  damping: 20,
                }}
                viewport={{ once: true }}
                whileInView={{ scale: 1, opacity: 1 }}
              />
            )}

            {/* Arrow (between nodes, not after last) */}
            {i < RELAY_NODES.length - 1 && (
              <ArrowRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
            )}

            {/* Label + header */}
            <div className="sm:text-center">
              <div className="font-medium text-sm text-foreground">
                {node.label}
              </div>
              <div className="font-mono text-3xs text-muted-foreground leading-tight">
                {node.header}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Connection line (desktop) */}
      <div className="relative mx-auto mt-4 hidden h-1 w-4/5 sm:block">
        {prefersReduced ? (
          <div className="h-full rounded-full bg-gradient-to-r from-brand to-warning" />
        ) : (
          <motion.div
            className="h-full origin-left rounded-full bg-gradient-to-r from-brand to-warning"
            initial={{ scaleX: 0 }}
            transition={{
              duration: 1,
              delay: 0.3,
              ease: [0.21, 0.47, 0.32, 0.98],
            }}
            viewport={{ once: true }}
            whileInView={{ scaleX: 1 }}
          />
        )}
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// HeaderChain — assembled Received header chain from all chapters
// ---------------------------------------------------------------------------
export const HeaderChain = () => {
  const [viewMode, setViewMode] = useState<"parsed" | "raw">("parsed");
  const [expandedHeaders, setExpandedHeaders] = useState<Set<number>>(
    new Set()
  );

  const headers = [
    {
      chapter: "Ch 4: Relay",
      parsed: {
        from: "imap.example.com (internal)",
        by: "imap-store.example.com",
        timestamp: "Fri, 06 Mar 2026 18:30:02 +0000",
      },
      raw: "Received: from imap.example.com (internal [10.0.0.5])\n\tby imap-store.example.com with LMTP\n\tid ABC123; Fri, 06 Mar 2026 18:30:02 +0000",
    },
    {
      chapter: "Ch 5: Trust Check",
      parsed: {
        from: "smtp-relay.gmail.com",
        by: "mx.example.com",
        timestamp: "Fri, 06 Mar 2026 18:30:01 +0000",
        auth: "SPF=pass DKIM=pass DMARC=pass",
      },
      raw: "Received: from smtp-relay.gmail.com (smtp-relay.gmail.com [209.85.128.100])\n\tby mx.example.com with ESMTPS\n\tfor <alice@example.com>; Fri, 06 Mar 2026 18:30:01 +0000\nAuthentication-Results: mx.example.com;\n\tspf=pass; dkim=pass; dmarc=pass",
    },
    {
      chapter: "Ch 2: Handshake",
      parsed: {
        from: "yourcompany.com",
        by: "smtp-relay.gmail.com",
        timestamp: "Fri, 06 Mar 2026 18:30:00 +0000",
      },
      raw: "Received: from yourcompany.com (yourcompany.com [203.0.113.10])\n\tby smtp-relay.gmail.com with ESMTPS\n\tfor <alice@example.com>; Fri, 06 Mar 2026 18:30:00 +0000",
    },
  ];

  const toggleHeader = (index: number) => {
    setExpandedHeaders((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-lg">
          The Complete Header Chain
        </h3>
        <div className="flex gap-1">
          <button
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              viewMode === "parsed"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setViewMode("parsed")}
            type="button"
          >
            Parsed
          </button>
          <button
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              viewMode === "raw"
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setViewMode("raw")}
            type="button"
          >
            Raw
          </button>
        </div>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        Received headers are added in reverse order — the top header is the last
        hop. Read bottom to top to trace the email's journey.
      </p>

      <div className="space-y-2">
        {headers.map((h, i) => (
          <div className="overflow-hidden rounded-lg border" key={i}>
            <button
              className="flex w-full items-center justify-between bg-muted/30 px-4 py-2 text-left"
              onClick={() => toggleHeader(i)}
              type="button"
            >
              <div className="flex items-center gap-2">
                <ChevronRight
                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                    expandedHeaders.has(i) ? "rotate-90" : ""
                  }`}
                />
                <span className="text-xs font-medium text-brand-text">
                  {h.chapter}
                </span>
                {viewMode === "parsed" && (
                  <span className="text-xs text-muted-foreground">
                    {h.parsed.from} → {h.parsed.by}
                  </span>
                )}
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {h.parsed.timestamp
                  .split(",")[1]
                  ?.trim()
                  .split(" ")
                  .slice(0, 3)
                  .join(" ")}
              </span>
            </button>
            {expandedHeaders.has(i) && (
              <div className="border-t bg-muted/10 p-4">
                {viewMode === "parsed" ? (
                  <div className="space-y-1 text-sm">
                    <div>
                      <span className="text-muted-foreground">From: </span>
                      <span className="font-mono text-foreground">
                        {h.parsed.from}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">By: </span>
                      <span className="font-mono text-foreground">
                        {h.parsed.by}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Time: </span>
                      <span className="font-mono text-foreground">
                        {h.parsed.timestamp}
                      </span>
                    </div>
                    {"auth" in h.parsed && (
                      <div>
                        <span className="text-muted-foreground">Auth: </span>
                        <span className="font-mono text-success">
                          {h.parsed.auth}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <pre className="overflow-x-auto font-mono text-xs text-muted-foreground">
                    {h.raw}
                  </pre>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// DeepCutAccordion — expandable FAQ cards for Chapter 7
// ---------------------------------------------------------------------------
const DEEP_CUTS = [
  {
    title: "Bounces: Hard vs Soft",
    content:
      "A hard bounce (5xx) means permanent failure — the address doesn't exist, the domain is invalid, or the server explicitly rejected you. A soft bounce (4xx) is temporary — the inbox is full, the server is overloaded, or you're being greylisted. Hard bounces should immediately remove the address from your list. Soft bounces get retried (most servers retry for 24-72 hours) before giving up. Your bounce rate directly impacts your sender reputation — stay below 2% or risk being throttled by major providers.",
  },
  {
    title: "Greylisting: The Anti-Spam Speed Bump",
    content:
      'Greylisting is a simple but effective anti-spam technique. When a server sees a new sender/recipient/IP combination, it rejects it with a 4xx temporary error and says "try again later." Legitimate mail servers queue and retry after a few minutes. Most spam bots move on to the next target. The downside: a 5-15 minute delay on the first email to a new recipient. The upside: it blocks a surprising amount of spam with zero false positives on retry.',
  },
  {
    title: "Spam Filtering: Beyond Authentication",
    content:
      "Authentication (SPF/DKIM/DMARC) only proves identity — it doesn't prove the email isn't spam. After authentication, the email goes through content filtering: Bayesian classifiers, link reputation checks, sending IP reputation (Spamhaus, Barracuda), engagement signals (do recipients open/click/reply or mark as spam?), header analysis, and increasingly, machine learning models. Gmail's spam filter alone processes 15 billion messages per day and blocks 99.9% of spam (as of 2019).",
  },
  {
    title: "The 10-Lookup SPF Limit",
    content:
      'SPF records are checked via DNS, and each "include:" statement triggers a lookup. RFC 7208 limits this to 10 DNS lookups total. Exceed it and SPF returns PermError — effectively a fail. This is the most common SPF misconfiguration. Add Google Workspace (2 lookups), Salesforce (2), HubSpot (1), Zendesk (1), and SES (1) and you\'re at 7 before adding anything else. Solutions: SPF flattening (inline the IP ranges) or use subdomains for different services.',
  },
  {
    title: "Email Forwarding Breaks SPF",
    content:
      "Here's a dirty secret: email forwarding breaks SPF. When alice@example.com forwards to alice@gmail.com, the forwarding server sends from its own IP — which isn't in example.com's SPF record. SPF fails. This is why DKIM matters: the signature survives forwarding (as long as the message body isn't modified). It's also why DMARC checks both SPF and DKIM — if either passes and aligns, the email is authenticated.",
  },
];

export const DeepCutAccordion = () => {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {DEEP_CUTS.map((cut, i) => (
        <div className="overflow-hidden rounded-lg border" key={i}>
          <button
            className={`flex w-full items-center justify-between px-4 py-3 text-left transition-colors ${
              expanded === i ? "bg-muted/50" : "hover:bg-muted/30"
            }`}
            onClick={() => setExpanded(expanded === i ? null : i)}
            type="button"
          >
            <span className="font-medium text-foreground">{cut.title}</span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                expanded === i ? "rotate-180" : ""
              }`}
            />
          </button>
          {expanded === i && (
            <div className="border-t px-4 py-3">
              <p className="text-foreground/80 text-sm leading-relaxed">
                {cut.content}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
