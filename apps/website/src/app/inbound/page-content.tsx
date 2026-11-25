import { DotPattern } from "@wraps/ui/components/dot-pattern";
import { Check } from "lucide-react";
import { ClosingPanel } from "@/app/landing/components/closing-panel";
import { FlowBox } from "@/app/landing/components/flow-primitives";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { Band, SectionHead } from "@/app/landing/components/page-band";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { AnatomyInteractive } from "./components/anatomy-interactive";
import { AnimatedInbox } from "./components/animated-inbox";
import { InboundCommand } from "./components/inbound-command";
import {
  InboundClosingActions,
  InboundHeroCTA,
} from "./components/inbound-ctas";
import { PipelineInteractive } from "./components/pipeline-interactive";
import { SdkTabs } from "./components/sdk-tabs";
import { UseCasesCarousel } from "./components/use-cases-carousel";
import { codeExamples, pipelineSteps, useCases } from "./data";

const TEAM = [
  {
    label: "Support",
    title: "A support inbox that files tickets",
    body: "Turn each customer email into a ticket in Linear, Jira, GitHub Issues or any tool your developers can call from code. Route by subject or sender.",
  },
  {
    label: "Orders",
    title: "Order emails that update records",
    body: "Read a confirmation, pull out the tracking number and update your database, without anyone copying it across.",
  },
  {
    label: "Leads",
    title: "Inquiries that reach your CRM",
    body: "Pick the sender's name and address out of an inquiry and send it to your CRM or marketing tool.",
  },
  {
    label: "Documents",
    title: "Attachments that get processed",
    body: "Each attachment gets its own link, so a PDF or an invoice can start a workflow the moment the email arrives.",
  },
];

const STEPS = [
  {
    title: "Deploy email first",
    body: "Inbound adds to the email setup in your AWS account. If you haven't deployed it, start with the email quickstart.",
  },
  {
    title: "Add one DNS record",
    body: "Point your receiving domain's MX record at Amazon's email service. A subdomain such as support.yourcompany.com works.",
  },
  {
    title: "Say yes to the rule set",
    body: "AWS allows one active receiving rule set per region. If another one is active, Wraps asks before it replaces it, and doesn't without your yes.",
  },
];

const ROLES = [
  { title: "Amazon receives", description: "Your MX record routes mail in" },
  { title: "S3 stores", description: "The raw email, in your account" },
  { title: "Lambda parses", description: "Headers, body, attachments" },
  { title: "EventBridge notifies", description: "Your app and your rules" },
];

const ANATOMY_FIELDS = [
  ["emailId", "Unique identifier for the inbound email"],
  ["from", "Sender address and name"],
  ["to", "Recipient addresses"],
  ["subject", "Email subject line"],
  ["html", "HTML body content"],
  ["text", "Plain text body content"],
  ["attachments", "File attachments with filename, content type, and size"],
  ["spamVerdict", "AWS SES spam detection result"],
  ["virusVerdict", "AWS SES virus scan result"],
];

