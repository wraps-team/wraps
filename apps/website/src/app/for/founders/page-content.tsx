import { DotPattern } from "@wraps/ui/components/dot-pattern";
import { Check, X } from "lucide-react";
import { ClosingPanel } from "@/app/landing/components/closing-panel";
import { ContactFeeChart } from "@/app/landing/components/contact-fee-chart";
import { FlowBox } from "@/app/landing/components/flow-primitives";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { Band, SectionHead } from "@/app/landing/components/page-band";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { CONTACT_PRICE_ROWS } from "@/config/competitor-contact-pricing";
import { LICENSE_STATEMENT } from "@/config/license";
import { AWS_PRICING, formatCurrency, getTier } from "@/config/pricing";
import { estimateCost, SES_PLANS } from "@/lib/ses-cost";
import {
  FoundersClosingActions,
  FoundersHeroCTA,
} from "./components/founders-ctas";

// The headline is decided at review; it lives here so it changes in one place.
export const FOUNDERS_HEADLINE =
  "Your platform bill shouldn't grow every time your list does.";

const pro = getTier("pro");
const free = getTier("free");
const business = getTier("business");
const largest = CONTACT_PRICE_ROWS.at(-1);

const ESSENTIALS_RATE = SES_PLANS.essentials.perThousandEmails.toFixed(2);
const AMAZON_VOLUMES = [10_000, 100_000, 1_000_000] as const;
const amazonBill = (emails: number, sesPlan: "alacarte" | "essentials") =>
  `$${estimateCost({ emailsPerMonth: emails, tier: "free", sesPlan }).total.toFixed(2)}`;

const PRODUCT = [
  {
    label: "Newsletters",
    title: "Send to your whole list",
    body: "Write it once, or ask the AI to draft it, then see who opened and clicked. Sending to all contacts is included on every plan. Segments and scheduling come with Pro.",
  },
  {
    label: "Automations",
    title: "Emails that send themselves",
    body: "Send the welcome email when someone signs up, then the next one two days later. Free includes 2 automations. Pro has no limit.",
  },
  {
    label: "App emails",
    title: "Receipts and password resets",
    body: "Your product sends them through the same account, and they show up in the same dashboard as your newsletters. Hooking up your app takes a developer once, with an SDK.",
  },
  {
    label: "Contacts",
    title: "One list behind all of it",
    body: "Unlimited contacts on every plan. Segments and topics, which let you group people and let them pick what they get, are on Pro. Contacts and templates are stored by Wraps and can be exported.",
  },
];

const STEPS = [
  {
    time: "Minutes",
    title: "Connect your AWS account",
    body: "Click through it in your browser. No terminal needed. If you use Claude or Cursor, you can hand the setup to your agent instead.",
  },
  {
    time: "AWS checks them within 48 hours",
    title: "Add your domain",
    body: "Copy a few records into your domain's settings. This is the step you wait on.",
  },
  {
    time: "AWS reviews it in 1 to 72 hours",
    title: "Get approved to send",
    body: "Press Request production access in the dashboard. Until AWS says yes, you can send only to addresses you've verified.",
  },
];

const NEEDS = [
  "An AWS account. New accounts get a $200 AWS credit.",
  "Access to your domain's settings, or someone who has it.",
  "On the browser path, open and click links use an AWS-shared tracking domain. A branded one needs the CLI.",
];

const FIT = [
  "Your email bill grows every time your list does",
  "You already use AWS, or you're happy to open an account",
  "Several people send email and you want one place to do it",
];

const NOT_FIT = [
  "You don't want an AWS account at all",
  "You need A/B testing or a drag-and-drop editor today. Templates are code, and the AI writes the first draft.",
  "You need SOC 2 today. We don't have SOC 2 yet.",
];

