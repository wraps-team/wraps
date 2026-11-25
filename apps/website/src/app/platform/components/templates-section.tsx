import { FlowBox } from "@/app/landing/components/flow-primitives";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { TIER_LIMITS } from "@/config/pricing";

// Brand kits: emails/brand-kits; history: version-history-panel.tsx;
// editor: Monaco TSX (code-template-editor.tsx) with an AI chat panel.
const PILLS = [
  "Written with AI",
  "Brand kits",
  "Live preview",
  "Version history",
];

export function PlatformTemplatesSection() {
  return (
    <section
      className="scroll-mt-20 border-border border-y bg-muted/30 py-16 sm:py-24"
      id="templates"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <div>
          <SectionKicker>Templates</SectionKicker>
          <h2 className="mb-4 font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
            Describe the email. The AI writes it.
          </h2>
          <p className="mb-5 max-w-md text-lg text-muted-foreground leading-relaxed">
            Ask the AI for the email you want, preview it live and ask for
            changes. Your colors and logo apply automatically, and developers
            can edit the template code directly.
          </p>
          <ul className="mb-4 flex flex-wrap gap-2 text-sm">
            {PILLS.map((pill) => (
              <li className="border border-border px-3 py-1" key={pill}>
                {pill}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground text-xs">
            AI drafts on every plan: {TIER_LIMITS.free.aiGenerations} a month on
            Free, {TIER_LIMITS.pro.aiGenerations} on Pro.
          </p>
        </div>

        <FlowBox label="Template · AI draft">
          <div aria-hidden="true" className="grid gap-3">
            <p className="border border-border p-2.5 text-xs leading-relaxed">
              <b>Describe your email:</b> a monthly newsletter with three
              sections and a link to the blog
            </p>
            <div className="grid gap-1.5 border border-border bg-muted/40 p-3">
              <span className="h-2.5 w-[40%] bg-brand/40" />
              <span className="h-1.5 w-[92%] bg-border" />
              <span className="h-1.5 w-[80%] bg-border" />
              <span className="h-1.5 w-[60%] bg-border" />
              <span className="h-1.5 w-[88%] bg-border" />
              <span className="mt-1 h-5 w-[35%] bg-brand" />
            </div>
          </div>
        </FlowBox>
      </div>
    </section>
  );
}
