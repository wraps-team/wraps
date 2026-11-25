import { AWS_PRICING } from "@/config/pricing";
import { FlowBox } from "./flow-primitives";
import { SectionHead } from "./section-head";

const FIT_YES = [
  "Your email bill grows every time your list does",
  "You already use AWS, or are happy to open an account",
  "Several teams send email and want one place to do it",
];

// SOC 2 appears only in the one form the claim rules allow.
const FIT_NO = [
  "You don't want an AWS account at all",
  "You need A/B testing or a drag-and-drop editor today",
  "You need SOC 2 today. We don't have SOC 2 yet.",
];

function List({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2.5 text-muted-foreground text-sm leading-relaxed">
      {items.map((item) => (
        <li className="flex gap-2.5" key={item}>
          <span
            aria-hidden="true"
            className="mt-2 size-1.5 shrink-0 bg-brand"
          />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function WhyOwnSection() {
  const ip = AWS_PRICING.dedicatedIpMonthly.toFixed(2);
  const cards = [
    {
      label: "Your account",
      title: "Sending runs in your account",
      body: `Every email goes out from your domain through your own Amazon account. Want full control of your sending reputation? Add a dedicated IP in your account for $${ip} a month.`,
    },
    {
      label: "If you leave",
      title: "Sending keeps running without us",
      body: "The sending setup lives in your AWS account. Stop paying Wraps and your app's emails keep going out. Contacts and templates are stored by Wraps, and you can export them.",
    },
    {
      label: "Transparency",
      title: "Nothing hidden",
      body: "We never store your AWS keys. The code is public under AGPLv3, except the enterprise directories (commercial) and the SDKs (MIT), so your security reviewer can read what Wraps sets up.",
    },
  ];

  return (
    <section className="border-border border-b py-16 md:py-20" id="own">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <SectionHead
          kicker="Why own it"
          title="Your domain. Your account. Your bill."
        />
        <div className="grid gap-8 md:grid-cols-3">
          {cards.map((card) => (
            <FlowBox key={card.label} label={card.label}>
              <h3 className="font-semibold text-foreground text-lg">
                {card.title}
              </h3>
              <p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">
                {card.body}
              </p>
            </FlowBox>
          ))}
        </div>
        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <FlowBox dashed label="A good fit if">
            <List items={FIT_YES} />
          </FlowBox>
          <FlowBox label="Not the right fit if">
            <List items={FIT_NO} />
          </FlowBox>
        </div>
      </div>
    </section>
  );
}