export function InboundPageContent() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main>
        <section className="relative overflow-hidden pt-20 pb-16 sm:pt-28">
          <div className="absolute inset-0">
            <DotPattern className="opacity-100" fadeStyle="ellipse" size="md" />
          </div>
          <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
              <div>
                <SectionKicker>Receive email</SectionKicker>
                <h1 className="mb-6 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
                  Turn the email you receive into work.
                </h1>
                <p className="mb-8 max-w-lg text-pretty text-lg text-muted-foreground">
                  Wraps receives mail for your domain in your own AWS account,
                  reads out the sender, subject, body and attachments, and hands
                  each message to your app or your ticketing tool. Nobody
                  forwards anything by hand.
                </p>
                <InboundHeroCTA />
                <ul className="mt-6 grid gap-2 text-muted-foreground text-sm">
                  <li className="flex items-center gap-2">
                    <Check aria-hidden="true" className="size-4 text-brand" />
                    Each message carries Amazon's spam and virus verdicts
                  </li>
                  <li className="flex items-center gap-2">
                    <Check aria-hidden="true" className="size-4 text-brand" />
                    Reply from your app, with threading
                  </li>
                  <li className="flex items-center gap-2">
                    <Check aria-hidden="true" className="size-4 text-brand" />
                    No credit card to start with Wraps
                  </li>
                </ul>
              </div>
              <AnimatedInbox />
            </div>
          </div>
        </section>

        <Band sunken>
          <SectionHead
            body="Anything that starts with an email can start something in your own tools."
            kicker="What it does for a team"
            title="Support, orders, leads and documents."
          />
          <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2">
            {TEAM.map((item) => (
              <FlowBox key={item.label} label={item.label}>
                <h3 className="mb-1 font-heading font-semibold text-lg">
                  {item.title}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {item.body}
                </p>
              </FlowBox>
            ))}
          </div>
        </Band>

        <Band>
          <SectionHead
            body="Received emails are stored in an S3 bucket in your AWS account. The Wraps dashboard reads them from there; Wraps keeps no copy in its own database."
            kicker="What it takes"
            title="One command, one DNS record, one yes."
          />
          <ol className="mb-10 grid gap-x-6 gap-y-8 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <FlowBox dashed={index === 2} label={`Step ${index + 1}`}>
                  <h3 className="mb-1 font-heading font-semibold text-lg">
                    {step.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {step.body}
                  </p>
                </FlowBox>
              </li>
            ))}
          </ol>
          <FlowBox label="Inside your AWS account">
            <div className="grid gap-4 pt-1 sm:grid-cols-2 lg:grid-cols-4">
              {ROLES.map((role) => (
                <div key={role.title}>
                  <p className="font-semibold">{role.title}</p>
                  <p className="text-muted-foreground text-sm">
                    {role.description}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-muted-foreground text-xs leading-relaxed">
              The S3 bucket and Lambda functions are billed to you by AWS, at
              its rates. Wraps adds nothing per email.
            </p>
          </FlowBox>
        </Band>

        <Band id="developers" sunken>
          <SectionHead
            body="Follow one email from the sender to your application."
            kicker="For developers"
            title="The email pipeline."
          />
          <div className="sr-only">
            <ol>
              {pipelineSteps.map((step) => (
                <li key={step.id}>
                  <strong>{step.label}</strong>: {step.description}
                </li>
              ))}
            </ol>
          </div>
          <PipelineInteractive steps={pipelineSteps} />
        </Band>

        <Band>
          <SectionHead
            body="Every field parsed. Hover to explore the structure."
            kicker="Anatomy"
            title="What your code receives."
          />
          <div className="sr-only">
            <h3>Parsed Email Fields</h3>
            <ul>
              {ANATOMY_FIELDS.map(([name, description]) => (
                <li key={name}>
                  <strong>{name}</strong>: {description}
                </li>
              ))}
            </ul>
          </div>
          <AnatomyInteractive />
        </Band>

        <Band sunken>
          <SectionHead
            body="Examples of what a handler can do with a received email."
            kicker="Examples"
            title="Handlers in code."
          />
          <div className="sr-only">
            {useCases.map((useCase) => (
              <article key={useCase.id}>
                <h3>{useCase.title}</h3>
                <p>{useCase.description}</p>
                <pre>
                  <code>{useCase.code}</code>
                </pre>
              </article>
            ))}
          </div>
          <UseCasesCarousel useCases={useCases} />
        </Band>

        <Band>
          <SectionHead
            body="List, read and reply to received emails from the TypeScript SDK."
            kicker="SDK"
            title="TypeScript SDK."
          />
          <div className="sr-only">
            {Object.entries(codeExamples).map(([key, example]) => (
              <article key={key}>
                <h4>{example.label}</h4>
                <pre>
                  <code>{example.code}</code>
                </pre>
              </article>
            ))}
          </div>
          <SdkTabs examples={codeExamples} />
          <div className="mt-10 max-w-xl">
            <p className="mb-3 text-muted-foreground">
              Run this after your email stack is deployed with{" "}
              <code className="font-mono text-foreground text-sm">
                wraps email init
              </code>
              .
            </p>
            <InboundCommand />
          </div>
        </Band>

        <ClosingPanel
          actions={<InboundClosingActions />}
          body="Add inbound to your email setup with one command. AWS bills the S3 and Lambda usage to you."
          kicker="Ready to receive?"
          title="Start receiving email."
        />
      </main>
      <LandingFooter />
    </div>
  );
}
