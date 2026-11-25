import { FlowBox } from "@/app/landing/components/flow-primitives";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { TIER_LIMITS } from "@/config/pricing";

// Steps map to the builder's nodes: trigger, send, wait, and the wait-for-
// engagement node (opened or clicked) in components/(ee)/workflow-builder.
const NODES = [
  { text: "Someone signs up", dot: "bg-brand" },
  { text: "Send the welcome email", dot: "bg-success" },
  { text: "Wait 2 days", dot: "bg-muted-foreground" },
  { text: "Opened it? Send getting-started tips", dot: "bg-info" },
];

export function PlatformAutomationsSection() {
  return (
    <section
      className="scroll-mt-20 border-border border-y bg-muted/30 py-16 sm:py-24"
      id="automations"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8">
        <div>
          <SectionKicker>Automations</SectionKicker>
          <h2 className="mb-4 font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
            Emails that send themselves.
          </h2>
          <p className="mb-5 max-w-md text-lg text-muted-foreground leading-relaxed">
            Start a sequence when someone signs up, buys or goes quiet. Wait,
            check what they did, then send the next email or text. Describe it
            to the AI, or have a developer write it in code.
          </p>
          <p className="text-muted-foreground text-xs">
            {TIER_LIMITS.free.workflows} automations on Free.{" "}
            {TIER_LIMITS.pro.workflowsDisplay} on Pro.
          </p>
        </div>

        <FlowBox label="Workflow · Welcome series">
          <ol aria-hidden="true" className="grid justify-items-start">
            {NODES.map((node, i) => (
              <li className="grid justify-items-start" key={node.text}>
                {i > 0 && (
                  <span className="ml-5 h-4 w-px border-border border-l border-dashed" />
                )}
                <span className="inline-flex items-center gap-2 border border-border px-3 py-1.5 text-xs">
                  <span className={`size-2 ${node.dot}`} />
                  {node.text}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3 inline-block border border-border px-2 py-0.5 text-muted-foreground text-xs">
            Example
          </p>
        </FlowBox>
      </div>
    </section>
  );
}
