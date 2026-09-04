import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { Activity, ClipboardList, GitBranch, ShieldAlert } from "lucide-react";
import { SectionKicker } from "@/app/landing/components/section-kicker";

const artifacts = [
  {
    icon: GitBranch,
    title: "Where the send went",
    description:
      "A Sankey diagram traces sent → delivered → opened → clicked for a broadcast, broken out per destination URL, next to a funnel with the conversion rate at each hop.",
  },
  {
    icon: ShieldAlert,
    title: "Why it didn't land",
    description:
      "Bounces separate hard from soft and complaints are counted on their own, each with its own breakdown. The two numbers AWS judges your sending on don't have to be reverse-engineered from a total.",
  },
  {
    icon: Activity,
    title: "What happened to one message",
    description:
      "Search down to a single send and read its event timeline in order. Bot-generated opens are filtered out of engagement metrics so your open rate isn't quietly inflated by a scanner.",
  },
  {
    icon: ClipboardList,
    title: "Who changed what",
    description:
      "Audit logs capture the mutations behind the send — who edited the template, who cancelled the broadcast, who unsubscribed a contact by hand. Viewable and filterable from the dashboard, and exportable to CSV on Business.",
  },
];

export function OperatorsPaperTrailSection() {
  return (
    <section className="border-border/60 border-y bg-muted/30 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-3xl">
          <SectionKicker>After the send</SectionKicker>
          <h2 className="mb-3 font-bold text-3xl tracking-tight sm:text-4xl">
            Four questions, four artifacts.
          </h2>
          <p className="text-lg text-muted-foreground">
            Every incident review asks the same things. None of them should
            require a support ticket to answer.
          </p>
        </div>

        <div className="mb-8 grid gap-4 md:grid-cols-2">
          {artifacts.map(({ icon: Icon, title, description }) => (
            <Card className="border-border/70 bg-card/60" key={title}>
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

        <div className="rounded-xl border border-border bg-card/60 p-5">
          <p className="mb-3 font-medium text-sm tracking-tight">
            How far back the dashboard reads
          </p>
          <div className="flex flex-wrap gap-x-8 gap-y-3 font-mono text-[12.5px]">
            {[
              ["Free", "7 days"],
              ["Starter", "30 days"],
              ["Growth", "90 days"],
              ["Scale", "365 days"],
            ].map(([plan, window]) => (
              <span className="flex items-baseline gap-2" key={plan}>
                <span className="text-muted-foreground">{plan}</span>
                <span className="text-foreground">{window}</span>
              </span>
            ))}
          </div>
          <p className="mt-4 text-muted-foreground text-xs leading-relaxed">
            That window is what the dashboard renders. The same events are also
            delivered by EventBridge into a DynamoDB table in your own AWS
            account, where the rule and the table are yours — so keeping a
            longer history than your plan displays is something you can wire up
            without asking us.
          </p>
        </div>
      </div>
    </section>
  );
}
