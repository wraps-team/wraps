"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@wraps/ui/components/ui/accordion";

const faqItems = [
  {
    id: "cost",
    question: "What's the total cost of ownership?",
    answer:
      "Two costs: a Wraps Platform fee (Free, $29, or $199/mo) and AWS sending paid directly to AWS — $0.10/1K emails à la carte, or $0.16/1K on AWS's default Essentials plan (Wraps tells you which one you're on). No per-seat pricing, no per-contact pricing, no per-domain or per-template pricing — every plan includes unlimited sends, domains, contacts, and templates. The Free tier includes a hosted dashboard.",
  },
  {
    id: "support",
    question: "What support is available?",
    answer:
      "Free: community support via GitHub and Discord. Pro ($29/mo): email support. Business ($199/mo): priority support.",
  },
  {
    id: "compare",
    question: "How does this compare to building our own SES integration?",
    answer:
      "Building SES integration with proper event tracking, bounce handling, and analytics takes 40-80 engineering hours. Wraps does it in 2 minutes. You get the same infrastructure, just automated.",
  },
  {
    id: "migration",
    question: "What's the migration path from our current provider?",
    answer:
      "Deploy Wraps alongside your current provider, migrate traffic gradually, then decommission the old one. Your sending domain stays the same. Most teams migrate in a day.",
  },
  {
    id: "customize",
    question: "Can we customize the infrastructure?",
    answer:
      "Yes. The CLI offers presets (Starter, Production, Enterprise) or full customization. All infrastructure is Pulumi code you can fork and modify. Add your own Lambda triggers, change retention periods, etc.",
  },
];

export function FaqSection() {
  return (
    <section className="mb-16">
      <h2 className="mb-6 font-heading font-semibold text-2xl tracking-tight">
        Common Questions
      </h2>
      <Accordion className="space-y-2" collapsible type="single">
        {faqItems.map((item) => (
          <AccordionItem
            className="rounded-lg border px-4"
            key={item.id}
            value={item.id}
          >
            <AccordionTrigger className="text-left hover:no-underline">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
