import type { Metadata } from "next";
import Link from "next/link";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { LegalArticle } from "@/components/legal-article";

const TITLE = "Data Processing Agreement";
const DESCRIPTION =
  "The Wraps Data Processing Agreement: roles, scope of processing, subprocessors, security measures, international transfers, breach notification, and deletion. Published in full, not gated behind a sales call.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
    url: "https://wraps.dev/dpa",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} | Wraps`,
    description: DESCRIPTION,
  },
  alternates: { canonical: "https://wraps.dev/dpa" },
};

const LAST_UPDATED = "August 28, 2026";

export default function DataProcessingAgreementPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <div className="container mx-auto max-w-4xl px-4 pt-24 pb-16">
        <LegalArticle>
          <h1>Data Processing Agreement</h1>
          <p>
            <strong>Last Updated:</strong> {LAST_UPDATED}
          </p>

          <p className="lead">
            This Data Processing Agreement ("DPA") forms part of the{" "}
            <Link href="/terms">Terms of Service</Link> between FlatironKids LLC
            ("Wraps", "we", "us") and the customer agreeing to those terms
            ("Customer", "you"). It governs our processing of Personal Data on
            your behalf.
          </p>

          <p>
            These are our standard terms and they apply automatically — you do
            not need to sign anything to rely on them. If your procurement
            process requires a countersigned copy, or your own paper, email{" "}
            <a href="mailto:privacy@wraps.dev">privacy@wraps.dev</a>.
          </p>

          <h2>1. Definitions</h2>

          <p>
            "Personal Data", "Controller", "Processor", "Data Subject",
            "Processing", and "Personal Data Breach" have the meanings given in
            the General Data Protection Regulation (EU) 2016/679 ("GDPR").
            "Applicable Data Protection Law" means the GDPR, the UK GDPR, the
            Swiss FADP, and the California Consumer Privacy Act as amended by
            the CPRA, in each case to the extent it applies to the Processing.
          </p>

          <p>
            "Customer Personal Data" means Personal Data that Wraps Processes on
            your behalf in providing the Services.
          </p>

          <h2>2. Roles of the parties</h2>

          <p>
            You are the Controller of Customer Personal Data. Wraps is the
            Processor, and Processes Customer Personal Data only on your
            documented instructions. Your use of the Services, including
            configuration you perform in the dashboard, CLI, or API, constitutes
            those instructions.
          </p>

          <p>
            Wraps is an independent Controller for a limited set of data it
            determines the purposes of: account and billing records, anonymous
            CLI telemetry, and website analytics. That Processing is described
            in the <Link href="/privacy">Privacy Policy</Link> and is outside
            the scope of this DPA.
          </p>

          <h3>2.1 The sending path is not within scope</h3>

          <p>
            Wraps deploys infrastructure into <em>your</em> AWS account. The
            emails you send, their content, their recipients, and the raw
            delivery events they generate are Processed by Amazon Web Services
            within your own AWS account, under your own agreement with AWS. For
            that Processing, AWS is your Processor and Wraps is not in the chain
            at all. This DPA covers only Customer Personal Data that reaches the
            Wraps platform layer.
          </p>

          <h2>3. Scope of processing</h2>

          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Subject matter</td>
                <td>
                  Provision of the Wraps email and messaging platform, as
                  described in the Terms of Service
                </td>
              </tr>
              <tr>
                <td>Duration</td>
                <td>
                  The term of your subscription, plus the deletion period in
                  section 9
                </td>
              </tr>
              <tr>
                <td>Nature and purpose</td>
                <td>
                  Storing and organising contacts and audiences; rendering and
                  storing templates; executing workflows and broadcasts;
                  recording a send ledger; producing delivery and engagement
                  analytics
                </td>
              </tr>
              <tr>
                <td>Categories of Data Subject</td>
                <td>
                  Your end users and email recipients; your own personnel who
                  hold Wraps accounts
                </td>
              </tr>
              <tr>
                <td>Categories of Personal Data</td>
                <td>
                  Email addresses; contact attributes you choose to store;
                  consent and suppression state; message-level send history;
                  engagement metadata (open and click events, including the user
                  agent AWS attaches to them); account names and email addresses
                </td>
              </tr>
              <tr>
                <td>Special category data</td>
                <td>
                  Not contemplated. Do not submit special category data, or
                  protected health information, to the Services
                </td>
              </tr>
            </tbody>
          </table>

          <h2>4. Wraps obligations</h2>

          <p>Wraps will:</p>

          <ul>
            <li>
              Process Customer Personal Data only on your documented
              instructions, including regarding international transfers, unless
              required to do otherwise by law — in which case we will inform you
              first, unless that law prohibits it
            </li>
            <li>
              Ensure that personnel authorised to Process Customer Personal Data
              are bound by an obligation of confidentiality
            </li>
            <li>
              Implement the technical and organisational measures described in
              section 5
            </li>
            <li>
              Respect the conditions in section 6 for engaging another Processor
            </li>
            <li>
              Assist you, insofar as reasonably possible, in responding to Data
              Subject requests under Chapter III of the GDPR
            </li>
            <li>
              Assist you with data protection impact assessments and prior
              consultations, taking into account the nature of Processing and
              the information available to us
            </li>
            <li>
              Delete or return Customer Personal Data as described in section 9
            </li>
            <li>
              Make available the information necessary to demonstrate compliance
              with this DPA, as described in section 8
            </li>
          </ul>

          <p>
            Wraps does not sell or share Personal Data as those terms are
            defined under the CCPA/CPRA, does not retain, use, or disclose
            Customer Personal Data for any purpose other than performing the
            Services, and does not combine Customer Personal Data with data from
            other customers or other sources.
          </p>

          <h2>5. Security measures</h2>

          <p>
            Wraps maintains technical and organisational measures appropriate to
            the risk, including:
          </p>

          <ul>
            <li>
              <strong>Encryption in transit.</strong> HTTPS/TLS on all external
              connections
            </li>
            <li>
              <strong>No stored cloud credentials.</strong> Access to your AWS
              account is via a cross-account IAM role you create, restricted by
              an <code>sts:ExternalId</code> condition and exercised only
              through short-lived STS credentials. We never store your AWS
              access keys
            </li>
            <li>
              <strong>Least privilege.</strong> The role's data-plane
              permissions are scoped by ARN to resources Wraps deployed
            </li>
            <li>
              <strong>Tenant isolation.</strong> Platform data is scoped by
              organization at the query layer, enforced in code and verified by
              automated tests
            </li>
            <li>
              <strong>Access control.</strong> Production access is limited to
              personnel who require it. The Services support SSO and SCIM
              provisioning
            </li>
            <li>
              <strong>Auditability.</strong> The Wraps codebase, including every
              IAM policy it generates, is published under AGPLv3 and can be
              reviewed by you
            </li>
          </ul>

          <p>
            A fuller description is at <Link href="/security">/security</Link>,
            which also states plainly which certifications Wraps does and does
            not currently hold.
          </p>

          <h2>6. Subprocessors</h2>

          <p>
            You give general authorisation for Wraps to engage Subprocessors.
            The current list is published at{" "}
            <Link href="/subprocessors">/subprocessors</Link> and forms part of
            this DPA.
          </p>

          <p>
            Before engaging a new Subprocessor that Processes Customer Personal
            Data, Wraps will update that page and give at least 30 days' notice
            by email to customers who have subscribed to subprocessor notices.
            You may object on reasonable data-protection grounds within that
            period; if we cannot accommodate the objection, you may terminate
            the affected Services without penalty and receive a pro-rata refund
            of prepaid fees.
          </p>

          <p>
            Wraps imposes data protection obligations on each Subprocessor no
            less protective than those in this DPA, and remains fully liable to
            you for a Subprocessor's performance.
          </p>

          <h2>7. International transfers</h2>

          <p>
            Wraps and all of its Subprocessors Process Customer Personal Data in
            the United States. Where Customer Personal Data originating in the
            EEA, the United Kingdom, or Switzerland is transferred to Wraps, the
            transfer is made pursuant to the Standard Contractual Clauses
            approved by the European Commission in Implementing Decision (EU)
            2021/914, Module Two (Controller to Processor), which are
            incorporated into this DPA by reference and completed as follows:
          </p>

          <ul>
            <li>
              <strong>Clause 7 (docking):</strong> applies
            </li>
            <li>
              <strong>Clause 9 (subprocessors):</strong> Option 2, general
              written authorisation, with the 30-day notice period in section 6
            </li>
            <li>
              <strong>Clause 11 (redress):</strong> the optional independent
              dispute resolution paragraph does not apply
            </li>
            <li>
              <strong>Clause 17 (governing law):</strong> the law of Ireland
            </li>
            <li>
              <strong>Clause 18 (forum):</strong> the courts of Ireland
            </li>
            <li>
              <strong>Annexes I, II and III:</strong> populated by sections 3, 5
              and 6 of this DPA respectively
            </li>
          </ul>

          <p>
            For UK transfers, the International Data Transfer Addendum issued by
            the ICO applies to the Standard Contractual Clauses above. For Swiss
            transfers, references to the GDPR are read as references to the FADP
            and the competent authority is the FDPIC.
          </p>

          <h2>8. Audits</h2>

          <p>
            Wraps will make available the information reasonably necessary to
            demonstrate compliance with this DPA, and will respond to a
            reasonable security questionnaire no more than once in any twelve
            month period.
          </p>

          <p>
            Wraps does not currently hold a SOC 2 or ISO 27001 report. In place
            of an audit report, the entire Wraps codebase — including the IAM
            policies it generates and the telemetry it collects — is published
            under AGPLv3 and may be inspected by you or your auditors at any
            time without notice to us.
          </p>

          <p>
            Where Applicable Data Protection Law grants you an on-site audit
            right that the above does not satisfy, we will cooperate in good
            faith to agree a scope, on reasonable notice, at your cost, and no
            more than once a year absent a Personal Data Breach.
          </p>

          <h2>9. Deletion and return</h2>

          <p>
            You may export or delete Customer Personal Data at any time through
            the Services. On termination, Wraps will delete Customer Personal
            Data from the platform database within 30 days, except where
            retention is required by law.
          </p>

          <p>
            Infrastructure and data in your own AWS account — including SES
            configuration, DynamoDB event history, and any archived messages —
            are unaffected by termination and remain entirely yours. Wraps has
            no ability to delete them once the cross-account role is removed.
          </p>

          <p>
            Backups are retained on our providers' standard cycles and expire on
            their own; Customer Personal Data in a backup remains subject to
            this DPA until it does.
          </p>

          <h2>10. Personal data breach</h2>

          <p>
            Wraps will notify you without undue delay, and in any event within
            72 hours, after becoming aware of a Personal Data Breach affecting
            Customer Personal Data. The notice will describe the nature of the
            breach, the categories and approximate volume of data and Data
            Subjects concerned, the likely consequences, and the measures taken
            or proposed — to the extent known at the time, with further detail
            provided as it becomes available.
          </p>

          <p>Notification is not an acknowledgement of fault or liability.</p>

          <h2>11. Data subject requests</h2>

          <p>
            The Services let you access, correct, export, and delete contact
            records directly. Where you cannot fulfil a Data Subject request
            yourself, email{" "}
            <a href="mailto:privacy@wraps.dev">privacy@wraps.dev</a> and we will
            assist within a reasonable period.
          </p>

          <p>
            If a Data Subject contacts Wraps directly regarding data we Process
            on your behalf, we will refer them to you and will not respond
            substantively unless you instruct us to or the law requires it.
          </p>

          <h2>12. Order of precedence</h2>

          <p>
            In the event of a conflict, the Standard Contractual Clauses prevail
            over this DPA, and this DPA prevails over the Terms of Service, in
            each case only as to the subject matter of Processing Personal Data.
          </p>

          <h2>13. Changes</h2>

          <p>
            We may update this DPA to reflect changes in law, the Services, or
            our Subprocessors. Material changes that reduce your protections
            will be notified by email at least 30 days in advance. The current
            version always lives at this URL.
          </p>

          <h2>Contact</h2>

          <p>
            FlatironKids LLC, Colorado, United States.
            <br />
            Data protection enquiries:{" "}
            <a href="mailto:privacy@wraps.dev">privacy@wraps.dev</a>
            <br />
            Security enquiries:{" "}
            <a href="mailto:security@wraps.dev">security@wraps.dev</a>
            <br />
            Legal: <a href="mailto:legal@wraps.dev">legal@wraps.dev</a>
          </p>
        </LegalArticle>
      </div>

      <LandingFooter />
    </div>
  );
}
