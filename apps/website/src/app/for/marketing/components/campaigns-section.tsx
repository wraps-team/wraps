import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { CalendarClock, Eye, Send, SlidersHorizontal } from "lucide-react";
import { SectionKicker } from "@/app/landing/components/section-kicker";

const capabilities = [
  {
    icon: Send,
    title: "Pick an audience without writing a query",
    description:
      "Send to everyone, to a topic, or to a saved segment. The audience resolves to a live recipient count you can see before you schedule anything.",
  },
  {
    icon: SlidersHorizontal,
    title: "Map your variables, or let it guess",
    description:
      "The composer auto-detects the variables in a template and maps them to contact fields or static values. First names come from the list; the campaign name you type once.",
  },
  {
    icon: Eye,
    title: "Preview against real people",
    description:
      "A preview carousel renders the email with actual sample contacts from the audience, so you catch the empty greeting before it ships, not after.",
  },
  {
    icon: CalendarClock,
    title: "Schedule in plain English",
    description:
      "Type “next Wednesday at 9am” and it parses. Scheduled and in-flight broadcasts can be cancelled up until they finish.",
  },
];

export function MarketingCampaignsSection() {
  return (
    <section className="py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-3xl">
          <SectionKicker>Broadcasts</SectionKicker>
          <h2 className="mb-3 font-bold text-3xl tracking-tight sm:text-4xl">
            Ship the campaign without booking an engineer.
          </h2>
          <p className="text-lg text-muted-foreground">
            A four-step composer that goes from template to scheduled send. The
            engineering team set up the sending infrastructure once; they do not
            need to be in the room for the newsletter.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {capabilities.map(({ icon: Icon, title, description }) => (
            <Card className="border-border/70 bg-card/50" key={title}>
              <CardContent className="p-5">
                <Icon className="mb-3 size-4 text-orange-500" />
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
