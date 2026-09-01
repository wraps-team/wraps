"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Card } from "@wraps/ui/components/ui/card";
import {
  Building2,
  ChevronRight,
  Clock,
  Database,
  Key,
  Lock,
  Server,
  Shield,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import Link from "next/link";

export function ScalePlanContent() {
  return (
    <main className="mx-auto max-w-4xl space-y-20 px-6 py-16">
      {/* Update note — this post describes the pre-2026-08 ladder. Do not
          rewrite the body; the plan names and prices below are historical. */}
      <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 text-sm">
        <p className="text-foreground/90">
          <strong>Updated 2026-08:</strong> the Scale plan described in this
          post is now called Business. Existing Scale subscriptions keep their
          $199/mo pricing for life. See{" "}
          <Link className="underline" href="/platform#pricing">
            current plans
          </Link>
          .
        </p>
      </div>

      {/* Intro */}
      <section>
        <p className="text-foreground/80 text-lg leading-relaxed">
          The Starter and Growth plans cover most teams. But once your
          organization has multiple AWS accounts, an IdP managing employee
          access, and segments driven by user behavior rather than static
          properties, you need more. Scale is the tier we built for that.
        </p>

        <p className="mt-4 text-foreground/80 text-lg leading-relaxed">
          This post covers every Scale-exclusive feature that's shipped today,
          with real numbers, and what's coming next.
        </p>
      </section>

      {/* What you get on Scale */}
      <section>
        <h2 className="mb-8 flex items-center gap-3 font-bold text-3xl">
          <Zap className="text-orange-500" />
          What Scale unlocks
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          {[
            {
              icon: <Key className="text-orange-500" size={18} />,
              title: "SSO + SCIM provisioning",
              desc: "Connect any SAML 2.0 or OIDC IdP. SCIM syncs user provisioning and deprovisioning automatically.",
            },
            {
              icon: <TrendingUp className="text-orange-500" size={18} />,
              title: "Behavioral segments",
              desc: "Segment users by events they've fired, not just properties they have. \"Users who opened 3+ emails but haven't converted\" is a behavioral segment.",
            },
            {
              icon: <Server className="text-orange-500" size={18} />,
              title: "Unlimited AWS accounts",
              desc: "Growth caps at 3 accounts. Scale removes the limit. Connect staging, prod, and every regional account.",
            },
            {
              icon: <Database className="text-orange-500" size={18} />,
              title: "1-year event history",
              desc: "Events, deliveries, and segment memberships retained for 365 days. Growth keeps 90, Starter keeps 30.",
            },
            {
              icon: <Sparkles className="text-orange-500" size={18} />,
              title: "1,000 AI generations/month",
              desc: "Template generation, workflow generation, subject line suggestions — 1K per month vs. 250 on Growth.",
            },
            {
              icon: <Shield className="text-orange-500" size={18} />,
              title: "Priority support + SLA",
              desc: "Named SLA, not just priority queue. Response time commitments in writing.",
            },
          ].map((f) => (
            <Card className="p-5" key={f.title}>
              <div className="mb-2 flex items-center gap-2">
                {f.icon}
                <h4 className="font-semibold text-foreground">{f.title}</h4>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {f.desc}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* SSO + SCIM */}
      <section>
        <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
          <Lock className="text-orange-500" />
          SSO + SCIM provisioning
        </h2>

        <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
          Most SaaS tools add SSO as an afterthought or charge a separate
          "enterprise add-on" price. On Wraps Scale, SSO and SCIM are included
          in the plan. You pay $199/mo — not $199/mo plus $X for "enterprise
          auth."
        </p>

        <Card className="mb-6 p-6">
          <h3 className="mb-4 font-semibold text-foreground text-lg">
            What this means operationally
          </h3>
          <ul className="space-y-3">
            {[
              "Employees log in with your company IdP — Okta, Entra ID, Google Workspace, any SAML 2.0 or OIDC provider",
              "SCIM automatically provisions users when you add them in your IdP and deprovisions when you remove them",
              "No orphaned accounts from employees who left two quarters ago",
              "Your security team can audit Wraps access from the same IAM dashboard they use for everything else",
            ].map((item) => (
              <li
                className="flex items-start gap-3 text-foreground/80 text-sm"
                key={item}
              >
                <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-orange-500" />
                {item}
              </li>
            ))}
          </ul>
        </Card>

        <p className="mb-6 text-foreground/80 leading-relaxed">
          The SSO settings live at{" "}
          <span className="font-mono text-orange-500 text-sm">
            app.wraps.dev → Settings → SSO
          </span>
          . You paste your metadata URL, we detect the provider, and you're
          done. SCIM endpoint and token are on the same page.
        </p>

        <p className="mb-4 text-foreground/80 leading-relaxed">
          SSO controls how employees authenticate. Roles control what they can
          do once they're in. Wraps ships six roles with per-resource
          granularity:
        </p>

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-foreground">
                  Role
                </th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">
                  What they can do
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                {
                  role: "owner / admin",
                  desc: "Full access — contacts, templates, broadcasts, workflows, AWS accounts, billing, SSO, team management",
                },
                {
                  role: "member",
                  desc: "Full content and workflow access. Read-only on API keys, AWS accounts, and team members",
                },
                {
                  role: "marketing",
                  desc: "Create and send broadcasts, edit templates, manage contacts. Read-only on workflows, segments, and topics",
                },
                {
                  role: "read-only",
                  desc: "Read and export across all content. No writes anywhere",
                },
                {
                  role: "billing",
                  desc: "Manage billing settings. Read-only on org context and team members",
                },
              ].map((row) => (
                <tr className="hover:bg-muted/20" key={row.role}>
                  <td className="px-4 py-3 font-mono font-medium text-foreground text-xs">
                    {row.role}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.desc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Behavioral Segments */}
      <section>
        <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
          <TrendingUp className="text-orange-500" />
          Behavioral segments
        </h2>

        <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
          Property-based segments are available from Starter. You can target
          users where{" "}
          <span className="font-mono text-orange-500 text-sm">
            plan === "paid"
          </span>{" "}
          or{" "}
          <span className="font-mono text-orange-500 text-sm">
            country === "US"
          </span>
          . That covers most cases.
        </p>

        <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
          Behavioral segments go further. Instead of filtering on contact
          properties, you filter on events those contacts have fired. The
          segment updates automatically as new events come in.
        </p>

        <Card className="mb-6 overflow-hidden">
          <div className="border-b bg-muted/40 px-6 py-3">
            <p className="font-mono text-muted-foreground text-sm">
              Examples of behavioral segments
            </p>
          </div>
          <div className="divide-y">
            {[
              {
                label: "Re-engagement candidates",
                rule: 'Fired "email_opened" at least once, but NOT "purchase_completed" in the last 30 days',
              },
              {
                label: "Power users",
                rule: 'Fired "feature_used" more than 10 times in the last 7 days',
              },
              {
                label: "Churn risk",
                rule: 'Fired "session_started" in the last 60 days, but NOT in the last 14 days',
              },
              {
                label: "Upgrade candidates",
                rule: 'Fired "limit_hit" at least 3 times and has plan === "starter"',
              },
            ].map((ex) => (
              <div className="px-6 py-4" key={ex.label}>
                <p className="mb-1 font-semibold text-foreground text-sm">
                  {ex.label}
                </p>
                <p className="font-mono text-muted-foreground text-xs leading-relaxed">
                  {ex.rule}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <p className="text-foreground/80 leading-relaxed">
          Behavioral segments are available in the Segments dashboard and can be
          used as targets in broadcasts and workflows.
        </p>
      </section>

      {/* Unlimited AWS accounts */}
      <section>
        <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
          <Building2 className="text-orange-500" />
          Unlimited AWS accounts
        </h2>

        <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
          Wraps deploys infrastructure to your AWS accounts — not ours. Every
          AWS account you connect gets its own SES configuration, dedicated IPs
          (optional), EventBridge rules, and isolation boundary.
        </p>

        <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
          Growth allows 3 accounts. That's fine for dev/staging/prod. But
          platform teams often have more: regional accounts, accounts per
          product line, accounts per customer (if you're multi-tenant). Scale
          removes the limit entirely.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              tier: "Growth",
              price: "$79/mo",
              accounts: "3 accounts",
            },
            {
              tier: "Scale",
              price: "$199/mo",
              accounts: "Unlimited",
              highlight: true,
            },
          ].map((row) => (
            <Card
              className={`p-5 ${row.highlight ? "border-orange-500/50 bg-orange-500/5" : ""}`}
              key={row.tier}
            >
              <p className="font-semibold text-foreground">{row.tier}</p>
              <p className="text-muted-foreground text-sm">{row.price}</p>
              <p
                className={`mt-2 font-bold text-2xl ${row.highlight ? "text-orange-500" : "text-foreground"}`}
              >
                {row.accounts}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* Volume limits */}
      <section>
        <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
          <Database className="text-orange-500" />
          Scale-grade limits
        </h2>

        <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
          The numbers that matter for high-volume teams, compared to Growth:
        </p>

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-foreground">
                  Limit
                </th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">
                  Growth ($79/mo)
                </th>
                <th className="px-4 py-3 text-left font-semibold text-orange-500">
                  Scale ($199/mo)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {[
                {
                  label: "Tracked events/month",
                  growth: "250,000",
                  scale: "1,000,000",
                },
                {
                  label: "Overage rate",
                  growth: "$0.50/1K events",
                  scale: "$0.15/1K events",
                },
                {
                  label: "Event history retention",
                  growth: "90 days",
                  scale: "365 days",
                },
                {
                  label: "Batch send size",
                  growth: "2,000 contacts",
                  scale: "10,000 contacts",
                },
                {
                  label: "AI generations/month",
                  growth: "250",
                  scale: "1,000",
                },
                {
                  label: "API rate limit (per minute)",
                  growth: "2,000 req/min",
                  scale: "5,000 req/min",
                },
                {
                  label: "AWS accounts",
                  growth: "3",
                  scale: "Unlimited",
                },
              ].map((row) => (
                <tr className="hover:bg-muted/20" key={row.label}>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {row.label}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.growth}
                  </td>
                  <td className="px-4 py-3 font-semibold text-orange-500">
                    {row.scale}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-muted-foreground text-sm">
          The $0.15/1K overage rate matters at volume. At 2M events/month, the
          difference between Growth ($0.50/1K) and Scale ($0.15/1K) is $700/mo
          in overage alone — Scale pays for itself three times over.
        </p>
      </section>

      {/* What's coming */}
      <section>
        <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
          <Clock className="text-orange-500" />
          What's coming to Scale
        </h2>

        <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
          These are features in active development for the Scale tier. Not
          vaporware — each is something customers have asked for specifically.
        </p>

        <div className="space-y-4">
          <Card className="p-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
                <Shield className="text-orange-500" size={16} />
              </div>
              <h3 className="font-semibold text-foreground text-lg">
                Audit trail
              </h3>
              <Badge className="text-xs" variant="outline">
                Coming soon
              </Badge>
            </div>
            <p className="text-foreground/80 leading-relaxed">
              A tamper-evident log of every action taken in your Wraps
              organization: who sent what, who changed a template, who added or
              removed a team member, who connected an AWS account. Filterable by
              user, resource, and time range. Exportable for compliance reviews.
              This is the feature security-conscious teams ask for most in
              enterprise evaluations.
            </p>
          </Card>

          <Card className="p-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/10">
                <Database className="text-orange-500" size={16} />
              </div>
              <h3 className="font-semibold text-foreground text-lg">
                Custom data retention
              </h3>
              <Badge className="text-xs" variant="outline">
                Coming soon
              </Badge>
            </div>
            <p className="text-foreground/80 leading-relaxed">
              Scale today includes a fixed 365-day retention window. Custom
              retention lets you configure this per resource type: event
              history, contact activity, delivery logs. Some regulated
              industries need to retain less (GDPR right-to-erasure compliance);
              others need to retain more for audit purposes. You'll be able to
              set both.
            </p>
          </Card>
        </div>
      </section>

      {/* Continue Learning */}
      <section className="space-y-4">
        <h2 className="font-bold text-2xl">More on Scale</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
            href="/#pricing"
          >
            <h3 className="font-semibold group-hover:text-primary">
              Pricing + plan comparison
            </h3>
            <p className="text-muted-foreground text-sm">
              Full feature comparison across Free, Starter, Growth, and Scale
            </p>
          </Link>
          <Link
            className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
            href="/tools/ses-calculator"
          >
            <h3 className="font-semibold group-hover:text-primary">
              Cost calculator
            </h3>
            <p className="text-muted-foreground text-sm">
              Estimate your total cost at different event volumes
            </p>
          </Link>
          <Link
            className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
            href="/docs/quickstart/email"
          >
            <h3 className="font-semibold group-hover:text-primary">
              Email quickstart
            </h3>
            <p className="text-muted-foreground text-sm">
              Deploy your first SES integration in under 60 seconds
            </p>
          </Link>
          <Link
            className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
            href="/contact"
          >
            <h3 className="font-semibold group-hover:text-primary">
              Talk to us
            </h3>
            <p className="text-muted-foreground text-sm">
              Questions about Scale or custom limits? We'll respond same day.
            </p>
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="relative">
        <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-orange-500/10 to-amber-500/10 blur-xl" />
        <Card className="relative p-8 text-center md:p-12">
          <h2 className="mb-4 font-bold text-3xl md:text-4xl">
            Ready to scale?
          </h2>
          <p className="mx-auto mb-8 max-w-lg text-muted-foreground">
            Scale starts at $199/mo. SSO, behavioral segments, unlimited AWS
            accounts, 1M events, and a 1-year history window included. No
            add-ons.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              className="flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 font-semibold text-white transition-colors hover:bg-orange-400"
              href="https://app.wraps.dev/auth?mode=signup&plan=scale"
            >
              Subscribe to Scale
              <ChevronRight size={18} />
            </Link>
            <Link
              className="rounded-xl border px-6 py-3 font-semibold text-foreground transition-colors hover:bg-muted"
              href="/contact"
            >
              Talk to us first
            </Link>
          </div>
        </Card>
      </section>
    </main>
  );
}
