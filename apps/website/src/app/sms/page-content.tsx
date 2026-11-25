import { DotPattern } from "@wraps/ui/components/dot-pattern";
import { ClosingPanel } from "@/app/landing/components/closing-panel";
import { FlowBox } from "@/app/landing/components/flow-primitives";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { Band, SectionHead } from "@/app/landing/components/page-band";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { SmsCode } from "./components/sms-code";
import { SmsClosingActions, SmsHeroCTA } from "./components/sms-ctas";

// Per-message and carrier figures are the ones `wraps sms init` quotes
// (packages/cli/src/utils/sms/costs.ts). AWS publishes no single US rate, so
// every figure here is an estimate and says so.
const PER_SEGMENT = 0.0075;
const CARRIER_AVERAGE = 0.003;
const NUMBER_MONTHLY = 2;
const VOLUMES = [10_000, 50_000, 100_000] as const;
const rate = (n: number) => `$${n}`;
const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TEAM = [
  {
    label: "Opt-outs",
    title: "STOP replies are honored",
    body: "The setup includes a managed AWS opt-out list. Your developers can check, add and remove numbers from the SDK, so nobody texts a person who opted out.",
  },
  {
    label: "Reporting",
    title: "See what was delivered",
    body: "Delivery events land in a table in your AWS account. The dashboard reads them to show volume, deliverability and your AWS spend limits.",
  },
  {
    label: "Registration",
    title: "A checklist for the paperwork",
    body: "Toll-free numbers need carrier registration. A command walks you through what it asks for and opens the AWS console at the right page. 10DLC is guidance only: you file it yourself.",
  },
  {
    label: "Billing",
    title: "AWS bills you directly",
    body: "No monthly Wraps subscription for SMS infrastructure, no per-seat fees and no markup from us. The platform dashboard is sold separately.",
  },
];

const STEPS = [
  {
    title: "Deploy",
    body: "One command puts the SMS infrastructure into your own AWS account and offers a toll-free number.",
    time: "A toll-free number is $2 a month",
  },
  {
    title: "Register",
    body: "Carriers review toll-free numbers before they deliver at volume.",
    time: "Typically 1 to 15 business days",
  },
  {
    title: "Send",
    body: "Your app sends with the TypeScript SDK. Delivery events flow back to your dashboard.",
    time: "Test with the AWS simulator first",
  },
];

export function SmsPageContent() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main>
        <section className="relative overflow-hidden pt-20 pb-16 sm:pt-28">
          <div className="absolute inset-0">
            <DotPattern className="opacity-100" fadeStyle="ellipse" size="md" />
          </div>
          <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
              <div>
                <SectionKicker>Text messages</SectionKicker>
                <h1 className="mb-6 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
                  Text messages that go out through your own AWS account.
                </h1>
                <p className="mb-8 max-w-lg text-lg text-muted-foreground">
                  Deploy SMS infrastructure into your own AWS account. Your team
                  sees volume, delivery and spend in the dashboard, your
                  developers send with a TypeScript SDK, and AWS bills you
                  directly.
                </p>
                <SmsHeroCTA />
              </div>
              <FlowBox dashed label="Your AWS account">
                <ul className="grid gap-3 pt-1 text-muted-foreground">
                  <li>
                    <span className="font-semibold text-foreground">
                      A toll-free number
                    </span>{" "}
                    that sends your texts
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">
                      An opt-out list
                    </span>{" "}
                    that remembers who said STOP
                  </li>
                  <li>
                    <span className="font-semibold text-foreground">
                      A delivery log
                    </span>{" "}
                    of every message and its status
                  </li>
                </ul>
              </FlowBox>
            </div>
          </div>
        </section>

        <Band sunken>
          <SectionHead
            body="The same model as Wraps email: the sending runs in your account."
            kicker="What your team gets"
            title="Texting without the usual paperwork pile."
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
            body="Registration is the part you wait on."
            kicker="What it takes"
            title="Deploy, register, send."
          />
          <ol className="grid gap-x-6 gap-y-8 md:grid-cols-3">
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
        </Band>

        <Band id="pricing" sunken>
          <SectionHead
            body={`Estimates: ${rate(PER_SEGMENT)} per message segment plus carrier fees, and ${money(NUMBER_MONTHLY)} a month for a toll-free number. Carrier fees vary by carrier and message type, so your exact rate comes from AWS.`}
            kicker="Cost"
            title="What AWS bills, by volume."
          />
          <FlowBox label="Monthly AWS cost, estimated">
            <div className="overflow-x-auto">
              <table className="w-full min-w-120 text-left text-sm">
                <thead>
                  <tr className="text-muted-foreground">
                    {["Segments", "Messages", "Carrier", "Number", "Total"].map(
                      (heading) => (
                        <th
                          className="border-border border-b pb-3 font-sans font-semibold text-xs uppercase tracking-eyebrow"
                          key={heading}
                          scope="col"
                        >
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {VOLUMES.map((volume) => (
                    <tr className="border-border border-t" key={volume}>
                      <th className="py-3 font-medium" scope="row">
                        {volume.toLocaleString("en-US")} a month
                      </th>
                      <td className="py-3 text-muted-foreground">
                        {money(volume * PER_SEGMENT)}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {money(volume * CARRIER_AVERAGE)}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {money(NUMBER_MONTHLY)}
                      </td>
                      <td className="py-3 font-semibold text-brand-text">
                        {money(
                          volume * (PER_SEGMENT + CARRIER_AVERAGE) +
                            NUMBER_MONTHLY
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-muted-foreground text-xs leading-relaxed">
              Uses {rate(PER_SEGMENT)} a segment, an average{" "}
              {rate(CARRIER_AVERAGE)} carrier fee and one toll-free number: the
              figures <code className="font-mono">wraps sms init</code> quotes.
              AWS publishes no single US rate. Your usage report shows the exact
              price per message. You pay AWS directly.
            </p>
          </FlowBox>
        </Band>

        <Band id="developers">
          <SectionHead
            body="Deploy with the CLI, send with the SDK. A batch call sends a list of messages and returns a result for each, so one failure doesn't lose the run."
            kicker="For developers"
            title="Two commands and a function call."
          />
          <div className="max-w-3xl">
            <SmsCode />
          </div>
          <p className="mt-6 max-w-3xl text-muted-foreground">
            We never store your AWS keys. Docs: the{" "}
            <a
              className="text-foreground underline underline-offset-4"
              href="/docs/quickstart/sms"
            >
              SMS quickstart
            </a>{" "}
            and the{" "}
            <a
              className="text-foreground underline underline-offset-4"
              href="/docs/infrastructure/sms"
            >
              list of what gets deployed
            </a>
            .
          </p>
        </Band>

        <ClosingPanel
          actions={<SmsClosingActions />}
          body="Deploy SMS infrastructure into your own AWS account. AWS bills you directly."
          title="Start with the simulator, then register a number."
        />
      </main>
      <LandingFooter />
    </div>
  );
}
