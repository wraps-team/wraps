import { Button } from "@wraps/ui/components/ui/button";
import { Cloud, Lock, Package, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ClosingPanel } from "@/app/landing/components/closing-panel";
import { FlowBox } from "@/app/landing/components/flow-primitives";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { Band, SectionHead } from "@/app/landing/components/page-band";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { TrackedClosingActions } from "@/components/tracked-closing-actions";
import { Github } from "@/components/ui/svgs/brand-icons";
import { LICENSE_STATEMENT } from "@/config/license";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = pageMetadata({
  title: "About Wraps - Our Mission and Values",
  description:
    "Wraps turns your own Amazon SES account into an email platform. Sending runs in your AWS account, you pay AWS directly, and Wraps adds nothing per email.",
  path: "/about",
  social: {
    title: "About Wraps",
    twitterCopy: {
      description:
        "Wraps turns your own Amazon SES account into an email platform.",
    },
  },
});

const values = [
  {
    icon: Package,
    label: "What we build",
    title: "A platform on top of AWS",
    description:
      "AWS has the sending, the scale and the prices. It doesn't have a dashboard your whole team can use. We build that layer, so you don't have to wire up IAM policies, DNS records and event pipelines by hand.",
  },
  {
    icon: Lock,
    label: "Leaving",
    title: "No Wraps lock-in",
    description:
      "The sending setup lives in your AWS account. Stop paying Wraps and your app's emails keep going out. Contacts and templates are stored by Wraps, and you can export them.",
  },
  {
    icon: Cloud,
    label: "Your account",
    title: "You pay AWS directly",
    description:
      "Wraps deploys into your AWS account and adds nothing to what Amazon bills you for sending. We never store your AWS keys.",
  },
  {
    icon: Zap,
    label: "Setup",
    title: "A few clicks, then AWS reviews",
    description:
      "Connect your AWS account from the browser, or run one command. Then wait on AWS: it checks your domain within 48 hours and reviews production access in 1 to 72 hours.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />

      <main>
        <section className="pt-24 pb-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <SectionKicker>About</SectionKicker>
              <h1 className="mb-6 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
                About <span className="text-brand-text">Wraps</span>
              </h1>
              <p className="text-lg text-muted-foreground">
                Wraps turns your own Amazon SES account into an email platform.
                Newsletters, automations and app emails in one dashboard, with
                sending that runs in your AWS account at Amazon's own rates.
              </p>
            </div>
          </div>
        </section>

        <Band sunken>
          <SectionHead
            kicker="Why Wraps exists"
            title="The problem we work on"
          />
          <div className="max-w-3xl space-y-4 text-foreground/80 text-lg leading-relaxed">
            <p>
              Amazon's email service is cheap and powerful, and hard to set up.
              Sending with SES takes hours of IAM policies, DNS records and
              event pipelines. SMS means navigating registration. A CDN means
              certificates and distribution settings.
            </p>
            <p>
              The easy alternatives charge for every contact you store, or they
              mark up every email. Wraps deploys the plumbing into your own AWS
              account and puts a dashboard on top. You pay Wraps a flat monthly
              fee and pay AWS for what you send.
            </p>
            <p>
              We are not in the sending path. If Wraps is offline, your app's
              emails still go out.
            </p>
          </div>
        </Band>

        <Band>
          <SectionHead kicker="Principles" title="How we work" />
          <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2">
            {values.map((value, i) => (
              <FlowBox dashed={i === 1} key={value.title} label={value.label}>
                <value.icon
                  aria-hidden
                  className="mb-3 size-5 text-foreground"
                />
                <h3 className="mb-2 text-balance font-heading font-semibold text-base text-foreground">
                  {value.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {value.description}
                </p>
              </FlowBox>
            ))}
          </div>
        </Band>

        <Band sunken>
          <SectionHead kicker="The code" title="You can read what we deploy" />
          <div className="max-w-3xl space-y-4 text-foreground/80 text-lg leading-relaxed">
            <p>
              The code is public, so you can see every resource Wraps creates in
              your AWS account before it does. {LICENSE_STATEMENT}
            </p>
            <p>
              When you run{" "}
              <code className="bg-muted px-2 py-0.5 font-mono text-sm">
                wraps email init
              </code>
              , you should know exactly what gets created.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="cursor-pointer" variant="brand">
              <a
                href="https://github.com/wraps-team/wraps"
                rel="noopener noreferrer"
                target="_blank"
              >
                <Github aria-hidden className="size-4" />
                View on GitHub
              </a>
            </Button>
            <Button asChild className="cursor-pointer" variant="outline">
              <Link href="/docs">Read the docs</Link>
            </Button>
          </div>
        </Band>

        <Band>
          <SectionHead kicker="Company" title="Who is behind Wraps" />
          <div className="max-w-3xl text-foreground/80 text-lg leading-relaxed">
            <p>
              Wraps is a product of{" "}
              <strong className="text-foreground">FlatironKids LLC</strong>, a
              company registered in the State of Colorado, United States.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="cursor-pointer" variant="outline">
              <Link href="/contact">Contact us</Link>
            </Button>
            <Button asChild className="cursor-pointer" variant="outline">
              <Link href="/privacy">Privacy policy</Link>
            </Button>
          </div>
        </Band>

        <ClosingPanel
          actions={
            <TrackedClosingActions
              location="about_closing"
              primary={{
                label: "Start free",
                href: "https://app.wraps.dev/auth?mode=signup",
              }}
              secondary={{ label: "Why Wraps", href: "/why-wraps" }}
            />
          }
          body="Connect your AWS account and add your domain. AWS reviews production access in 1 to 72 hours."
          title="Try it on your own AWS account."
        />
      </main>

      <LandingFooter />
    </div>
  );
}
