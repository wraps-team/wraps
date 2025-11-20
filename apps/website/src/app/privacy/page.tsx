import { Link } from "react-router-dom";

export default function PrivacyPolicy() {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-16">
      <div className="mb-8">
        <Link
          className="text-muted-foreground text-sm transition-colors hover:text-foreground"
          to="/"
        >
          ← Back to Home
        </Link>
      </div>

      <article className="prose prose-gray dark:prose-invert max-w-none">
        <h1>Privacy Policy</h1>
        <p className="text-muted-foreground">
          <strong>Last Updated:</strong>{" "}
          {new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>

        <p className="lead">
          At Wraps, we take your privacy seriously. This Privacy Policy explains
          how we collect, use, disclose, and safeguard your information when you
          use our CLI tool, SDK, and services.
        </p>

        <h2>1. Information We Collect</h2>

        <h3>1.1 Anonymous Telemetry Data (CLI)</h3>
        <p>
          When you use the Wraps CLI, we collect anonymous usage data to improve
          the product. This telemetry is <strong>opt-out</strong> and can be
          disabled at any time.
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

        <h3>1.2 Dashboard Usage Data</h3>
        <p>
          When you use the Wraps hosted dashboard (if applicable), we may
          collect:
        </p>
        <ul>
          <li>Email address (for authentication)</li>
          <li>Organization name</li>
          <li>AWS account connections (account IDs are hashed)</li>
          <li>Usage metrics and analytics</li>
          <li>Browser type and version</li>
          <li>Pages visited and features used</li>
        </ul>

        <h3>1.3 Infrastructure Metadata</h3>
        <p>
          Your infrastructure runs entirely in <strong>your AWS account</strong>
          . We do not have access to:
        </p>
        <ul>
          <li>Your AWS resources or data</li>
          <li>Emails sent through your SES</li>
          <li>Event data stored in your DynamoDB</li>
          <li>Any customer data</li>
        </ul>

        <p>
          All email sending, event tracking, and data storage occurs in your AWS
          account. We never see or store your data.
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
            <strong>PostHog</strong> - Anonymous analytics and telemetry
            processing
          </li>
          <li>
            <strong>Vercel</strong> - Website and API hosting
          </li>
          <li>
            <strong>AWS</strong> - Infrastructure deployment (in your account)
          </li>
          <li>
            <strong>Stripe</strong> - Payment processing (if applicable)
          </li>
        </ul>

        <p>
          These services have their own privacy policies and we ensure they meet
          appropriate privacy and security standards.
        </p>

        <h3>3.2 We DO NOT:</h3>
        <ul>
          <li>Sell your data to third parties</li>
          <li>Share your data for advertising purposes</li>
          <li>Use your data for purposes unrelated to Wraps</li>
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
            <strong>Account data:</strong> Retained while your account is active
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
          <Link className="text-primary hover:underline" to="/docs/telemetry">
            telemetry documentation
          </Link>{" "}
          for more details.
        </p>

        <h3>5.2 Access Your Data</h3>
        <p>
          You have the right to request a copy of your personal data. Contact us
          at{" "}
          <a className="text-primary" href="mailto:privacy@wraps.dev">
            privacy@wraps.dev
          </a>
          .
        </p>

        <h3>5.3 Delete Your Data</h3>
        <p>
          You can request deletion of your data at any time by contacting{" "}
          <a className="text-primary" href="mailto:privacy@wraps.dev">
            privacy@wraps.dev
          </a>
          . Note that:
        </p>
        <ul>
          <li>Telemetry data is anonymous and cannot be linked back to you</li>
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
          This Privacy Policy is part of our commitment to transparency and user
          privacy. For more information about our telemetry implementation, see
          our{" "}
          <Link className="text-primary hover:underline" to="/docs/telemetry">
            telemetry documentation
          </Link>
          .
        </p>
      </article>
    </div>
  );
}
