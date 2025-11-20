import { Link } from "react-router-dom";

export default function TermsOfService() {
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
        <h1>Terms of Service</h1>
        <p className="text-muted-foreground">
          <strong>Last Updated:</strong>{" "}
          {new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>

        <p className="lead">
          These Terms of Service ("Terms") govern your use of Wraps CLI tool,
          SDK, dashboard, and related services (collectively, the "Services").
          By using Wraps, you agree to these Terms.
        </p>

        <h2>1. Acceptance of Terms</h2>

        <p>
          By accessing or using Wraps, you agree to be bound by these Terms. If
          you do not agree to these Terms, you may not use the Services.
        </p>

        <p>
          If you are using Wraps on behalf of an organization, you represent and
          warrant that you have the authority to bind that organization to these
          Terms.
        </p>

        <h2>2. Description of Service</h2>

        <p>
          Wraps is a developer tool that deploys email and communication
          infrastructure to <strong>your AWS account</strong>. Key aspects:
        </p>

        <ul>
          <li>
            Infrastructure is deployed to <strong>your AWS account</strong>, not
            ours
          </li>
          <li>
            You maintain full control and ownership of your infrastructure
          </li>
          <li>
            You pay AWS directly for resource usage (we don't charge for
            infrastructure)
          </li>
          <li>
            We provide the CLI tool, SDK, dashboard, and developer experience
          </li>
          <li>All email sending and data storage occurs in your AWS account</li>
        </ul>

        <h2>3. Open Source License</h2>

        <p>
          Wraps uses an <strong>Open Core</strong> model:
        </p>

        <ul>
          <li>
            <strong>Core CLI and SDK:</strong> Licensed under AGPLv3 (open
            source)
          </li>
          <li>
            <strong>Dashboard and Enterprise Features:</strong> Source-available
            with proprietary license
          </li>
        </ul>

        <p>
          The AGPLv3 license applies to the core Wraps CLI and SDK. You may use,
          modify, and distribute the software under the terms of that license.
          See our{" "}
          <a
            className="text-primary"
            href="https://github.com/wraps-team/wraps/blob/main/LICENSE"
            rel="noopener noreferrer"
            target="_blank"
          >
            LICENSE file
          </a>{" "}
          for details.
        </p>

        <h2>4. AWS Account Requirements</h2>

        <h3>4.1 Your Responsibilities</h3>
        <p>To use Wraps, you must:</p>
        <ul>
          <li>Have a valid AWS account in good standing</li>
          <li>
            Provide valid AWS credentials with appropriate IAM permissions
          </li>
          <li>Accept responsibility for all AWS charges incurred</li>
          <li>Comply with AWS Acceptable Use Policy</li>
          <li>Ensure your AWS account is properly secured</li>
        </ul>

        <h3>4.2 AWS Charges</h3>
        <p>
          <strong>You are solely responsible for all AWS charges.</strong> This
          includes:
        </p>

        <ul>
          <li>AWS SES sending fees (~$0.10 per 1,000 emails)</li>
          <li>DynamoDB storage and read/write costs</li>
          <li>Lambda function execution costs</li>
          <li>EventBridge event processing costs</li>
          <li>SQS message processing costs</li>
          <li>Any other AWS services deployed by Wraps</li>
        </ul>

        <p>
          Wraps provides estimated costs during deployment, but actual costs may
          vary based on your usage. We are not responsible for AWS billing
          disputes or unexpected charges.
        </p>

        <h2>5. Acceptable Use Policy</h2>

        <h3>5.1 Permitted Use</h3>
        <p>You may use Wraps to:</p>
        <ul>
          <li>Send transactional emails (receipts, notifications, alerts)</li>
          <li>Send marketing emails (with proper consent)</li>
          <li>Build email infrastructure for your applications</li>
          <li>Deploy production email services</li>
        </ul>

        <h3>5.2 Prohibited Use</h3>
        <p>You may NOT use Wraps to:</p>
        <ul>
          <li>
            <strong>Send spam:</strong> Unsolicited bulk email or messages
          </li>
          <li>
            <strong>Phishing:</strong> Fraudulent emails designed to steal
            information
          </li>
          <li>
            <strong>Malware distribution:</strong> Emails containing viruses or
            malicious code
          </li>
          <li>
            <strong>Illegal content:</strong> Content that violates laws or
            regulations
          </li>
          <li>
            <strong>Harassment:</strong> Abusive or threatening communications
          </li>
          <li>
            <strong>Purchased lists:</strong> Sending to email lists you didn't
            build with consent
          </li>
          <li>
            <strong>Misleading headers:</strong> Falsified sender information
          </li>
        </ul>

        <p>
          Violation of this policy may result in suspension of your access to
          Wraps services and may violate AWS's Acceptable Use Policy.
        </p>

        <h2>6. Data Ownership and Privacy</h2>

        <h3>6.1 Your Data</h3>
        <p>You retain all rights to:</p>
        <ul>
          <li>Email content and templates</li>
          <li>Customer email addresses and data</li>
          <li>Event data stored in your DynamoDB tables</li>
          <li>All infrastructure deployed to your AWS account</li>
        </ul>

        <p>
          We do not have access to your AWS resources, email content, or
          customer data. Everything runs in your account.
        </p>

        <h3>6.2 Telemetry Data</h3>
        <p>
          We collect anonymous usage telemetry to improve Wraps. See our{" "}
          <Link className="text-primary hover:underline" to="/privacy">
            Privacy Policy
          </Link>{" "}
          for details on what we collect and how to opt out.
        </p>

        <h2>7. Intellectual Property</h2>

        <h3>7.1 Copyright</h3>
        <p>
          Wraps and its original content, features, and functionality are
          protected by United States and international copyright laws. All
          rights reserved except as expressly granted under open source
          licenses.
        </p>

        <h3>7.2 Open Source Components</h3>
        <p>
          The core Wraps CLI and SDK are licensed under AGPLv3. Modifications
          and derivatives must also be licensed under AGPLv3. See the{" "}
          <a
            className="text-primary"
            href="https://www.gnu.org/licenses/agpl-3.0.en.html"
            rel="noopener noreferrer"
            target="_blank"
          >
            AGPLv3 license
          </a>{" "}
          for details.
        </p>

        <h2>8. Warranties and Disclaimers</h2>

        <h3>8.1 No Warranty</h3>
        <p>
          WRAPS IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY
          KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:
        </p>

        <ul>
          <li>Warranties of merchantability</li>
          <li>Fitness for a particular purpose</li>
          <li>Non-infringement</li>
          <li>Uninterrupted or error-free operation</li>
          <li>Accuracy or reliability of results</li>
        </ul>

        <h3>8.2 AWS Services</h3>
        <p>
          Wraps relies on AWS services (SES, DynamoDB, Lambda, etc.). We are not
          responsible for:
        </p>

        <ul>
          <li>AWS service outages or degradation</li>
          <li>AWS pricing changes</li>
          <li>AWS policy changes</li>
          <li>AWS SES reputation or deliverability issues</li>
          <li>AWS account suspensions or limitations</li>
        </ul>

        <h3>8.3 Email Deliverability</h3>
        <p>
          We do not guarantee email deliverability. Factors affecting
          deliverability include:
        </p>

        <ul>
          <li>Your AWS SES reputation</li>
          <li>Recipient email server policies</li>
          <li>Email content and formatting</li>
          <li>DNS configuration (SPF, DKIM, DMARC)</li>
          <li>Recipient's spam filters</li>
        </ul>

        <h2>9. Limitation of Liability</h2>

        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, WRAPS SHALL NOT BE LIABLE FOR
          ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES,
          OR ANY LOSS OF PROFITS OR REVENUES, WHETHER INCURRED DIRECTLY OR
          INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE
          LOSSES, RESULTING FROM:
        </p>

        <ul>
          <li>Your use or inability to use the Services</li>
          <li>Unauthorized access to or alteration of your data</li>
          <li>
            Any conduct or content of any third party on or through the Services
          </li>
          <li>AWS service failures or outages</li>
          <li>Unexpected AWS charges</li>
          <li>Email delivery failures</li>
          <li>Data loss or corruption</li>
          <li>Infrastructure deployment errors</li>
        </ul>

        <p>
          IN NO EVENT SHALL WRAPS'S TOTAL LIABILITY EXCEED THE AMOUNT YOU PAID
          TO WRAPS IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO
          LIABILITY, OR ONE HUNDRED DOLLARS ($100), WHICHEVER IS GREATER.
        </p>

        <h2>10. Indemnification</h2>

        <p>
          You agree to indemnify, defend, and hold harmless Wraps and its
          officers, directors, employees, and agents from any claims, damages,
          losses, liabilities, and expenses (including attorneys' fees) arising
          from:
        </p>

        <ul>
          <li>Your use of the Services</li>
          <li>Your violation of these Terms</li>
          <li>Your violation of any law or regulation</li>
          <li>
            Your violation of any third-party rights (including email
            recipients)
          </li>
          <li>Content you send through your infrastructure</li>
          <li>AWS charges or billing disputes</li>
        </ul>

        <h2>11. Account Termination</h2>

        <h3>11.1 Termination by You</h3>
        <p>You may stop using Wraps at any time by:</p>
        <ul>
          <li>
            Running <code>wraps email destroy</code> to remove infrastructure
          </li>
          <li>Deleting your dashboard account (if applicable)</li>
          <li>Uninstalling the CLI</li>
        </ul>

        <p>
          Note: Infrastructure deployed to your AWS account will remain until
          you explicitly destroy it. You continue to be responsible for AWS
          charges until resources are deleted.
        </p>

        <h3>11.2 Termination by Wraps</h3>
        <p>
          We may suspend or terminate your access to Wraps services (dashboard,
          support, etc.) if:
        </p>

        <ul>
          <li>You violate these Terms</li>
          <li>You violate our Acceptable Use Policy</li>
          <li>We are required to do so by law</li>
          <li>Your use creates security or legal risks</li>
        </ul>

        <p>
          Note: We cannot delete infrastructure in your AWS account. You remain
          responsible for managing your own AWS resources.
        </p>

        <h2>12. Changes to Terms</h2>

        <p>
          We may update these Terms from time to time. We will notify you of
          material changes by:
        </p>

        <ul>
          <li>Posting the updated Terms on this page</li>
          <li>Updating the "Last Updated" date</li>
          <li>Sending an email notification (if you have an account)</li>
          <li>Displaying a notice in the CLI or dashboard</li>
        </ul>

        <p>
          Continued use of Wraps after changes constitutes acceptance of the new
          Terms.
        </p>

        <h2>13. Governing Law and Disputes</h2>

        <h3>13.1 Governing Law</h3>
        <p>
          These Terms shall be governed by and construed in accordance with the
          laws of the State of Colorado, United States, without regard to its
          conflict of law provisions.
        </p>

        <h3>13.2 Dispute Resolution</h3>
        <p>
          Any disputes arising from these Terms or your use of Wraps shall be
          resolved through:
        </p>

        <ol>
          <li>
            <strong>Informal Resolution:</strong> Contact us at{" "}
            <a className="text-primary" href="mailto:legal@wraps.dev">
              legal@wraps.dev
            </a>{" "}
            to attempt resolution
          </li>
          <li>
            <strong>Binding Arbitration:</strong> If informal resolution fails,
            disputes will be resolved through binding arbitration in the State
            of Colorado
          </li>
          <li>
            <strong>Class Action Waiver:</strong> You agree to resolve disputes
            individually and waive the right to participate in class actions
          </li>
        </ol>

        <h3>13.3 Exceptions</h3>
        <p>
          Either party may seek injunctive or other equitable relief in court to
          prevent actual or threatened infringement or misappropriation of
          intellectual property rights.
        </p>

        <h2>14. Severability</h2>

        <p>
          If any provision of these Terms is found to be invalid or
          unenforceable, the remaining provisions will continue in full force
          and effect.
        </p>

        <h2>15. Entire Agreement</h2>

        <p>
          These Terms, together with our{" "}
          <Link className="text-primary hover:underline" to="/privacy">
            Privacy Policy
          </Link>
          , constitute the entire agreement between you and Wraps regarding the
          Services.
        </p>

        <h2>16. Contact Information</h2>

        <p>
          If you have questions or concerns about these Terms, please contact
          us:
        </p>

        <ul className="list-none">
          <li>
            <strong>Email:</strong>{" "}
            <a className="text-primary" href="mailto:legal@wraps.dev">
              legal@wraps.dev
            </a>
          </li>
          <li>
            <strong>Support:</strong>{" "}
            <a className="text-primary" href="mailto:support@wraps.dev">
              support@wraps.dev
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
          By using Wraps, you acknowledge that you have read, understood, and
          agree to be bound by these Terms of Service. For information about how
          we handle your data, please review our{" "}
          <Link className="text-primary hover:underline" to="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </article>
    </div>
  );
}
