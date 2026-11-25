import { ArrowDown, ArrowRight } from "lucide-react";
import { FlowBox } from "./flow-primitives";
import { SectionHead } from "./section-head";

const CATEGORIES = [
  {
    label: "Email marketing tools",
    title: "Easy, and rented",
    body: "Anyone on the team can use them, but most charge for every contact you store, so the bill grows with your list.",
  },
  {
    label: "Sending services",
    title: "Cheap, and technical",
    body: "Low cost per email, but built for developers to wire into an app. The marketing side is an add-on, or yours to build.",
  },
  {
    label: "Wraps",
    title: "Easy, and yours",
    body: "A dashboard your marketing team can use, on sending you own in your AWS account, with tools for developers and AI agents underneath.",
    dashed: true,
  },
];

const FLOW = [
  {
    label: "You",
    title: "Your team",
    body: "Writes the email and picks the audience.",
  },
  {
    label: "Wraps",
    title: "The dashboard",
    body: "Contacts, templates, newsletters, automations, reports.",
  },
  {
    label: "Your AWS account",
    title: "Amazon's email service",
    body: "Sends every email from your domain. Amazon bills you directly, at its own rates.",
    dashed: true,
  },
  {
    label: "Your customers",
    title: "The inbox",
    body: "Opens and clicks flow back to your reports.",
  },
];

const LINK =
  "text-foreground underline underline-offset-4 hover:text-brand-text";

export function OwnershipSection() {
  return (
    <section className="border-border border-b py-16 md:py-20" id="how">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHead
          kicker="How it works"
          title="An email platform, without giving up control."
        >
          Until now you picked one: an easy marketing tool that gets expensive
          as you grow, or a cheap sending service that needs developers to use.
          Wraps is both.
        </SectionHead>

        <div className="grid gap-8 md:grid-cols-3">
          {CATEGORIES.map((cat) => (
            <FlowBox dashed={cat.dashed} key={cat.label} label={cat.label}>
              <h3 className="font-semibold text-foreground text-lg">
                {cat.title}
              </h3>
              <p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">
                {cat.body}
              </p>
            </FlowBox>
          ))}
        </div>

        <ol className="mt-12 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr]">
          {FLOW.flatMap((node, i) => {
            const box = (
              <li className="contents" key={node.label}>
                <FlowBox
                  className="h-full"
                  dashed={node.dashed}
                  label={node.label}
                >
                  <h3 className="font-semibold text-foreground">
                    {node.title}
                  </h3>
                  <p className="mt-1 text-muted-foreground text-sm leading-relaxed">
                    {node.body}
                  </p>
                </FlowBox>
              </li>
            );
            if (i === FLOW.length - 1) {
              return [box];
            }
            return [
              box,
              <li
                aria-hidden="true"
                className="flex items-center justify-center text-muted-foreground"
                key={`${node.label}-arrow`}
              >
                <ArrowRight className="hidden size-5 md:block" />
                <ArrowDown className="size-5 md:hidden" />
              </li>,
            ];
          })}
        </ol>

        <p className="mt-8 text-muted-foreground text-sm">
          Want the technical detail?{" "}
          <a className={LINK} href="/byoc">
            See exactly what deploys into your account
          </a>{" "}
          or{" "}
          <a className={LINK} href="/security">
            read the security page
          </a>
          .
        </p>
      </div>
    </section>
  );
}
