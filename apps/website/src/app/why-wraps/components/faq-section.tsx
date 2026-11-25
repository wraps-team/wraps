"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@wraps/ui/components/ui/accordion";
import { Band, SectionHead } from "@/app/landing/components/page-band";
import { LICENSE_STATEMENT } from "@/config/license";

/*
 * Written for the person who did not choose Wraps and now has to approve it.
 * Every answer leads with the unflattering half, because a champion who gets
 * blindsided in the meeting stops being a champion. If an answer here starts
 * sounding like marketing, it has stopped doing its job.
 */

const faqItems = [
  {
    id: "soc2",
    question: "Do you have SOC 2?",
    answer:
      "We don't have SOC 2 yet. If your process requires a report today, this will not clear it. What is true is narrower: the sending setup runs inside your own AWS account, so your existing AWS posture covers that half. The gap is the Wraps platform itself: the dashboard, and the contacts and templates in our database.",
  },
  {
    id: "sandbox",
    question: "Will we get stuck in the SES sandbox?",
    answer:
      "Possibly, and nobody selling you software can promise otherwise. New AWS accounts can only send to verified addresses until AWS grants production access, the request is made from your account, and it is sometimes refused. Wraps detects the sandbox at the end of a deploy, explains it, and points you at the request — it cannot approve it, and neither can any other tool that sends from an account you own. If your team is likely to be refused, that constraint applies to this whole approach, not to Wraps specifically.",
  },
  {
    id: "data",
    question: "Where does our data actually live?",
    answer:
      "Split, and the split is wider than the marketing shorthand suggests, so here it is exactly. In your AWS account: SES does the sending, and the per-event delivery history lands in a DynamoDB table whose retention you set in your own deploy config, up to permanent. In the Wraps database (Neon, Postgres): contacts, templates, broadcasts, workflow state — and a row per message carrying the recipient address, subject, sender, any template variables, and the delivery and open timestamps, because that is what the dashboard list and the analytics read. If recipient addresses and subject lines in a vendor database are a problem for your review, that is the fact to take into the room. Anyone who tells you every byte stays in your account is describing a different product.",
  },
  {
    id: "access",
    question: "What access does Wraps have to our AWS account?",
    answer:
      "An IAM role your side creates and your side can delete, assumed with an external ID. No access keys are stored anywhere, so there is nothing to rotate and nothing to leak from us. Revoking it is a one-line change in your account that does not require telling us.",
  },
  {
    id: "support",
    question: "What is the support commitment?",
    answer:
      "Free is community support, with no response-time commitment. Pro at $29/mo adds email support. Business at $199/mo adds priority support. There is no phone number and no dedicated CSM at any tier — if your team needs one, say so now rather than after signing.",
  },
  {
    id: "stop-paying",
    question: "What happens if we stop paying, or you go away?",
    answer: `Sending keeps working. SES, the Lambdas, the EventBridge rules and the DynamoDB tables are in your account, namespaced wraps-email-*, and nothing about them depends on us being alive. What you lose is the platform: the dashboard, and the contacts, templates and workflows stored in our database. Contacts and templates can be exported, so export them before you leave. The code is public, so your reviewer can read it. ${LICENSE_STATEMENT}`,
  },
  {
    id: "wrapper",
    question: "Isn't this just a wrapper around SES? There are free ones.",
    answer: `Wraps is a layer over SES. That is the product and the name, and the code is public. ${LICENSE_STATEMENT} So the question is not whether to use one, it is which one. OpenSend, useSend and MillionSend will give you a Resend-shaped API and a dashboard over your own SES, and the API is table stakes across all of us. What we build past it is the operational layer: bounce and complaint rates against the lines AWS enforces, swept hourly and alerted on, deliverability and blacklist audits, suppression wired in from the first send, and an IAM role you revoke instead of AWS keys sitting in a container. If those do not matter to you, the CLI and SDKs are free and you can stop at the deploy.`,
  },
  {
    id: "migration",
    question: "How disruptive is the migration?",
    answer:
      "Deploy alongside whatever you run now — the install is namespaced and does not modify existing SES resources, so it can coexist with an account that is already sending. Move traffic gradually, keep the old provider up until you are satisfied, then decommission. Your sending domain does not change. The deploy takes minutes; the cutover takes as long as your sending code takes to repoint.",
  },
];

export function FaqSection() {
  return (
    <Band>
      <SectionHead
        body="The answers we would give in the room, in the words we would use."
        kicker="04 · Questions"
        title="Questions your team will ask"
      />
      <Accordion collapsible type="single">
        {faqItems.map((item) => (
          <AccordionItem key={item.id} value={item.id}>
            <AccordionTrigger className="text-left">
              {item.question}
            </AccordionTrigger>
            <AccordionContent>{item.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Band>
  );
}