export function FoundersPageContent() {
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
                <SectionKicker>For founders</SectionKicker>
                <h1 className="mb-6 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
                  {FOUNDERS_HEADLINE}
                </h1>
                <p className="mb-6 max-w-lg text-lg text-muted-foreground">
                  Klaviyo charges {formatCurrency(largest?.klaviyo ?? 0)} a
                  month for {largest?.contacts.toLocaleString("en-US")}{" "}
                  contacts. Wraps Pro is {formatCurrency(pro.price)}, at 5,000
                  contacts or 100,000. Newsletters, automations and your app's
                  emails run in one tool, and the sending goes through your own
                  Amazon account.
                </p>
                <FoundersHeroCTA />
                <ul className="mt-6 grid gap-2 text-muted-foreground text-sm">
                  <li className="flex items-center gap-2">
                    <Check aria-hidden="true" className="size-4 text-brand" />
                    Unlimited contacts on every plan
                  </li>
                  <li className="flex items-center gap-2">
                    <Check aria-hidden="true" className="size-4 text-brand" />
                    No sales call on any plan
                  </li>
                </ul>
              </div>
              <ContactFeeChart note="Wraps' fee is flat by plan. Amazon bills sending separately, at its own rates." />
            </div>
          </div>
        </section>

        <Band id="costs" sunken>
          <SectionHead
            body={
              <>
                Wraps is a flat fee: Free is {formatCurrency(free.price)}, Pro
                is {formatCurrency(pro.price)} a month, Business is{" "}
                {formatCurrency(business.price)}. Amazon bills what you send,
                straight to you. We add nothing per email.
              </>
            }
            kicker="The economics"
            title="Two bills. Only one of them grows with what you send."
          />
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <FlowBox dashed label="Amazon's bill, all in, per month">
              <div className="grid gap-3 pt-1">
                {AMAZON_VOLUMES.map((emails) => (
                  <div
                    className="border-border/60 border-b pb-3 last:border-b-0 last:pb-0"
                    key={emails}
                  >
                    <p className="mb-1 font-semibold">
                      {emails.toLocaleString("en-US")} emails a month
                    </p>
                    <p className="text-muted-foreground text-sm tabular-nums">
                      {amazonBill(emails, "alacarte")} on Amazon's $0.10 plan,{" "}
                      {amazonBill(emails, "essentials")} on the $
                      {ESSENTIALS_RATE} plan AWS gives new accounts
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-muted-foreground text-xs leading-relaxed">
                Add $0 for the Wraps Free plan. Includes the AWS event pipeline
                that records opens and clicks, with 90-day history and no
                dedicated IP. An account AWS put on the ${ESSENTIALS_RATE} plan
                can switch back to $0.10.
              </p>
            </FlowBox>
            <div className="grid content-start gap-4 text-muted-foreground leading-relaxed">
              <p>
                Segments, topics and scheduled sends start on Pro. It costs{" "}
                {formatCurrency(pro.price)} a month whether you have 5,000
                contacts or 100,000.
              </p>
              <p>
                The Amazon side is real money and it grows with your volume. At
                a million emails a month it's{" "}
                {amazonBill(1_000_000, "alacarte")} to{" "}
                {amazonBill(1_000_000, "essentials")}, all in. Check your own
                numbers in the{" "}
                <a
                  className="text-foreground underline underline-offset-4"
                  href="/tools/ses-calculator"
                >
                  cost calculator
                </a>
                .
              </p>
            </div>
          </div>
        </Band>

        <Band id="product">
          <SectionHead
            body="One place for the newsletter, the welcome series and the password reset."
            kicker="What you get"
            title="Everything your team needs to talk to customers."
          />
          <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2">
            {PRODUCT.map((item) => (
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

        <Band id="how" sunken>
          <SectionHead
            body="Three steps. One is minutes of clicking, two are waiting on AWS."
            kicker="What it takes"
            title="Set up the platform without an engineer."
          />
          <ol className="mb-10 grid gap-x-6 gap-y-8 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <FlowBox label={`Step ${index + 1}`}>
                  <h3 className="mb-1 font-heading font-semibold text-lg">
                    {step.title}
                  </h3>
                  <p className="mb-3 text-muted-foreground leading-relaxed">
                    {step.body}
                  </p>
                  <p className="font-semibold text-brand-text text-sm">
                    {step.time}
                  </p>
                </FlowBox>
              </li>
            ))}
          </ol>
          <FlowBox label="You'll need">
            <ul className="grid gap-2 text-muted-foreground">
              {NEEDS.map((need) => (
                <li className="flex items-start gap-2" key={need}>
                  <Check
                    aria-hidden="true"
                    className="mt-1 size-4 shrink-0 text-brand"
                  />
                  {need}
                </li>
              ))}
            </ul>
          </FlowBox>
        </Band>

        <Band>
          <SectionHead
            kicker="Why own it"
            title="Your domain. Your account. Your bill."
          />
          <div className="grid gap-x-6 gap-y-8 md:grid-cols-3">
            <FlowBox dashed label="Sending runs in your account">
              <p className="text-muted-foreground leading-relaxed">
                Every email goes out from your domain, through your own Amazon
                account. Want full control of your sending reputation? Add a
                dedicated IP in your account for{" "}
                {formatCurrency(AWS_PRICING.dedicatedIpMonthly)} a month.
              </p>
            </FlowBox>
            <FlowBox label="Sending keeps running without us">
              <p className="text-muted-foreground leading-relaxed">
                The sending setup lives in your AWS account. Stop paying Wraps
                and your app's emails keep going out. Newsletters, segments and
                automations stop, because they run on Wraps. Contacts and
                templates are stored by Wraps, and you can export them.
              </p>
            </FlowBox>
            <FlowBox label="Nothing hidden">
              <p className="text-muted-foreground leading-relaxed">
                We never store your AWS keys. The code is public, so your
                security reviewer can read what Wraps sets up.{" "}
                {LICENSE_STATEMENT}
              </p>
            </FlowBox>
          </div>
        </Band>

        <Band sunken>
          <SectionHead
            kicker="Fit"
            title="Who this is for, and who it isn't."
          />
          <div className="grid gap-x-6 gap-y-8 md:grid-cols-2">
            <FlowBox dashed label="Pick Wraps if">
              <ul className="grid gap-3">
                {FIT.map((line) => (
                  <li className="flex items-start gap-2" key={line}>
                    <Check
                      aria-hidden="true"
                      className="mt-1 size-4 shrink-0 text-brand"
                    />
                    {line}
                  </li>
                ))}
              </ul>
            </FlowBox>
            <FlowBox label="Not the right fit if">
              <ul className="grid gap-3 text-muted-foreground">
                {NOT_FIT.map((line) => (
                  <li className="flex items-start gap-2" key={line}>
                    <X
                      aria-hidden="true"
                      className="mt-1 size-4 shrink-0 text-muted-foreground"
                    />
                    {line}
                  </li>
                ))}
              </ul>
            </FlowBox>
          </div>
        </Band>

        <ClosingPanel
          actions={<FoundersClosingActions />}
          body={`Newsletters to all contacts are included on every plan. Segments, topics and scheduling start at ${formatCurrency(pro.price)} a month. AWS bills each email you send, at its own rates.`}
          title="Unlimited contacts. Even on the free plan."
        />
      </main>
      <LandingFooter />
    </div>
  );
}
