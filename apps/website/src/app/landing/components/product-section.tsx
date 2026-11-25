import { TIER_LIMITS } from "@/config/pricing";
import { FlowBox } from "./flow-primitives";
import { SectionHead } from "./section-head";

const MINI_ROW =
  "flex items-center justify-between gap-3 border-border border-b py-1.5 text-xs last:border-b-0";

function Visual({ children }: { children: React.ReactNode }) {
  return (
    <div
      aria-hidden="true"
      className="mb-4 border border-border bg-muted/30 p-3"
    >
      {children}
    </div>
  );
}

function Card({
  label,
  title,
  children,
  visual,
}: {
  label: string;
  title: string;
  children: React.ReactNode;
  visual: React.ReactNode;
}) {
  return (
    <FlowBox className="p-0" label={label}>
      <article className="px-1 pt-1 pb-1 sm:px-0">
        <Visual>{visual}</Visual>
        <h3 className="font-semibold text-foreground text-lg">{title}</h3>
        <p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">
          {children}
        </p>
      </article>
    </FlowBox>
  );
}

const WORKFLOW_STEPS = [
  { dot: "bg-brand", text: "Someone signs up" },
  { dot: "bg-success", text: "Send the welcome email" },
  { dot: "bg-muted-foreground", text: "Wait 2 days" },
  { dot: "bg-info", text: "Opened it? Send getting-started tips" },
];

export function ProductSection() {
  return (
    <section className="border-border border-b py-16 md:py-20" id="features">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHead
          kicker="The product"
          title="Everything your team needs to talk to customers."
        >
          One place for the newsletter, the welcome series and the password
          reset, with one list of contacts behind all of them.
        </SectionHead>

        <div className="grid gap-8 md:grid-cols-2">
          <Card
            label="Broadcast · Composer"
            title="Newsletters and announcements"
            visual={
              <>
                <ol className="mb-3 grid grid-cols-4 gap-1 text-center text-2xs text-muted-foreground">
                  {["Setup", "Content", "Audience", "Review"].map((step) => (
                    <li
                      className={
                        step === "Audience"
                          ? "border-b-2 border-brand pb-1 font-semibold text-foreground"
                          : "border-border border-b-2 pb-1"
                      }
                      key={step}
                    >
                      {step}
                    </li>
                  ))}
                </ol>
                <div className="grid gap-1.5 border border-border bg-background p-3">
                  <span className="block h-1.5 w-[55%] bg-muted" />
                  <span className="block h-1.5 w-[90%] bg-muted" />
                  <span className="block h-1.5 w-[75%] bg-muted" />
                  <span className="mt-1 block h-4 w-16 bg-brand" />
                </div>
              </>
            }
          >
            Write it once, or ask the AI to draft it, and see who opened and
            clicked. Sending to everyone is included on every plan; segments and
            scheduling come with Pro.
          </Card>

          <Card
            label="Workflow · Welcome series"
            title="Automations"
            visual={
              <ol className="grid gap-1.5">
                {WORKFLOW_STEPS.map((step) => (
                  <li
                    className="flex items-center gap-2 border border-border bg-background px-2.5 py-1.5 text-foreground text-xs"
                    key={step.text}
                  >
                    <span
                      className={`size-2 shrink-0 rounded-full ${step.dot}`}
                    />
                    {step.text}
                  </li>
                ))}
              </ol>
            }
          >
            Journeys that run on their own: send the next email when someone
            signs up, buys or goes quiet. {TIER_LIMITS.free.workflows}{" "}
            automations on Free, unlimited on Pro.
          </Card>

          <Card
            label="Contacts · Segments"
            title="Contacts and segments"
            visual={
              <div>
                {[
                  ["All customers", "48,210"],
                  ["Opened in 30 days, never clicked", "6,904"],
                  ["Topic: product news", "21,377"],
                ].map(([name, count]) => (
                  <div className={MINI_ROW} key={name}>
                    <span className="text-muted-foreground">{name}</span>
                    <span className="font-semibold text-foreground tabular-nums">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            }
          >
            Unlimited contacts on every plan. Group them by what they did or
            what you know, and let them pick their own topics. Segments and
            topics are on Pro.
          </Card>

          <Card
            label="Your app"
            title="App emails"
            visual={
              <div>
                {[
                  "Receipt #4821",
                  "Reset your password",
                  "Your trial ends in 3 days",
                ].map((subject) => (
                  <div className={MINI_ROW} key={subject}>
                    <span className="text-muted-foreground">{subject}</span>
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <span className="size-1.5 rounded-full bg-success" />
                      Delivered
                    </span>
                  </div>
                ))}
              </div>
            }
          >
            Receipts, password resets and alerts sent from your product, tracked
            in the same dashboard as your campaigns.
          </Card>
        </div>
      </div>
    </section>
  );
}
