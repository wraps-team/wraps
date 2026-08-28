import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { LegalArticle } from "@/components/legal-article";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how Wraps collects, uses, and protects your data, including CLI telemetry, dashboard analytics, recipient engagement data from open and click events, and the contact and campaign data we process to run platform features.",
  openGraph: {
    title: "Privacy Policy | Wraps",
    description:
      "Learn how Wraps collects, uses, and protects your data, including CLI telemetry, dashboard analytics, recipient engagement data from open and click events, and the contact and campaign data we process to run platform features.",
    type: "website",
    url: "https://wraps.dev/privacy",
  },
  twitter: {
    title: "Privacy Policy | Wraps",
    description: "Learn how Wraps collects, uses, and protects your data.",
  },
  alternates: {
    canonical: "https://wraps.dev/privacy",
  },
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <div className="container mx-auto max-w-4xl px-4 pt-24 pb-16">
        <LegalArticle>
          <h1>Privacy Policy</h1>
          <p className="text-muted-foreground">
            <strong>Last Updated:</strong> August 14, 2026
          </p>

          <p className="lead">
            At Wraps, we take your privacy seriously. This Privacy Policy
            explains how we collect, use, disclose, and safeguard your
            information when you use our CLI tool, SDK, and services.
          </p>

          <p>
            Wraps is a product of <strong>FlatironKids LLC</strong>, a company
            registered in the State of Colorado, United States.
          </p>

          <h2>1. Information We Collect</h2>

          <h3>1.1 Anonymous Telemetry Data (CLI)</h3>
          <p>
            When you use the Wraps CLI, we collect anonymous usage data to
            improve the product. This telemetry is <strong>opt-out</strong> and
            can be disabled at any time.
          </p>

          <p>
            <strong>We DO collect:</strong>
          </p>
          <ul>
            <li>Command names executed (e.g., "init", "deploy", "status")</li>
            <li>Command success/failure status</li>
            <li>Command execution duration</li>
            <li>CLI version number</li>
            <li>Operating system type (macOS, Linux, Windows)</li>
            <li>Node.js version</li>
            <li>Service types used (email, SMS, etc.)</li>
            <li>Configuration preset selections (starter, production, etc.)</li>
            <li>Error codes (not error messages)</li>
            <li>
              Anonymous UUID (generated locally, not linked to your identity)
            </li>
          </ul>

          <p>
            <strong>We DO NOT collect:</strong>
          </p>
          <ul>
            <li>AWS account IDs or credentials</li>
            <li>IAM role ARNs</li>
            <li>Domain names or email addresses</li>
            <li>IP addresses</li>
            <li>File paths or directory structures</li>
            <li>Email content or templates</li>
            <li>Environment variables</li>
            <li>Error messages (only error codes)</li>
            <li>Command arguments or flag values</li>
            <li>Any personally identifiable information (PII)</li>
          </ul>

          <h3>1.2 Dashboard & Website Analytics</h3>
          <p>
            When you use the Wraps Dashboard or visit our website, we use{" "}
            <strong>PostHog</strong> to collect analytics data. This helps us
            understand how our product is used and improve your experience.
          </p>

          <p>
            <strong>We collect:</strong>
          </p>
          <ul>
            <li>Email address (for authentication and user identification)</li>
            <li>Organization name</li>
            <li>AWS account connections (account IDs are hashed)</li>
            <li>Pages visited and navigation patterns</li>
            <li>Feature usage and interactions</li>
            <li>Browser type, version, and screen size</li>
            <li>Referral source (how you found us)</li>
            <li>Country/region (derived from IP, IP is not stored)</li>
          </ul>

          <p>
            <strong>Events we track include:</strong>
          </p>
          <ul>
            <li>Sign-in and sign-up events (authentication method used)</li>
            <li>Organization creation and team invitations</li>
            <li>Email template creation and broadcast scheduling</li>
            <li>Subscription upgrades and plan changes</li>
            <li>AWS account connections</li>
            <li>Feature adoption and usage patterns</li>
          </ul>

          <p>
            <strong>
              We do not send the following to our analytics provider:
            </strong>
          </p>
          <ul>
            <li>Email content or template body text</li>
            <li>Recipient email addresses</li>
            <li>
              Recipient user agents from open and click events (see Section 1.5;
              recipient IP addresses are never stored anywhere)
            </li>
            <li>AWS credentials or secret keys</li>
            <li>Session recordings or screen captures</li>
            <li>Keystrokes or form field contents (except authentication)</li>
          </ul>
          <p className="text-muted-foreground text-sm">
            This list describes our analytics tooling only. Contact and campaign
            data you create in the dashboard is processed separately to run
            platform features &mdash; see Sections 1.4 and 1.5.
          </p>

          <h3>1.3 Infrastructure (Your AWS Account)</h3>
          <p>
            The sending infrastructure Wraps deploys runs entirely in{" "}
            <strong>your AWS account</strong>. For this layer, we do not have
            access to:
          </p>
          <ul>
            <li>
              Your AWS credentials (we use short-lived OIDC and IAM roles, never
              stored keys)
            </li>
            <li>Emails sent through your SES</li>
            <li>Your full delivery event history, stored in your DynamoDB</li>
          </ul>
          <p>
            Sending and event-history storage happen in your AWS account. If you
            stop using Wraps, this infrastructure and its data keep running and
            remain yours.
          </p>

          <h3>1.4 Platform Data (Contacts &amp; Campaigns)</h3>
          <p>
            To run the Wraps dashboard and platform features (contacts,
            audiences and segments, templates, broadcasts, and workflows), we
            store and process the underlying data on our own infrastructure.
            This is necessary: we cannot build an audience or send a campaign on
            your behalf without processing your contacts. For this data, Wraps
            acts as a <strong>data processor</strong> and you remain the{" "}
            <strong>data controller</strong>, the same arrangement you have with
            any email service provider.
          </p>
          <p>
            <strong>This includes:</strong>
          </p>
          <ul>
            <li>
              Contact records you create or import: email address, phone number,
              name, and any custom properties you add
            </li>
            <li>Audience, segment, and topic (subscription) definitions</li>
            <li>Email templates and campaign content (subject and body)</li>
            <li>
              A send ledger: recipient address, the merge variables used to
              personalize each message, delivery and engagement status (sent,
              delivered, opened, clicked, bounced, complained), and the
              engagement metadata described in Section 1.5
            </li>
          </ul>
          <p>
            This data is stored in a managed PostgreSQL database (Neon) hosted
            in the United States. It is scoped to your organization and is never
            shared with other customers. You can export or delete it at any time
            (see Section 5). If your use requires a Data Processing Agreement,
            contact{" "}
            <a className="text-primary" href="mailto:privacy@wraps.dev">
              privacy@wraps.dev
            </a>
            .
          </p>

          <h3>1.5 Recipient Engagement Data (Open and Click Events)</h3>
          <p>
            If you enable open or click tracking on your SES configuration set,
            AWS records an event each time one of your recipients opens a
            message or clicks a tracked link. AWS populates those events with
            two fields about the recipient: an <strong>IP address</strong> and a{" "}
            <strong>user agent</strong> string.
          </p>
          <p>
            <strong>We store the user agent. We discard the IP address.</strong>{" "}
            These events are emitted onto the EventBridge bus in <em>your</em>{" "}
            AWS account, and the rule Wraps deploys forwards them to the Wraps
            API. When we process one, we record the user agent on the matching
            row of the send ledger described in Section 1.4 and drop the IP
            address without storing it. There is no column for it in our
            database. That ledger lives in our managed PostgreSQL database
            (Neon) in the United States and is scoped to your organization.
          </p>
          <p>
            <strong>What we use the user agent for.</strong> One purpose:
            identifying automated opens (privacy proxies, security scanners,
            link checkers) so they can be excluded from your open-rate metrics.
            Otherwise your open rates would be inflated by machines. We do not
            use it to geolocate, fingerprint, profile, score, or re-identify
            your recipients, and we do not combine recipient data across
            customers.
          </p>
          <p>
            <strong>Controller and lawful basis.</strong> As with the rest of
            Section 1.4, you are the data controller for your recipients and
            Wraps is your processor. Under GDPR, ePrivacy, and similar regimes,
            user agents are personal data, and open and click tracking generally
            requires a lawful basis and disclosure to your recipients. Deciding
            whether to enable tracking, establishing that basis, and telling
            your recipients about it in your own privacy notice are your
            responsibility, not ours. Note that AWS SES independently logs open
            and click events, including the recipient IP address, in your own
            AWS account &mdash; that copy is yours to govern.
          </p>
          <p>
            <strong>How to turn it off.</strong> Open and click tracking is
            controlled by the event types on your SES configuration set, which
            lives in your AWS account. Omit <code>OPEN</code> and{" "}
            <code>CLICK</code> from your event configuration and no engagement
            events are generated at all, so nothing about your recipients&apos;
            reading behavior reaches Wraps. Your delivery, bounce, and complaint
            reporting is unaffected; open and click rates simply stop being
            reported. See the{" "}
            <Link
              className="text-primary hover:underline"
              href="/docs/infrastructure/events"
            >
              EventBridge events documentation
            </Link>{" "}
            for the full list of event types and how to change them.
          </p>
          <p>
            <strong>Retention and deletion.</strong> Engagement metadata is
            retained for the life of the send ledger row: while your account is
            active, and deleted on request or after account closure (see
            Sections 4 and 5). A deletion request covering a specific recipient
            removes their engagement metadata along with their contact record
            and send history.
          </p>

          <h2>2. How We Use Your Information</h2>

          <h3>2.1 Telemetry Data</h3>
          <p>We use anonymous telemetry to:</p>
          <ul>
            <li>Understand which commands and features are most used</li>
            <li>Identify and fix bugs and errors</li>
            <li>Improve CLI performance and user experience</li>
            <li>Prioritize feature development</li>
            <li>Monitor service health and reliability</li>
          </ul>

          <h3>2.2 Account Information</h3>
          <p>We use account information to:</p>
          <ul>
            <li>Provide and maintain our services</li>
            <li>Authenticate users</li>
            <li>Send important service updates</li>
            <li>Provide customer support</li>
            <li>Process payments (if applicable)</li>
          </ul>

          <h2>3. How We Share Your Information</h2>

          <h3>3.1 Third-Party Services</h3>
          <p>We use the following third-party services:</p>

          <ul>
            <li>
              <strong>PostHog</strong> (
              <a
                className="text-primary"
                href="https://posthog.com/privacy"
                rel="noopener noreferrer"
                target="_blank"
              >
                Privacy Policy
              </a>
              ) - Product analytics across CLI, web dashboard, and marketing
              website. PostHog is an open-source analytics platform. We use
              PostHog Cloud hosted in the US. Data collected includes usage
              patterns, feature interactions, and anonymous telemetry. PostHog
              processes this data on our behalf and does not use it for their
              own purposes.
            </li>
            <li>
              <strong>Vercel</strong> (
              <a
                className="text-primary"
                href="https://vercel.com/legal/privacy-policy"
                rel="noopener noreferrer"
                target="_blank"
              >
                Privacy Policy
              </a>
              ) - Website and API hosting
            </li>
            <li>
              <strong>Neon</strong> (
              <a
                className="text-primary"
                href="https://neon.tech/privacy-policy"
                rel="noopener noreferrer"
                target="_blank"
              >
                Privacy Policy
              </a>
              ) - Managed PostgreSQL hosting (US) for platform data: contacts,
              audiences, templates, and the send ledger
            </li>
            <li>
              <strong>AWS</strong> (
              <a
                className="text-primary"
                href="https://aws.amazon.com/privacy/"
                rel="noopener noreferrer"
                target="_blank"
              >
                Privacy Policy
              </a>
              ) - Infrastructure deployment (in your account)
            </li>
            <li>
              <strong>Stripe</strong> (
              <a
                className="text-primary"
                href="https://stripe.com/privacy"
                rel="noopener noreferrer"
                target="_blank"
              >
                Privacy Policy
              </a>
              ) - Payment processing
            </li>
          </ul>

          <p>
            These services have their own privacy policies and we ensure they
            meet appropriate privacy and security standards.
          </p>

          <h3>3.2 We DO NOT:</h3>
          <ul>
            <li>Sell your data to third parties</li>
            <li>Share your data for advertising purposes</li>
            <li>Use your data for purposes unrelated to Wraps</li>
            <li>
              Share your contacts, send ledger, or recipient engagement data
              (Sections 1.4 and 1.5) with any third party other than the
              infrastructure providers listed above, or combine it with data
              from other Wraps customers
            </li>
          </ul>

          <h2>4. Data Retention</h2>

          <ul>
            <li>
              <strong>Telemetry events:</strong> Stored for 90 days, then
              automatically deleted
            </li>
            <li>
              <strong>Aggregate statistics:</strong> Retained indefinitely (no
              PII)
            </li>
            <li>
              <strong>Account data:</strong> Retained while your account is
              active
            </li>
            <li>
              <strong>Platform data (contacts, campaigns, send ledger):</strong>{" "}
              Retained while your account is active; deleted on request or after
              account closure
            </li>
            <li>
              <strong>
                Recipient engagement metadata (open/click user agent):
              </strong>{" "}
              Retained with the send ledger row it belongs to, on the same terms
            </li>
            <li>
              <strong>Server logs:</strong> Retained for 7 days
            </li>
          </ul>

          <h2>5. Your Rights and Choices</h2>

          <h3>5.1 Opt-Out of Telemetry</h3>
          <p>You can disable telemetry at any time:</p>

          <pre className="overflow-x-auto rounded-lg bg-muted p-4 text-sm">
            <code>
              {`# Disable via CLI command
wraps telemetry disable

# Or set environment variable
export WRAPS_TELEMETRY_DISABLED=1

# Or use universal standard
export DO_NOT_TRACK=1`}
            </code>
          </pre>

          <p>
            Telemetry is also automatically disabled in CI/CD environments. See
            our{" "}
            <Link
              className="text-primary hover:underline"
              href="/docs/telemetry"
            >
              telemetry documentation
            </Link>{" "}
            for more details.
          </p>

          <h3>5.2 Opt-Out of Web Analytics</h3>
          <p>
            For the web dashboard and website, you can opt out of PostHog
            analytics:
          </p>
          <ul>
            <li>
              <strong>Browser setting:</strong> Enable "Do Not Track" in your
              browser settings
            </li>
            <li>
              <strong>Ad blockers:</strong> Most ad blockers will block PostHog
              tracking
            </li>
            <li>
              <strong>PostHog opt-out:</strong> Visit{" "}
              <a
                className="text-primary"
                href="https://posthog.com/privacy"
                rel="noopener noreferrer"
                target="_blank"
              >
                PostHog's privacy page
              </a>{" "}
              to opt out globally
            </li>
          </ul>
          <p>
            Note: Opting out of analytics does not affect your ability to use
            Wraps. Core functionality works without analytics enabled.
          </p>

          <h3>5.3 Access Your Data</h3>
          <p>
            You have the right to request a copy of your personal data. Contact
            us at{" "}
            <a className="text-primary" href="mailto:privacy@wraps.dev">
              privacy@wraps.dev
            </a>
            .
          </p>

          <h3>5.4 Delete Your Data</h3>
          <p>
            You can request deletion of your data at any time by contacting{" "}
            <a className="text-primary" href="mailto:privacy@wraps.dev">
              privacy@wraps.dev
            </a>
            . Note that:
          </p>
          <ul>
            <li>
              Platform data (contacts, audiences, templates, and the send
              ledger) is permanently deleted from our systems
            </li>
            <li>
              Telemetry data is anonymous and cannot be linked back to you
            </li>
            <li>
              Infrastructure in your AWS account is yours and unaffected by
              account deletion
            </li>
            <li>We may retain certain data for legal or security purposes</li>
          </ul>

          <h2>6. Children's Privacy</h2>

          <p>
            Wraps is not intended for users under the age of 13. We do not
            knowingly collect personal information from children. If you believe
            we have collected information from a child, please contact us
            immediately.
          </p>

          <h2>7. Security</h2>

          <p>We implement industry-standard security measures:</p>

          <ul>
            <li>
              <strong>HTTPS encryption:</strong> All data transmission is
              encrypted
            </li>
            <li>
              <strong>No stored credentials:</strong> We never store your AWS
              credentials
            </li>
            <li>
              <strong>Anonymization:</strong> Telemetry data is anonymous by
              design
            </li>
            <li>
              <strong>Access controls:</strong> Limited employee access to data
            </li>
            <li>
              <strong>Regular audits:</strong> Security reviews and updates
            </li>
          </ul>

          <p>
            However, no method of transmission over the internet is 100% secure.
            We cannot guarantee absolute security.
          </p>

          <h2>8. International Data Transfers</h2>

          <p>
            Your data may be processed in the United States or other countries
            where our service providers operate.
          </p>
          <p>
            This includes platform data and recipient engagement data (Sections
            1.4 and 1.5): if you send to recipients in the EEA, the UK, or
            Switzerland, their contact records, send history, and open/click
            metadata are transferred to and stored in the United States. If your
            use requires a Data Processing Agreement or Standard Contractual
            Clauses, contact{" "}
            <a className="text-primary" href="mailto:privacy@wraps.dev">
              privacy@wraps.dev
            </a>{" "}
            and we will work with you on the paperwork.
          </p>

          <h2>9. Changes to This Policy</h2>

          <p>
            We may update this Privacy Policy from time to time. We will notify
            you of material changes by:
          </p>

          <ul>
            <li>Posting the updated policy on this page</li>
            <li>Updating the "Last Updated" date</li>
            <li>
              Sending an email notification (if you have an account with us)
            </li>
          </ul>

          <p>Continued use of Wraps after changes constitutes acceptance.</p>

          <h2>10. Open Source</h2>

          <p>
            Wraps is open source software. The telemetry implementation is fully
            transparent and can be reviewed in our{" "}
            <a
              className="text-primary"
              href="https://github.com/wraps-team/wraps"
              rel="noopener noreferrer"
              target="_blank"
            >
              GitHub repository
            </a>
            . You can verify:
          </p>

          <ul>
            <li>What data is collected</li>
            <li>How it's anonymized</li>
            <li>Where it's sent</li>
            <li>How opt-out mechanisms work</li>
          </ul>

          <h2>11. Contact Us</h2>

          <p>
            If you have questions or concerns about this Privacy Policy, please
            contact us:
          </p>

          <ul className="list-none">
            <li>
              <strong>Company:</strong> FlatironKids LLC
            </li>
            <li>
              <strong>Email:</strong>{" "}
              <a className="text-primary" href="mailto:privacy@wraps.dev">
                privacy@wraps.dev
              </a>
            </li>
            <li>
              <strong>GitHub Issues:</strong>{" "}
              <a
                className="text-primary"
                href="https://github.com/wraps-team/wraps/issues"
                rel="noopener noreferrer"
                target="_blank"
              >
                github.com/wraps-team/wraps/issues
              </a>
            </li>
            <li>
              <strong>Website:</strong>{" "}
              <a
                className="text-primary"
                href="https://wraps.dev"
                rel="noopener noreferrer"
                target="_blank"
              >
                wraps.dev
              </a>
            </li>
          </ul>

          <hr className="my-8" />

          <p className="text-muted-foreground text-sm">
            This Privacy Policy is part of our commitment to transparency and
            user privacy. For more information about our telemetry
            implementation, see our{" "}
            <Link
              className="text-primary hover:underline"
              href="/docs/telemetry"
            >
              telemetry documentation
            </Link>
            .
          </p>
        </LegalArticle>
      </div>
      <LandingFooter />
    </div>
  );
}
