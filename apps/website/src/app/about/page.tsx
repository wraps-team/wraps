import { Button } from "@wraps/ui/components/ui/button";
import { Cloud, Lock, Package, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { Github } from "@/components/ui/svgs/brand-icons";

export const metadata: Metadata = {
  title: "About Wraps - Our Mission and Values",
  description:
    "Wraps brings SaaS-quality developer experience to AWS infrastructure. Deploy to your own account, pay AWS directly, and keep full control.",
  openGraph: {
    title: "About Wraps | Wraps",
    description:
      "Wraps brings SaaS-quality developer experience to AWS infrastructure. Deploy to your own account, pay AWS directly, and keep full control.",
    type: "website",
    url: "https://wraps.dev/about",
  },
  twitter: {
    title: "About Wraps | Wraps",
    description:
      "Wraps brings SaaS-quality developer experience to AWS infrastructure.",
  },
  alternates: {
    canonical: "https://wraps.dev/about",
  },
};

const values = [
  {
    icon: Package,
    title: "Infrastructure Wrappers",
    description:
      "We wrap AWS services in beautiful developer experiences. Same power, 10x better DX.",
  },
  {
    icon: Lock,
    title: "Zero Lock-In",
    description:
      "Infrastructure stays in your AWS account. Cancel anytime—your infrastructure keeps running. Your choice, always.",
  },
  {
    icon: Cloud,
    title: "Your AWS Account",
    description:
      "Deploy to your account, pay AWS directly. You own the infrastructure and data. We just make it easy.",
  },
  {
    icon: Zap,
    title: "SaaS-Quality DX",
    description:
      "One-command deployments, beautiful dashboards, clean APIs. AWS power with delightful developer experience.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />

      <main className="container mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-16 max-w-3xl">
          <div className="mb-5 inline-flex items-center gap-2 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-orange-500"
            />
            <span>wraps · about</span>
          </div>

          <h1 className="mb-6 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
            About <span className="text-orange-500">Wraps</span>
          </h1>

          <p className="text-lg text-muted-foreground">
            We believe developers shouldn&apos;t have to choose between AWS
            economics and great developer experience. Wraps brings SaaS-quality
            DX to AWS infrastructure&mdash;so you can deploy to your own
            account, pay AWS directly, and keep full control.
          </p>
        </div>

        <section className="mb-14 border-border border-t pt-12">
          <SectionKicker>01 — Mission</SectionKicker>
          <h2 className="mb-6 font-heading font-semibold text-2xl text-foreground tracking-tight sm:text-3xl">
            Our Mission
          </h2>
          <div className="space-y-4 text-foreground/80 text-lg leading-relaxed">
            <p>
              Cloud infrastructure is powerful but painful. Setting up email
              sending with AWS SES takes hours of IAM policies, DNS records, and
              event pipelines. SMS requires navigating registration processes
              and compliance. CDN setup means certificate management and
              distribution configuration.
            </p>
            <p>
              Wraps exists to eliminate that pain. One command deploys
              production-ready infrastructure to your AWS account. You get the
              full power and pricing of AWS with the simplicity developers
              expect from modern tools.
            </p>
            <p>
              We&apos;re not another SaaS middleman. We don&apos;t store your
              credentials, don&apos;t touch your data, and don&apos;t mark up
              AWS pricing. Your infrastructure runs in your account, and
              it&apos;ll keep running even if you stop using Wraps.
            </p>
          </div>
        </section>

        <section className="mb-14 border-border border-t pt-12">
          <SectionKicker>02 — Beliefs</SectionKicker>
          <h2 className="mb-6 font-heading font-semibold text-2xl text-foreground tracking-tight sm:text-3xl">
            What We Believe
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {values.map((value) => (
              <div
                className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-orange-500/40"
                key={value.title}
              >
                <value.icon
                  aria-hidden
                  className="mb-4 size-5 text-foreground"
                />
                <h3 className="mb-2 text-balance font-heading font-semibold text-[15px] text-foreground">
                  {value.title}
                </h3>
                <p className="text-[13.5px] text-muted-foreground leading-[1.55]">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-14 border-border border-t pt-12">
          <SectionKicker>03 — Open source</SectionKicker>
          <h2 className="mb-6 font-heading font-semibold text-2xl text-foreground tracking-tight sm:text-3xl">
            Open Source
          </h2>
          <div className="space-y-4 text-foreground/80 text-lg leading-relaxed">
            <p>
              Wraps is open source under the AGPLv3 license. Our CLI, SDK, and
              infrastructure code are all publicly available. You can inspect
              every resource we deploy, audit our security practices, and
              contribute improvements.
            </p>
            <p>
              We believe infrastructure tooling should be transparent. When you
              run{" "}
              <code className="rounded bg-muted px-2 py-0.5 font-mono text-sm">
                wraps email init
              </code>
              , you should know exactly what gets created in your AWS account.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              asChild
              className="cursor-pointer bg-orange-500 text-white hover:bg-orange-600"
            >
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
              <Link href="/docs">Read the Docs</Link>
            </Button>
          </div>
        </section>

        <section className="border-border border-t pt-12">
          <SectionKicker>04 — Company</SectionKicker>
          <h2 className="mb-6 font-heading font-semibold text-2xl text-foreground tracking-tight sm:text-3xl">
            Company
          </h2>
          <div className="text-foreground/80 text-lg leading-relaxed">
            <p>
              Wraps is a product of{" "}
              <strong className="text-foreground">FlatironKids LLC</strong>, a
              company registered in the State of Colorado, United States.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="cursor-pointer" variant="outline">
              <Link href="/contact">Contact Us</Link>
            </Button>
            <Button asChild className="cursor-pointer" variant="outline">
              <Link href="/privacy">Privacy Policy</Link>
            </Button>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
