import Link from "next/link";
import { FlowBox } from "@/app/landing/components/flow-primitives";
import { SectionKicker } from "@/app/landing/components/section-kicker";

// Deliberately on the page: a marketer who finds these in week two churns; one
// who reads them here self-selects or arrives unsurprised.
// Editor: code-template-editor.tsx (Monaco TSX), version-history-panel.tsx.
// CSV: contacts import-contacts-dialog.tsx imports into contacts only; there
// is no send-to-a-file flow.
const limits = [
  {
    label: "Editor",
    title: "No drag-and-drop builder",
    body: "Start from the gallery or describe the email to the AI, then refine it by asking. The template underneath is code, which a developer can edit too. Version history is on, so nothing you try is lost. If a visual block editor is a must, this will feel wrong.",
  },
  {
    label: "Testing",
    title: "No A/B testing",
    body: "Nothing picks a winning version automatically. If your program runs on split tests, this is a real gap today.",
  },
  {
    label: "Imports",
    title: "No one-off CSV sends",
    body: "Import a CSV into your contacts, then send to it. The “here’s a list, mail it” flow doesn’t exist.",
  },
];

export function MarketingBeforeYouSwitchSection() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-3xl">
          <SectionKicker>Before you switch</SectionKicker>
          <h2 className="font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
            Three things you&rsquo;d find out in week two anyway.
          </h2>
        </div>

        <div className="grid gap-x-6 gap-y-10 md:grid-cols-3">
          {limits.map((item) => (
            <FlowBox className="h-full" key={item.label} label={item.label}>
              <h3 className="mb-2 font-medium text-lg tracking-tight">
                {item.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {item.body}
              </p>
            </FlowBox>
          ))}
        </div>

        <p className="mt-8 max-w-3xl text-muted-foreground text-sm leading-relaxed">
          Engineers can push templates from the repo while you edit copy in the
          dashboard, so it is worth agreeing up front on{" "}
          <Link
            className="text-foreground underline underline-offset-4"
            href="/docs/guides/template-handoff"
          >
            what happens when you both edit the same one
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
