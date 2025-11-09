export function Features() {
  return (
    <section className="container pb-24">
      <div className="mx-auto max-w-[980px]">
        <h2 className="mb-12 text-balance text-center font-bold text-3xl leading-tight tracking-tighter md:text-5xl lg:leading-[1.1]">
          SaaS-like DX for your
          <br />
          AWS infrastructure
        </h2>
        <div className="grid gap-8 md:grid-cols-3">
          <div className="flex flex-col gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-card">
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 className="font-bold text-xl">Deploy with CLI</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              One command to deploy all infrastructure to your AWS account. No
              clicking through consoles or manual configuration.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-card">
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 className="font-bold text-xl">Local Console</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              View email lists, details, and real-time metrics in a beautiful
              local dashboard. No AWS Console needed.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-card">
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3 className="font-bold text-xl">Simple SDK</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Send emails with a developer-friendly SDK. TypeScript-first with
              great autocomplete and error messages.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
