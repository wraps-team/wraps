import { DotPattern } from "@wraps/ui/components/dot-pattern";
import { FlowBox } from "@/app/landing/components/flow-primitives";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { TrackedCtaPair } from "@/components/tracked-cta-pair";

const STEPS = [
  { title: "Sign up free", body: "No credit card." },
  {
    title: "Connect your AWS",
    body: "In your browser, from the command line, or with your AI agent.",
  },
  {
    title: "Describe it to the AI",
    body: "It writes the template; you preview it and ask for changes.",
  },
];

/**
 * The editor panel mirrors what ships: Monaco code with an AI chat panel and
 * a live preview (apps/web CLAUDE.md "Template Editor"). It shows the chat and
 * the preview, never a visual block editor.
 */
function EditorPanel() {
  return (
    <FlowBox label="Template editor · Welcome">
      <div aria-hidden="true" className="grid gap-3 sm:grid-cols-[1fr_1.2fr]">
        <div className="grid content-start gap-2">
          <p className="border border-border p-2.5 text-xs leading-relaxed">
            <b>Ask AI:</b> add a hero image and a button to book a call
          </p>
          <p className="flex flex-wrap gap-1.5 text-muted-foreground text-xs">
            <span className="border border-border px-2 py-0.5">Brand kit</span>
            <span className="border border-border px-2 py-0.5">Preview</span>
            <span className="border border-border px-2 py-0.5">History</span>
          </p>
        </div>
        <div className="grid gap-1.5 border border-border bg-muted/40 p-3">
          <span className="h-2.5 w-[30%] bg-brand" />
          <span className="h-16 bg-brand/20" />
          <span className="h-1.5 w-[70%] bg-border" />
          <span className="h-1.5 w-[92%] bg-border" />
          <span className="h-1.5 w-[84%] bg-border" />
          <span className="mt-1 h-5 w-[35%] bg-brand" />
        </div>
      </div>
      <p className="mt-3 inline-block border border-border px-2 py-0.5 text-muted-foreground text-xs">
        Example
      </p>
    </FlowBox>
  );
}

export function PlatformHeroSection() {
  return (
    <section className="relative overflow-hidden pt-20 pb-16 sm:pt-28">
      <div className="absolute inset-0">
        <DotPattern className="opacity-100" fadeStyle="ellipse" size="md" />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
          <div>
            <SectionKicker>The Wraps platform</SectionKicker>
            <h1 className="mb-6 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
              Everything your team needs to send email,{" "}
              <span className="text-brand-text">on your own AWS.</span>
            </h1>
            <p className="mb-8 max-w-lg text-lg text-muted-foreground leading-relaxed">
              Templates, newsletters, automations, contacts and reports in one
              dashboard. Sending runs through Amazon in your account, and Amazon
              bills you directly for it.
            </p>
            <TrackedCtaPair
              location="platform_hero"
              secondary={{ label: "See how it works", href: "/#how" }}
            />
          </div>
          <EditorPanel />
        </div>

        <ol className="mt-14 grid border-border border-y sm:grid-cols-3 sm:divide-x sm:divide-border">
          {STEPS.map((step, i) => (
            <li className="px-0 py-5 sm:px-6 sm:first:pl-0" key={step.title}>
              <b className="block font-semibold text-sm">
                <span className="text-brand-text">{i + 1}.</span> {step.title}
              </b>
              <span className="text-muted-foreground text-sm">{step.body}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
