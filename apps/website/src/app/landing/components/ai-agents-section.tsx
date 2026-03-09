export function AiAgentsSection() {
  return (
    <section className="py-24 border-y bg-muted/30" id="ai-agents">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="animate-fade-in-up">
          <h2 className="mb-6 font-bold text-3xl tracking-tight md:text-4xl">
            Built for how software ships now.
          </h2>
          <div className="space-y-4 text-lg text-muted-foreground">
            <p>
              AI agents don't click through dashboard builders. They write code.
              They open PRs. They iterate in seconds.
            </p>
            <p>
              Wraps workflows are TypeScript files. Wraps templates are React
              components. An agent can write a welcome series, test it, and
              deploy it — the same way your team does.
            </p>
            <p>
              The platforms built for human marketers clicking through GUIs
              weren't designed for this. Wraps was.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
