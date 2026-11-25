import { Bot, Code2, ListTodo, Send } from "lucide-react";
import { FlowBox } from "./flow-primitives";
import { SectionHead } from "./section-head";

const TEAM = [
  {
    label: "Marketing",
    icon: Send,
    title: "Marketing creates campaigns",
    body: "Newsletters, segments and reports, without waiting on engineering.",
  },
  {
    label: "Product",
    icon: ListTodo,
    title: "Product builds journeys",
    body: "Onboarding, trial and win-back emails that run on their own.",
  },
  {
    label: "Developers",
    icon: Code2,
    title: "Developers connect the app",
    body: "Receipts and resets from your product, with SDKs and an API.",
  },
  {
    label: "AI agents",
    icon: Bot,
    title: "AI agents help everyone",
    body: "An agent can draft a template, find contacts or start a send through the Wraps MCP server.",
  },
];

export function TeamSection() {
  return (
    <section className="border-border border-b py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHead
          kicker="For the whole team"
          title="One platform. Everyone who sends email."
        />
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {TEAM.map((card) => (
            <FlowBox key={card.label} label={card.label}>
              <card.icon
                aria-hidden="true"
                className="mb-3 size-5 text-brand-text"
              />
              <h3 className="font-semibold text-foreground">{card.title}</h3>
              <p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">
                {card.body}
              </p>
            </FlowBox>
          ))}
        </div>
      </div>
    </section>
  );
}
