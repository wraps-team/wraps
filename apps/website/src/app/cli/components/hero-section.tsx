"use client";

import { DotPattern } from "@wraps/ui/components/dot-pattern";
import { Terminal } from "lucide-react";
import { useState } from "react";
import { AsciinemaPlayer } from "@/components/asciinema-player";
import {
  Snippet,
  SnippetCopyButton,
  SnippetHeader,
  SnippetTabsContent,
  SnippetTabsList,
  SnippetTabsTrigger,
} from "@/components/ui/shadcn-io/snippet";
import { assetUrl } from "@/lib/utils";

const installCommands = {
  curl: "curl -fsSL https://get.wraps.dev | sh",
  npm: "npm install -g @wraps.dev/cli",
  pnpm: "pnpm add -g @wraps.dev/cli",
  yarn: "yarn global add @wraps.dev/cli",
  bun: "bun add -g @wraps.dev/cli",
};

type InstallManager = keyof typeof installCommands;

export function CliHeroSection() {
  const [manager, setManager] = useState<InstallManager>("curl");

  return (
    <section className="relative overflow-hidden bg-linear-to-b from-background to-background/80 pt-20 pb-16 sm:pt-28">
      {/* Background Pattern */}
      <div className="absolute inset-0">
        <DotPattern className="opacity-100" fadeStyle="ellipse" size="md" />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left column - Text content */}
          <div>
            {/* Mono tag, no marketing badge */}
            <div className="mb-5 inline-flex items-center gap-2 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
              <span className="size-1.5 rounded-full bg-orange-500" />
              <span>wraps · cli · free forever</span>
            </div>

            {/* Main Headline */}
            <h1 className="mb-6 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
              Deploy email, SMS, and CDN to your AWS{" "}
              <span className="text-orange-500">in one command.</span>
            </h1>

            {/* Subheading */}
            <p className="mb-8 max-w-lg text-pretty text-lg text-muted-foreground">
              Deploy production-ready infrastructure to your AWS account. Domain
              verification, event tracking, local console — all included, all
              free.
            </p>

            {/* Install command */}
            <div className="mb-8 max-w-md">
              <Snippet
                className="border-border bg-card"
                onValueChange={(value) => setManager(value as InstallManager)}
                value={manager}
              >
                <SnippetHeader className="border-border bg-card">
                  <SnippetTabsList className="bg-transparent">
                    {Object.keys(installCommands).map((key) => (
                      <SnippetTabsTrigger key={key} value={key}>
                        {key}
                      </SnippetTabsTrigger>
                    ))}
                  </SnippetTabsList>
                  <SnippetCopyButton
                    className="opacity-100"
                    value={installCommands[manager]}
                  />
                </SnippetHeader>
                {Object.entries(installCommands).map(([key, command]) => (
                  <SnippetTabsContent
                    className="bg-card text-left font-mono text-foreground"
                    key={key}
                    value={key}
                  >
                    <span className="inline-flex items-center gap-2">
                      <Terminal className="size-4 text-muted-foreground" />
                      {command}
                    </span>
                  </SnippetTabsContent>
                ))}
              </Snippet>

              {/*
                The tab component renders only the active command; with
                JavaScript off there is no way to reach the others, and a
                crawler reading visible text sees one install path instead of
                five. Same commands, flattened.
              */}
              <noscript>
                <ul className="mt-3 space-y-1 text-left font-mono text-muted-foreground text-sm">
                  {Object.entries(installCommands).map(([key, command]) => (
                    <li key={key}>{command}</li>
                  ))}
                </ul>
              </noscript>
            </div>
          </div>

          {/* Right column - Terminal Demo */}
          <div className="relative">
            {/* Terminal */}
            <div className="relative overflow-hidden rounded-xl border border-border bg-card">
              {/* Terminal header */}
              <div className="flex items-center gap-2 border-border border-b bg-muted/40 px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="size-3 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                  <div className="size-3 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                  <div className="size-3 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                </div>
                <span className="ml-2 font-mono text-muted-foreground text-xs">
                  terminal — wraps email init
                </span>
              </div>
              {/* Asciinema Player — recording canvas keeps its own dark surface */}
              <div className="bg-[#121314]">
                <AsciinemaPlayer
                  cols={80}
                  fit="width"
                  idleTimeLimit={1}
                  loop={true}
                  rows={24}
                  speed={1.2}
                  src={assetUrl("demos/email-init.cast")}
                  terminalFontSize="12px"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
