import {
  agentDeepLinks,
  buildAgentSetupPrompt,
} from "@wraps/ui/lib/agent-setup";
import { FlowBox } from "./flow-primitives";
import { SectionHead } from "./section-head";
import { SetupPaths } from "./setup-paths";

const RAIL = [
  {
    label: "Step 1 · Connect AWS",
    title: "Connect your AWS account",
    body: "Click through it in the browser, or let your AI agent do it.",
    when: "Minutes",
  },
  {
    label: "Step 2 · Your domain",
    title: "Add your domain",
    body: "Copy a few records into your domain settings.",
    when: "AWS checks them within 48 hours",
  },
  {
    label: "Step 3 · Approval",
    title: "Get approved to send",
    body: "One button in the dashboard. Test emails work while you wait.",
    when: "AWS reviews it in 1 to 72 hours",
  },
];

export function GettingStartedSection() {
  // One prompt, shared with the dashboard's onboarding (packages/ui). The links
  // carry it percent-encoded; Copy prompt and the disclosure show it as is.
  const prompt = buildAgentSetupPrompt({ context: "website" });
  const links = agentDeepLinks(prompt);

  return (
    <section className="border-border border-b py-16 md:py-20" id="setup">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHead
          kicker="Getting started"
          title="Up and running without an engineer."
        >
          Connect your AWS account in the browser in a few clicks. If you use
          Claude or Cursor, you can hand the whole setup to your AI agent
          instead.
        </SectionHead>

        <ol
          aria-label="Setup steps"
          className="mb-12 grid gap-8 md:grid-cols-3"
        >
          {RAIL.map((step) => (
            <li key={step.label}>
              <FlowBox className="h-full" label={step.label}>
                <b className="font-semibold text-foreground">{step.title}</b>
                <span className="mt-1 block text-muted-foreground text-sm leading-relaxed">
                  {step.body}
                </span>
                <em className="mt-3 block font-semibold text-brand-text text-sm not-italic">
                  {step.when}
                </em>
              </FlowBox>
            </li>
          ))}
        </ol>

        <SetupPaths
          links={{
            claudeApp: links.claudeApp,
            claudeCode: links.claudeCode,
            cursor: links.cursor,
            prompt,
          }}
        />
      </div>
    </section>
  );
}
