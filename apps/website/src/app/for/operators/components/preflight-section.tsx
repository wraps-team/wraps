import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { Eye, ListChecks, Send, SquareX, Users } from "lucide-react";
import { SectionKicker } from "@/app/landing/components/section-kicker";

// Each step maps to a real control in the broadcast composer, in the order an
// operator hits them.
const steps = [
  {
    icon: Users,
    step: "01",
    title: "See the count before you commit",
    description:
      "Pick all contacts, a topic, or a segment, and the audience resolves to a number you can look at. The confirmation dialog repeats it before anything leaves.",
  },
  {
    icon: Eye,
    step: "02",
    title: "Preview against real contacts",
    description:
      "The preview carousel renders the template with actual sample recipients, so a broken variable shows up as a blank greeting here instead of in someone's inbox.",
  },
  {
    icon: Send,
    step: "03",
    title: "Test send with live links",
    description:
      "A test send carries the real unsubscribe and preference-center URLs, not placeholders. You can click the footer and confirm it resolves before the broadcast does.",
  },
  {
    icon: ListChecks,
    step: "04",
    title: "Watch it drain",
    description:
      "Progress refreshes every five seconds while the broadcast processes. You are not reading a spinner and hoping.",
  },
  {
    icon: SquareX,
    step: "05",
    title: "Cancel mid-flight",
    description:
      "Queued, scheduled, and in-progress broadcasts can be cancelled. The send you caught at 20% is 80% of a problem you no longer have.",
  },
];

export function OperatorsPreflightSection() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-3xl">
          <SectionKicker>Before the send</SectionKicker>
          <h2 className="mb-3 font-bold text-3xl tracking-tight sm:text-4xl">
            The expensive mistakes all happen in the last thirty seconds.
          </h2>
          <p className="text-lg text-muted-foreground">
            Wrong list, unrendered variable, dead unsubscribe link. Every one of
            them is catchable before the first message goes out, and the
            composer makes you walk past the catch.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {steps.map(({ icon: Icon, step, title, description }) => (
            <Card className="border-border/70 bg-card/50" key={step}>
              <CardContent className="p-5">
                <div className="mb-3 flex items-center gap-2.5">
                  <Icon className="size-4 text-orange-500" />
                  <span className="font-mono text-[11px] text-muted-foreground tracking-[0.14em]">
                    {step}
                  </span>
                </div>
                <h3 className="mb-2 font-medium text-base tracking-tight">
                  {title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
