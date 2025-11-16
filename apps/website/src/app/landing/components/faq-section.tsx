"use client";

import { CircleHelp } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type FaqItem = {
  value: string;
  question: string;
  answer: string;
};

const faqItems: FaqItem[] = [
  {
    value: "item-1",
    question: "How is this different from using AWS SES directly?",
    answer:
      "Wraps deploys all the infrastructure AWS SES needs (IAM roles, EventBridge, DynamoDB, Lambda, SQS) in one command instead of 2+ hours of manual setup. You get event tracking, analytics, webhooks, and a beautiful dashboard out of the box. Plus our TypeScript SDK gives you a clean, intuitive API that makes sending emails delightful.",
  },
  {
    value: "item-2",
    question: "What are the costs for running Wraps?",
    answer:
      "With Wraps, you pay AWS directly at $0.10 per 1,000 emails with no markup. For example, 50,000 emails/month costs $5 to AWS. If you choose the optional hosted dashboard (coming soon), there will be a small monthly fee ($10-49). The infrastructure is yours forever—no vendor lock-in, no surprise bills.",
  },
  {
    value: "item-3",
    question: "Do you store my AWS credentials?",
    answer:
      "No! We use OIDC (OpenID Connect) for Vercel deployments or IAM roles for AWS-native deployments. The CLI uses your local AWS credentials for the initial deployment, then creates IAM roles that your app can assume. We never see or store your AWS access keys.",
  },
  {
    value: "item-4",
    question: "What happens if I stop paying for Wraps?",
    answer:
      "Your infrastructure keeps running! All resources are in your AWS account. You lose access to the hosted dashboard (if you had it) but can still use the free local console. Your SDK code keeps working, emails keep sending, and you keep paying AWS directly. Zero vendor lock-in.",
  },
  {
    value: "item-5",
    question: "Can I customize the infrastructure deployment?",
    answer:
      "Yes! Choose between Starter ($0.05/month), Production ($2-5/month), or Enterprise ($50-100/month) presets based on features you need. You can also use 'npx @wraps.dev/cli email upgrade' to add features incrementally. For full customization, all infrastructure is deployed as open-source Pulumi code you can fork and modify.",
  },
  {
    value: "item-6",
    question: "Does this work with my existing SES setup?",
    answer:
      "Yes! Use 'npx @wraps.dev/cli email connect' to scan your existing SES resources and add Wraps features non-destructively. We never modify existing resources—all our infrastructure uses the 'wraps-email-' prefix. You can also use 'npx @wraps.dev/cli email init' for a completely fresh deployment.",
  },
];

const FaqSection = () => {
  return (
    <section className="py-24 sm:py-32" id="faq">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <Badge className="mb-4" variant="outline">
            FAQ
          </Badge>
          <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
            Frequently Asked Questions
          </h2>
          <p className="text-lg text-muted-foreground">
            Everything you need to know about Wraps, pricing, security, and
            deployment. Still have questions? We're here to help!
          </p>
        </div>

        {/* FAQ Content */}
        <div className="mx-auto max-w-4xl">
          <div className="bg-transparent">
            <div className="p-0">
              <Accordion className="space-y-5" collapsible type="single">
                {faqItems.map((item) => (
                  <AccordionItem
                    className="border! rounded-md bg-transparent"
                    key={item.value}
                    value={item.value}
                  >
                    <AccordionTrigger className="cursor-pointer items-center gap-4 rounded-none bg-transparent py-2 ps-3 pe-4 hover:no-underline data-[state=open]:border-b">
                      <div className="flex items-center gap-4">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <CircleHelp className="size-5" />
                        </div>
                        <span className="text-start font-semibold">
                          {item.question}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="bg-transparent p-4">
                      {item.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>

          {/* Contact Support CTA */}
          <div className="mt-12 text-center">
            <p className="mb-4 text-muted-foreground">
              Still have questions? We're here to help.
            </p>
            <Button asChild className="cursor-pointer">
              <a href="#contact">Contact Support</a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export { FaqSection };
