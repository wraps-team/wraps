import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface FAQ {
  id: number;
  question: string;
  answer: string;
}

interface FAQSectionProps {
  faqs: FAQ[];
}

export function FAQSection({ faqs }: FAQSectionProps) {
  return (
    <Card className="mt-6 sm:mt-8 lg:mt-12">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Frequently Asked Questions</CardTitle>
        <CardDescription>
          Get answers to the most common questions about our pricing and plans
        </CardDescription>
      </CardHeader>
      <CardContent className="mt-6 sm:mt-8">
        <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
          {/* Left Column */}
          <div className="space-y-4">
            <Accordion type="multiple">
              {faqs.slice(0, 3).map((item) => (
                <AccordionItem
                  className="border! my-3 rounded-md"
                  key={item.id}
                  value={`item-${item.id}`}
                >
                  <AccordionTrigger className="cursor-pointer px-4">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="px-4 text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            <Accordion type="multiple">
              {faqs.slice(3, 6).map((item) => (
                <AccordionItem
                  className="border! my-3 rounded-md"
                  key={item.id}
                  value={`item-${item.id}`}
                >
                  <AccordionTrigger className="cursor-pointer px-4">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="px-4 text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
