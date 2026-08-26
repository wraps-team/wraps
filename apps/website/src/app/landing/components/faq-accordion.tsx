"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@wraps/ui/components/ui/accordion";
import { faqItems } from "./faq-items";

export function FaqAccordion() {
  return (
    <Accordion className="space-y-2" collapsible type="single">
      {faqItems.map((item) => (
        <AccordionItem
          className="rounded-lg border px-4 transition-colors data-[state=open]:border-orange-500/30 data-[state=open]:bg-orange-500/5 last:border-b"
          key={item.value}
          value={item.value}
        >
          <AccordionTrigger className="cursor-pointer py-4 text-left hover:no-underline">
            <span className="font-medium">{item.question}</span>
          </AccordionTrigger>
          <AccordionContent className="pb-4 text-muted-foreground">
            {item.richAnswer ?? item.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
