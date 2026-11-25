import { CalendarClock, Eye, Type, Users } from "lucide-react";
import { FlowBox } from "@/app/landing/components/flow-primitives";
import { SectionKicker } from "@/app/landing/components/section-kicker";

// Each card is backed by the dashboard's broadcast composer:
// live count: batch-form.tsx (getRecipientCount, "Estimated Recipients" card)
// preview: email-preview-carousel.tsx (sample contacts from the audience)
// schedule: batch-form.tsx date input; cancel: [batchId]/components/cancel-button.tsx
const steps = [
  {
    label: "Audience",
    icon: Users,
    title: "Pick who gets it",
    body: "Everyone, a topic or a saved segment. See the live recipient count before you schedule.",
  },
  {
    label: "Personalize",
    icon: Type,
    title: "Personalize it",
    body: "First names and other fields fill in from your contacts. The composer spots them for you.",
  },
  {
    label: "Preview",
    icon: Eye,
    title: "Preview with real contacts",
    body: "See the email as contacts from your audience will, so you catch the empty greeting before it goes out.",
  },
  {
    label: "Schedule",
    icon: CalendarClock,
    title: "Schedule in plain English",
    body: "Type “next Wednesday at 9am”. Cancel any time before it finishes sending.",
  },
];

export function MarketingNewslettersSection() {
  return (
    <section className="border-border border-y bg-muted/30 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-3xl">
          <SectionKicker>Newsletters</SectionKicker>
          <h2 className="mb-3 font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
            Send the campaign without booking an engineer.
          </h2>
          <p className="text-lg text-muted-foreground">
            A four-step composer takes you from template to scheduled send. Your
            developers set up sending once; they don&rsquo;t need to be there
            for the newsletter.
          </p>
        </div>

        <ol className="grid gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ label, icon: Icon, title, body }) => (
            <li key={label}>
              <FlowBox className="h-full" label={label}>
                <Icon
                  aria-hidden="true"
                  className="mb-3 size-5 text-brand-text"
                />
                <h3 className="mb-2 font-medium text-base tracking-tight">
                  {title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {body}
                </p>
              </FlowBox>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
