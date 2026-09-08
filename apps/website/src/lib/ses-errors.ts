/**
 * The public SES error reference, one entry per page under /ses/errors.
 *
 * Remediation text is adapted from the CLI's own error catalog
 * (packages/cli/src/utils/shared/errors.ts) rather than written from general
 * knowledge: every entry names the WrapsError code the CLI raises for that AWS
 * exception, and src/__tests__/ses-errors.test.ts fails if that code no longer
 * exists in packages/cli/src. Editing this file without checking the CLI is how
 * these pages drift into inventing fixes.
 *
 * `awsDocsUrl` is the AWS page for the failure. Where the CLI factory points at
 * wraps.dev instead (because the CLI is talking to someone mid-command), that
 * link is kept separately as `wrapsDocsUrl`.
 */

export type SesErrorCategory =
  | "identity"
  | "throughput"
  | "account-state"
  | "credentials";

export type SesErrorFix = {
  heading: string;
  body: string;
  code?: string;
  codeLanguage?: string;
};

export type SesErrorFaq = {
  question: string;
  answer: string;
};

export type SesError = {
  /** URL segment under /ses/errors. */
  slug: string;
  /** The exception name AWS returns, matching a `case` in isAWSError. */
  awsExceptionName: string;
  /** SMTP reply code, only where the SES SMTP interface emits one. */
  smtpCode?: string;
  /** Page H1 and metadata title. */
  title: string;
  /** The string AWS returns, verbatim. */
  literalMessage: string;
  /** The WrapsError code the CLI raises for this exception. */
  wrapsErrorCode: string;
  category: SesErrorCategory;
  /** Metadata description. */
  description: string;
  /** One paragraph under "Why this happens". */
  whyItHappens: string;
  /** Adapted from the WrapsError `suggestion` argument. */
  causes: string[];
  fixes: SesErrorFix[];
  prevention: { heading: string; body: string }[];
  /** What Wraps does about this specific error. Honest, no hard sell. */
  wrapsNote: string;
  faqs: SesErrorFaq[];
  /** AWS documentation for this failure. */
  awsDocsUrl: string;
  /** The wraps.dev page the CLI links to, where it links to one. */
  wrapsDocsUrl?: string;
};

export const SES_ERRORS: readonly SesError[] = [
  {
    slug: "email-address-not-verified",
    awsExceptionName: "MessageRejected",
    smtpCode: "554",
    title: 'Amazon SES "Email address is not verified": Causes and Fix',
    literalMessage:
      "Email address is not verified. The following identities failed the check in region US-EAST-1: sender@example.com",
    wrapsErrorCode: "SES_MESSAGE_REJECTED",
    category: "identity",
    description:
      "Why SES returns MessageRejected with “Email address is not verified”, how to tell a sandbox account from an unverified identity, and the fix for each.",
    whyItHappens:
      "The request reached SES and SES refused it. Nothing is wrong with your credentials, your IAM policy, or your network. SES checked the identity on the request against the identities verified in that region and did not find a match it was willing to send from or to.",
    causes: [
      "The account is in the SES sandbox and the recipient is not a verified address.",
      "The sender identity, domain or email, is not verified for sending.",
      "The sender domain is verified for receiving but not for sending.",
    ],
    fixes: [
      {
        heading: "Read the region out of the message",
        body: "The identity list in the error names the region SES checked. SES identities are per region, so a domain verified in us-east-1 is unverified in eu-west-1. If the region in the message is not the one you meant to send from, that is the whole bug.",
      },
      {
        heading: "Check whether the account is still in the sandbox",
        body: "A sandboxed account can only send to addresses and domains it has verified. If the failing identity in the message is the recipient rather than the sender, that is the sandbox.",
        code: "wraps email status\nwraps email doctor",
        codeLanguage: "bash",
      },
      {
        heading: "Verify the sender identity for sending",
        body: "A domain added to SES for receiving mail is not automatically usable as a From address. Verify the identity you send from, and confirm its DKIM records are published and reported by SES as verified.",
        code: "wraps email verify",
        codeLanguage: "bash",
      },
      {
        heading: "Request production access to leave the sandbox",
        body: "Production access is an AWS decision and an AWS form. Approval times vary and requests do get denied, so leave room for it in a launch schedule rather than treating it as a formality.",
      },
    ],
    prevention: [
      {
        heading: "Send a probe before you send traffic",
        body: "Run an identity check as a deploy step rather than discovering the gap from a failed production send. Both the sandbox state and the verification state are readable before anything is queued.",
      },
      {
        heading: "Pin the region everywhere",
        body: "Most repeat occurrences are a region mismatch between the deploy and the send, not a verification that was never done. Set the region explicitly in both places.",
      },
    ],
    wrapsNote:
      "The Wraps CLI maps this exception to SES_MESSAGE_REJECTED and prints the three causes above instead of the raw string, so you do not have to guess which one you hit. `wraps email doctor` reads the identity and sandbox state before a send, which is where this failure is cheapest to find. Wraps cannot get you out of the sandbox. Production access is AWS's call.",
    faqs: [
      {
        question:
          "Why does SES say the address is not verified when I verified it?",
        answer:
          "Almost always a region mismatch. SES identities are scoped to a region, and the error names the region SES actually checked. Verify the identity in the region you send from, or send from the region where it is verified.",
      },
      {
        question:
          "Do I need to verify the recipient as well as the sender in SES?",
        answer:
          "Only while the account is in the SES sandbox. A sandboxed account can send only to verified addresses and domains. Once AWS grants production access, only the sender identity has to be verified.",
      },
      {
        question:
          "My domain is verified for receiving mail but sends still fail. Why?",
        answer:
          "Verification for receiving does not imply verification for sending. The sending path also needs DKIM published and reported as verified for that identity in that region.",
      },
      {
        question: "What SMTP code does this error use?",
        answer:
          "The SES SMTP interface returns 554 for a rejected message, carrying the same text the API returns as MessageRejected.",
      },
    ],
    awsDocsUrl:
      "https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html",
    wrapsDocsUrl: "https://wraps.dev/docs/guides/aws-setup/troubleshooting",
  },
  {
    slug: "maximum-sending-rate-exceeded",
    awsExceptionName: "Throttling",
    smtpCode: "454",
    title: 'Amazon SES "Maximum sending rate exceeded": Causes and Fix',
    literalMessage: "Throttling: Maximum sending rate exceeded",
    wrapsErrorCode: "AWS_THROTTLED",
    category: "throughput",
    description:
      "Why SES throttles a send with “Maximum sending rate exceeded”, how the per-second rate differs from the daily quota, and how to retry without making it worse.",
    whyItHappens:
      "SES enforces a maximum send rate per second on every account. Going over it does not queue the message, it rejects it. The same handling covers ThrottlingException and TooManyRequestsException from other AWS APIs in the same call path, so the throttled operation is not always SendEmail.",
    causes: [
      "The account went over its per-second SES send rate.",
      "A burst of parallel senders shared one account quota without coordinating.",
      "A non-send SES or AWS API in the same code path was rate limited.",
    ],
    fixes: [
      {
        heading: "Retry with exponential backoff and jitter",
        body: "This error is retryable and often transient. Back off, add jitter so a fleet of workers does not retry in lockstep, and cap the number of attempts so a genuinely saturated account fails loudly instead of spinning.",
      },
      {
        heading: "Check the rate you are actually allowed",
        body: "Read the account's current send rate rather than assuming it. New production accounts start low and AWS raises the limit as sending reputation builds.",
        code: "aws sesv2 get-account --query 'SendQuota'",
        codeLanguage: "bash",
      },
      {
        heading: "Bound your own concurrency below the SES rate",
        body: "One sender respecting the limit and ten senders each respecting it are different things. Put the rate limit in front of the pool, not inside each worker.",
      },
      {
        heading: "Request a quota increase if it is persistent",
        body: "If backoff is not enough at steady state, the limit is the problem rather than the burst. Raise it through Service Quotas in the AWS console.",
      },
    ],
    prevention: [
      {
        heading: "Treat the rate as a shared budget",
        body: "The quota belongs to the AWS account, not to a process. Anything else sending through the same account, including other applications, is spending from the same budget.",
      },
      {
        heading: "Alarm on throttles, not just on failures",
        body: "A throttled send that a retry rescued still tells you the account is near its ceiling. That signal arrives well before the first send you actually lose.",
      },
    ],
    wrapsNote:
      "The Wraps CLI maps Throttling, ThrottlingException and TooManyRequestsException to AWS_THROTTLED and says plainly that AWS is rate limiting the API rather than blaming credentials. Wraps cannot raise your SES send rate. That number is AWS's, adjusted on your sending reputation or by a quota request.",
    faqs: [
      {
        question:
          "Is “Maximum sending rate exceeded” the same as the daily quota?",
        answer:
          "No. The rate is per second and the quota is per 24 hours. Both surface as throttling, but backoff fixes the rate limit and only waiting or a quota increase fixes the daily one.",
      },
      {
        question: "Should I retry a throttled SES send?",
        answer:
          "Yes, with exponential backoff and jitter. Retrying immediately in a tight loop makes the throttle worse and burns the rest of your budget on rejections.",
      },
      {
        question: "Why do I get throttled below my stated send rate?",
        answer:
          "The rate is per account, not per process. Parallel workers, background jobs and any other application on the same AWS account draw from the same per-second budget.",
      },
      {
        question: "What SMTP code does SES use for throttling?",
        answer:
          "The SES SMTP interface returns 454 for a throttling failure, with the same text the API returns under the Throttling code.",
      },
    ],
    awsDocsUrl:
      "https://docs.aws.amazon.com/general/latest/gr/api-retries.html",
  },
  {
    slug: "daily-sending-quota-exceeded",
    awsExceptionName: "LimitExceededException",
    smtpCode: "454",
    title: 'Amazon SES "Daily message quota exceeded": Causes and Fix',
    literalMessage: "Daily message quota exceeded",
    wrapsErrorCode: "AWS_LIMIT_EXCEEDED",
    category: "throughput",
    description:
      "Why SES stops accepting mail once the 24-hour sending quota is spent, how it differs from per-second throttling, and how to get the quota raised.",
    whyItHappens:
      "SES caps how many messages an account may send in any rolling 24-hour window. Once that budget is spent, further sends are refused until the window rolls forward. The AWS SDK surfaces the quota family of failures as LimitExceededException or ServiceQuotaExceededException depending on the API, and both mean you have hit a service quota rather than done anything wrong.",
    causes: [
      "The account spent its 24-hour SES sending quota.",
      "A quota on another AWS API in the same path was reached, not the send quota itself.",
      "A backfill, migration or retry storm consumed the day's budget in minutes.",
    ],
    fixes: [
      {
        heading: "Confirm which quota you hit",
        body: "Read the account's sent count against its 24-hour maximum before assuming it is the send quota. The same exception family covers quotas on other SES APIs.",
        code: "aws sesv2 get-account --query 'SendQuota'",
        codeLanguage: "bash",
      },
      {
        heading: "Request an increase in Service Quotas",
        body: "Go to Service Quotas in the AWS console, pick the service, and raise the specific limit. AWS also raises SES quotas on its own as consistent, healthy sending builds reputation.",
      },
      {
        heading: "Spread scheduled work across the window",
        body: "A quota is a rate over 24 hours, not a nightly allowance. Pacing a large broadcast across the window keeps transactional mail from being starved by a campaign.",
      },
      {
        heading: "Give transactional mail its own headroom",
        body: "If password resets and receipts share an account with bulk sending, reserve capacity for them explicitly. Otherwise the campaign decides whether your users can log in.",
      },
    ],
    prevention: [
      {
        heading: "Watch the burn rate, not the ceiling",
        body: "Hitting the quota is the last event in a sequence you could have seen coming. Alert on the fraction of the daily budget spent by a given hour.",
      },
      {
        heading: "Keep retries from spending the budget",
        body: "A retry loop with no cap can consume a day's quota against addresses that were never going to accept the mail. Cap attempts and suppress hard bounces.",
      },
    ],
    wrapsNote:
      "The Wraps CLI maps LimitExceededException and ServiceQuotaExceededException to AWS_LIMIT_EXCEEDED and points at Service Quotas rather than guessing. Wraps cannot increase an AWS quota on your behalf. What it can do is show your current limits and sending volume in one place, so the ceiling is visible before you reach it.",
    faqs: [
      {
        question: "How do I raise the SES daily sending quota?",
        answer:
          "Request an increase through Service Quotas in the AWS console. AWS also raises SES quotas over time when sending stays consistent and bounce and complaint rates stay low.",
      },
      {
        question: "Does the SES daily quota reset at midnight?",
        answer:
          "No. It is a rolling 24-hour window, so capacity comes back gradually as older sends age out rather than all at once at a fixed hour.",
      },
      {
        question:
          "What is the difference between the daily quota and the sending rate?",
        answer:
          "The daily quota is the total number of messages allowed in 24 hours. The sending rate is how many are allowed per second. You can be well inside the daily quota and still be throttled on rate.",
      },
      {
        question: "Which exception does the AWS SDK throw for a quota?",
        answer:
          "Either LimitExceededException or ServiceQuotaExceededException, depending on the API. Both mean a service quota, not a credential or permission problem.",
      },
    ],
    awsDocsUrl:
      "https://docs.aws.amazon.com/general/latest/gr/aws_service_limits.html",
  },
  {
    slug: "account-sending-paused",
    awsExceptionName: "AccountSendingPausedException",
    title: 'Amazon SES "Account-level sending is paused": Causes and Fix',
    literalMessage:
      "Email sending is disabled for your entire Amazon SES account.",
    wrapsErrorCode: "SES_ACCOUNT_SENDING_PAUSED",
    category: "account-state",
    description:
      "Why AWS pauses SES sending for an entire account, what the Reputation Dashboard shows, and what has to change before sending resumes.",
    whyItHappens:
      "AWS has switched off sending for the whole account. This is not a quota and not a transient failure. It is an account-state decision AWS made, usually because bounce or complaint rates crossed the threshold AWS enforces across every SES user, or because a review is open on the account.",
    causes: [
      "A high bounce or complaint rate.",
      "An AWS-initiated review of the account.",
    ],
    fixes: [
      {
        heading: "Open the Reputation Dashboard first",
        body: "The SES console's Reputation Dashboard says which metric triggered the pause and where it currently sits. Everything else is guesswork until you have read it.",
      },
      {
        heading: "Stop sending to the addresses that caused it",
        body: "Suppress every hard bounce and every complaint before asking for the pause to be lifted. Resuming into the same list reproduces the pause and makes the next conversation with AWS harder.",
      },
      {
        heading: "Fix the acquisition path, not just the list",
        body: "A bounce rate above the threshold usually means addresses are entering the list without confirmation. Double opt-in and dropping purchased or scraped segments address the cause. Deleting the bad rows only addresses the symptom.",
      },
      {
        heading: "Reply to AWS with what changed",
        body: "AWS reinstates on evidence. Say where the bad addresses came from, what you removed, and what now prevents it, rather than asking for the pause to be lifted.",
      },
    ],
    prevention: [
      {
        heading: "Watch bounce and complaint rates weekly",
        body: "AWS enforces roughly 5 percent for bounces and 0.1 percent for complaints across all SES accounts. Those are numbers to keep on a dashboard, not to look up after a pause.",
      },
      {
        heading: "Suppress automatically, not manually",
        body: "A bounce or complaint that does not immediately remove the address will be sent to again. Wire suppression into the send path so it cannot be skipped.",
      },
    ],
    wrapsNote:
      "The Wraps CLI maps this exception to SES_ACCOUNT_SENDING_PAUSED and sends you to the Reputation Dashboard rather than to a retry. Wraps tracks bounce and complaint rates and suppresses addresses that bounce or complain, which is the part you control. It cannot override an AWS pause. If AWS shuts off your SES, sending stops until AWS reinstates it.",
    faqs: [
      {
        question: "How long does an SES account-level sending pause last?",
        answer:
          "Until AWS lifts it. There is no timer. AWS reinstates once the underlying bounce or complaint problem is resolved and you have told them what changed.",
      },
      {
        question:
          "What bounce and complaint rates does AWS enforce on SES accounts?",
        answer:
          "Two levels, not one. A bounce rate of 5 percent or a complaint rate of 0.1 percent places the account under review, and sending continues during that review. AWS says it might pause sending at 10 percent bounces or 0.5 percent complaints. Aim below 2 percent and 0.1 percent respectively.",
      },
      {
        question: "Can I send from a different AWS account while paused?",
        answer:
          "Technically yes, and it is a bad idea. Moving bad list hygiene to a fresh account reproduces the problem there and reads to AWS as evasion.",
      },
      {
        question: "Does a paused account still accept API calls?",
        answer:
          "The API answers and the send is refused with AccountSendingPausedException. Retrying does not help, because nothing about the request is wrong.",
      },
    ],
    awsDocsUrl:
      "https://docs.aws.amazon.com/ses/latest/dg/reputationdashboard.html",
  },
  {
    slug: "configuration-set-does-not-exist",
    awsExceptionName: "ConfigurationSetDoesNotExistException",
    title: 'Amazon SES "Configuration set does not exist": Causes and Fix',
    literalMessage: "Configuration set <ConfigurationSetName> does not exist.",
    wrapsErrorCode: "SES_CONFIG_SET_MISSING",
    category: "identity",
    description:
      "Why SES rejects a send with ConfigurationSetDoesNotExistException, why the region is usually the cause, and the three ways to fix it.",
    whyItHappens:
      "The send named a configuration set that SES cannot find in the region the request went to. Configuration sets are regional resources, so one created in us-east-1 does not exist in eu-west-1 even though the name is identical.",
    causes: [
      "The configuration set does not exist in the region the request was sent to.",
      "The name in the request does not match the name in SES, including case.",
      "The configuration set was deleted, or was never created in this account.",
    ],
    fixes: [
      {
        heading: "List the configuration sets in the sending region",
        body: "Confirm what actually exists where you are sending from before changing the code. The list is the fastest way to tell a wrong name from a wrong region.",
        code: "aws sesv2 list-configuration-sets --region us-east-1",
        codeLanguage: "bash",
      },
      {
        heading: "Create it, switch regions, or drop the parameter",
        body: "Three fixes, in order of how much you care about event tracking: create the configuration set in this region, point the send at the region where it already exists, or remove ConfigurationSetName from the request and lose the event stream it feeds.",
      },
      {
        heading: "Check for a default configuration set on the identity",
        body: "If you did not set ConfigurationSetName yourself, an identity-level default may be supplying it. That default can outlive the configuration set it names.",
      },
    ],
    prevention: [
      {
        heading: "Deploy the configuration set with the code that uses it",
        body: "A configuration set created by hand in the console and referenced from application code will eventually diverge. Create it as infrastructure alongside the sender.",
      },
      {
        heading: "Make the region one value",
        body: "Nearly every occurrence is one region in the deploy and another in the send. Read both from the same configuration value.",
      },
    ],
    wrapsNote:
      "Wraps deploys the configuration set as part of the email stack, in the region it deploys into, so the name in the send and the resource in SES come from the same place. The CLI maps this exception to SES_CONFIG_SET_MISSING and names the three fixes above. A configuration set you created by hand is still yours to reconcile.",
    faqs: [
      {
        question: "Are SES configuration sets regional?",
        answer:
          "Yes. A configuration set exists in one region only. The same name in another region is a different, and possibly missing, resource.",
      },
      {
        question: "Can I send without a configuration set?",
        answer:
          "Yes. Remove ConfigurationSetName from the request and the send goes through. You lose the event publishing that configuration set was feeding, which is usually why it was there.",
      },
      {
        question:
          "Why does SES say the configuration set is missing when I can see it in the console?",
        answer:
          "Check the region selector in the console against the region your SDK client is configured for. Seeing it in one region says nothing about the other.",
      },
      {
        question: "Does deleting a configuration set break existing sends?",
        answer:
          "Yes, immediately, for any send that names it, including sends that inherit it as an identity-level default rather than passing it explicitly.",
      },
    ],
    awsDocsUrl:
      "https://docs.aws.amazon.com/ses/latest/dg/using-configuration-sets.html",
  },
  {
    slug: "configuration-set-sending-paused",
    awsExceptionName: "ConfigurationSetSendingPausedException",
    title: 'Amazon SES "Configuration set sending is paused": Causes and Fix',
    literalMessage:
      "Email sending is disabled for the configuration set <ConfigurationSetName>.",
    wrapsErrorCode: "SES_CONFIG_SET_SENDING_PAUSED",
    category: "account-state",
    description:
      "Why SES pauses sending for one configuration set while the rest of the account keeps sending, and how to resume it.",
    whyItHappens:
      "Sending is paused for the specific configuration set this send named, not for the account. That is the useful part. It means the rest of the account is still sending, and the pause is scoped to whatever traffic routes through this configuration set.",
    causes: [
      "Sending was disabled on the configuration set, by you or by an automation.",
      "A reputation option on the configuration set paused it automatically when its own bounce or complaint rate crossed a threshold.",
    ],
    fixes: [
      {
        heading: "Confirm the scope before you change anything",
        body: "Read the configuration set's sending status and the account's separately. A paused configuration set and a paused account need different responses, and the exception name tells you which one you have.",
        code: "aws sesv2 get-configuration-set --configuration-set-name <name>",
        codeLanguage: "bash",
      },
      {
        heading: "Resume it in the SES console",
        body: "Under Configuration Sets, re-enable sending for the set. Do this after you know why it paused, not before.",
      },
      {
        heading: "Or send without the paused configuration set",
        body: "Removing ConfigurationSetName from the request gets the mail out. It also removes the event publishing that set was feeding, so treat it as a stopgap rather than the fix.",
      },
      {
        heading: "Check the automatic pause option",
        body: "A configuration set can be configured to pause itself on reputation metrics. If that is what fired, resuming without addressing the metric just pauses it again.",
      },
    ],
    prevention: [
      {
        heading: "Separate traffic types by configuration set",
        body: "Putting campaigns and transactional mail on different configuration sets means a reputation problem in one does not stop the other. That separation is what makes a scoped pause survivable.",
      },
      {
        heading: "Alert on the configuration set, not only the account",
        body: "Account-level dashboards average over everything. A single configuration set can be in trouble for a while before it shows up in the account number.",
      },
    ],
    wrapsNote:
      "The Wraps CLI maps this exception to SES_CONFIG_SET_SENDING_PAUSED and keeps it distinct from the account-level pause, which is the distinction that decides what you do next. Resuming the configuration set is a change in your AWS account and stays yours to make.",
    faqs: [
      {
        question:
          "Is a paused configuration set the same as a paused SES account?",
        answer:
          "No. A configuration set pause stops only sends that name that set. An account pause stops everything. AWS uses different exceptions for the two so you can tell them apart in code.",
      },
      {
        question: "How do I resume sending for an SES configuration set?",
        answer:
          "Re-enable sending for the set in the SES console under Configuration Sets. Find out why it paused first, especially if it paused itself on reputation metrics.",
      },
      {
        question: "Can I just remove the configuration set from the send?",
        answer:
          "It will deliver the message, and it will also stop the event publishing that configuration set was feeding. Useful to unblock, not something to leave in place.",
      },
    ],
    awsDocsUrl:
      "https://docs.aws.amazon.com/ses/latest/dg/using-configuration-sets.html",
  },
  {
    slug: "mail-from-domain-not-verified",
    awsExceptionName: "MailFromDomainNotVerifiedException",
    title: 'Amazon SES "MAIL FROM domain is not verified": Causes and Fix',
    literalMessage:
      "Amazon SES could not read the MX record required to use the specified MAIL FROM domain.",
    wrapsErrorCode: "SES_MAIL_FROM_NOT_VERIFIED",
    category: "identity",
    description:
      "Why SES rejects a send when the custom MAIL FROM domain is not fully verified, which DNS records it needs, and how to unblock sending.",
    whyItHappens:
      "The identity you sent from has a custom MAIL FROM domain configured, and that domain is not fully verified. A custom MAIL FROM needs its own DNS records, separate from the identity's DKIM records, and SES checks them at send time.",
    causes: [
      "The custom MAIL FROM subdomain's MX record is missing or not yet propagated.",
      "The SPF TXT record for the MAIL FROM subdomain is missing or wrong.",
      "The records exist but SES has not re-checked and still reports the domain as pending.",
    ],
    fixes: [
      {
        heading: "Check the DNS records SES is looking for",
        body: "A custom MAIL FROM domain needs an MX record pointing at the SES inbound endpoint for its region and a TXT record publishing SPF. Both go on the MAIL FROM subdomain, not the root domain.",
        code: "wraps email verify",
        codeLanguage: "bash",
      },
      {
        heading: "Verify the records resolve publicly",
        body: "A record present in your DNS provider's UI is not the same as a record the internet can resolve. Query it from outside your network before assuming propagation is the problem.",
        code: "dig +short MX mail.example.com\ndig +short TXT mail.example.com",
        codeLanguage: "bash",
      },
      {
        heading: "Or remove the custom MAIL FROM domain",
        body: "If you do not need SPF alignment for DMARC right now, removing the custom MAIL FROM in the SES console lets sending resume immediately. SES falls back to its own MAIL FROM domain.",
      },
    ],
    prevention: [
      {
        heading: "Wait for verified before you cut traffic over",
        body: "SES reports the MAIL FROM domain as pending until it can read both records. Treat pending as not ready, not as nearly ready.",
      },
      {
        heading: "Keep the MAIL FROM subdomain out of general DNS churn",
        body: "The MX record on that subdomain exists solely for SES. A DNS cleanup that removes what looks like a stray MX record takes sending down with it.",
      },
    ],
    wrapsNote:
      "The Wraps CLI generates the MAIL FROM records, validates them and waits for propagation as part of domain setup, and it maps this exception to SES_MAIL_FROM_NOT_VERIFIED with a pointer to `wraps email verify`. DNS stays in your control, so a record removed at the registrar still breaks sending.",
    faqs: [
      {
        question: "What DNS records does a custom SES MAIL FROM domain need?",
        answer:
          "An MX record on the MAIL FROM subdomain pointing at the SES inbound endpoint for that region, and a TXT record publishing SPF for the same subdomain.",
      },
      {
        question: "Do I need a custom MAIL FROM domain at all?",
        answer:
          "Only if you want SPF to align with your From domain for DMARC. Without it SES uses its own MAIL FROM domain, DKIM still aligns, and sending works.",
      },
      {
        question: "Why does SES still say pending after I added the records?",
        answer:
          "SES re-checks on its own schedule and DNS has to propagate first. Confirm both records resolve from outside your network, then give SES time to re-check.",
      },
    ],
    awsDocsUrl: "https://docs.aws.amazon.com/ses/latest/dg/mail-from.html",
  },
  {
    slug: "invalid-client-token-id",
    awsExceptionName: "InvalidClientTokenId",
    title: 'AWS "InvalidClientTokenId" on SES: Causes and Fix',
    literalMessage: "The security token included in the request is invalid.",
    wrapsErrorCode: "ACCESS_KEY_INVALID",
    category: "credentials",
    description:
      "Why AWS returns InvalidClientTokenId when calling SES, how it differs from an expired token, and how to work out which credential the SDK actually picked up.",
    whyItHappens:
      "The request never reached SES. AWS could not resolve the access key ID in the signature to a real, active credential. The key was deleted, deactivated, belongs to a different account or partition, or is a temporary key sent without its session token.",
    causes: [
      "The access key was deleted or deactivated in IAM.",
      "The key belongs to a different AWS account or partition than the endpoint being called.",
      "A temporary credential was used without its matching session token.",
      "The SDK resolved a different credential than you expected, from a profile or environment variable you forgot was set.",
    ],
    fixes: [
      {
        heading: "Find out which identity the SDK actually resolved",
        body: "This answers the question before you change anything. If it fails the same way, the credential chain is picking up something that is not a valid key at all.",
        code: "aws sts get-caller-identity",
        codeLanguage: "bash",
      },
      {
        heading: "Check the key's state in IAM",
        body: "An access key that has been deactivated still looks correct in a config file. Confirm the key ID exists on the user you think it belongs to, and that it is active.",
      },
      {
        heading: "Rule out a stale environment variable",
        body: "AWS_ACCESS_KEY_ID exported in a shell profile silently outranks the profile you passed. Precedence, not correctness, is the usual culprit when the same credentials work elsewhere.",
      },
      {
        heading: "Reconfigure credentials",
        body: "Wraps does not rank the ways of providing AWS credentials. SSO, IAM access keys, environment variables and an existing named profile all work. Use whichever your organization already uses.",
        code: "aws configure sso\naws sso login\n\naws configure\n\nexport AWS_ACCESS_KEY_ID=<your-key>\nexport AWS_SECRET_ACCESS_KEY=<your-secret>\n\nexport AWS_PROFILE=<profile-name>",
        codeLanguage: "bash",
      },
    ],
    prevention: [
      {
        heading: "Prefer credentials that are not copied around",
        body: "Long-lived keys pasted into environments are the ones that go stale, get rotated out from under a deploy, or end up pointing at the wrong account.",
      },
      {
        heading: "Make the resolved identity visible in CI",
        body: "Logging the caller identity at the start of a deploy turns this class of failure from a mystery into a line of output.",
      },
    ],
    wrapsNote:
      "The Wraps CLI maps InvalidClientTokenId to ACCESS_KEY_INVALID and says the key is invalid or deactivated rather than claiming credentials are missing, which is a different problem with a different fix. Wraps stores no AWS credentials. The CLI resolves them from your environment the same way the AWS CLI does.",
    faqs: [
      {
        question:
          "What is the difference between InvalidClientTokenId and ExpiredToken?",
        answer:
          "InvalidClientTokenId means AWS cannot resolve the key at all. ExpiredToken means it resolved fine and the session has run out. The first needs a different key, the second needs a refresh.",
      },
      {
        question:
          "Why do the same credentials work in the AWS CLI but not here?",
        answer:
          "Usually credential precedence. Environment variables outrank the shared config file, so two tools started from different shells can resolve different identities.",
      },
      {
        question: "Does InvalidClientTokenId mean my IAM policy is wrong?",
        answer:
          "No. A policy problem returns AccessDenied, which means AWS knew who you were and refused. This error means AWS never established who you were.",
      },
    ],
    awsDocsUrl:
      "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html",
    wrapsDocsUrl: "https://wraps.dev/docs/guides/aws-setup/permissions",
  },
  {
    slug: "signature-does-not-match",
    awsExceptionName: "SignatureDoesNotMatch",
    title: 'AWS "SignatureDoesNotMatch" on SES: Causes and Fix',
    literalMessage:
      "The request signature we calculated does not match the signature you provided. Check your AWS Secret Access Key and signing method.",
    wrapsErrorCode: "ACCESS_KEY_INVALID",
    category: "credentials",
    description:
      "Why SigV4 signing fails against SES with SignatureDoesNotMatch, including clock skew, mismatched secrets and requests modified after signing.",
    whyItHappens:
      "AWS recognised the access key, recomputed the signature over the request, and got a different answer than the one you sent. Either the secret key does not match the access key ID, or something about how the request was signed differs from what AWS reconstructed.",
    causes: [
      "The secret access key does not match the access key ID, often from a partial copy or a rotation applied to one and not the other.",
      "Whitespace, a newline or a shell quoting artefact in the stored secret.",
      "Machine clock skew large enough to invalidate the signature timestamp.",
      "Hand-rolled or proxied SigV4 signing that alters headers or the body after signing.",
    ],
    fixes: [
      {
        heading: "Prove the key pair works at all",
        body: "One call that only needs valid signing. If this fails the same way, the problem is the credentials or the clock, not anything SES-specific.",
        code: "aws sts get-caller-identity",
        codeLanguage: "bash",
      },
      {
        heading: "Re-enter the secret rather than editing it",
        body: "Most mismatches are transcription damage: a truncated paste, a trailing newline, or a shell that ate a special character. Replace the value wholesale instead of trying to spot the difference.",
      },
      {
        heading: "Check the clock",
        body: "SigV4 signatures carry a timestamp and AWS rejects requests signed too far outside its own clock. Containers and long-suspended laptops drift.",
        code: "date -u",
        codeLanguage: "bash",
      },
      {
        heading: "Stop modifying the request after signing",
        body: "If a proxy, middleware or logging layer adds or rewrites headers or re-encodes the body after the SDK signs, the signature no longer covers the request AWS received. Sign last.",
      },
    ],
    prevention: [
      {
        heading: "Let the SDK sign",
        body: "The AWS SDK's signer handles canonicalisation, payload hashing and the timestamp window. Hand-rolled SigV4 is where this error is most likely to become permanent rather than transient.",
      },
      {
        heading: "Keep time synchronised on senders",
        body: "NTP on every host that signs AWS requests removes an entire class of intermittent failure that otherwise looks random.",
      },
    ],
    wrapsNote:
      "The Wraps CLI maps SignatureDoesNotMatch to ACCESS_KEY_INVALID and points at the IAM console rather than reporting missing credentials. The Wraps SDKs sign through the AWS SDK's own signer, so the signing path is not somewhere you have to debug.",
    faqs: [
      {
        question: "Can clock skew cause SignatureDoesNotMatch?",
        answer:
          "Yes. SigV4 signatures include a timestamp and AWS rejects a request signed too far from its own clock. Check the host clock before rotating keys.",
      },
      {
        question: "Does SignatureDoesNotMatch mean my access key is wrong?",
        answer:
          "The access key ID is fine, otherwise you would get InvalidClientTokenId. The mismatch is in the secret key, or in how the request was signed.",
      },
      {
        question: "Why does this only happen behind our proxy?",
        answer:
          "Because something is changing the request after the SDK signed it. Any header rewrite or body re-encoding downstream of the signer invalidates the signature.",
      },
    ],
    awsDocsUrl:
      "https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-troubleshooting.html",
    wrapsDocsUrl: "https://wraps.dev/docs/guides/aws-setup/permissions",
  },
  {
    slug: "unrecognized-client-exception",
    awsExceptionName: "UnrecognizedClientException",
    title: 'AWS "UnrecognizedClientException" on SES: Causes and Fix',
    literalMessage: "The security token included in the request is invalid.",
    wrapsErrorCode: "ACCESS_KEY_INVALID",
    category: "credentials",
    description:
      "Why SES returns UnrecognizedClientException, why it usually means an empty or unresolved credential rather than a wrong one, and how to fix it.",
    whyItHappens:
      "AWS did not recognise the credential the request was signed with. In practice this most often means the SDK signed with something empty or partially resolved, rather than with a real key that happens to be wrong. An unset environment variable, a profile that does not exist, or a container role that never attached all land here.",
    causes: [
      "The credential chain resolved to an empty or partial credential.",
      "A named profile was requested that does not exist in the shared config file.",
      "An instance or container role was expected but never attached.",
      "The access key was deleted, or belongs to another account.",
    ],
    fixes: [
      {
        heading: "Ask AWS who it thinks you are",
        body: "The fastest discriminator. A clean answer means credentials resolve and the problem is elsewhere. The same error means the chain is producing nothing usable.",
        code: "aws sts get-caller-identity",
        codeLanguage: "bash",
      },
      {
        heading: "Check the profile actually exists",
        body: "AWS_PROFILE pointing at a name that is not in the shared config file does not fail loudly. It fails here, several layers later.",
        code: "aws configure list-profiles",
        codeLanguage: "bash",
      },
      {
        heading: "Confirm the role attached, in a container or on an instance",
        body: "Task roles and instance profiles can be configured and still not be present at runtime. If the credential provider never returned anything, this is the error you see.",
      },
      {
        heading: "Provide credentials by whichever route you already use",
        body: "SSO, IAM access keys, environment variables and an existing named profile are all supported, and Wraps does not rank them.",
        code: "aws configure sso\naws sso login\n\naws configure\n\nexport AWS_PROFILE=<profile-name>",
        codeLanguage: "bash",
      },
    ],
    prevention: [
      {
        heading: "Fail fast on an unresolved credential chain",
        body: "Resolving the caller identity at startup turns a confusing send-time error into an obvious boot-time one.",
      },
      {
        heading: "Do not let a missing profile fall through silently",
        body: "Validate that the profile named in configuration exists, rather than discovering it from a signature failure.",
      },
    ],
    wrapsNote:
      "The Wraps CLI maps UnrecognizedClientException to ACCESS_KEY_INVALID. It is deliberately not reported as credentials not found, because that error is reserved for the case where nothing was found at all and it sends you somewhere different. Wraps stores no AWS credentials of yours.",
    faqs: [
      {
        question:
          "What is the difference between UnrecognizedClientException and InvalidClientTokenId?",
        answer:
          "Different AWS services report the same underlying condition under different names. Both mean AWS could not resolve the credential the request was signed with, and both are fixed by getting a working credential in front of the SDK.",
      },
      {
        question: "Why does this happen only in my container?",
        answer:
          "Usually because the task or instance role is not actually attached at runtime, so the credential chain resolves to nothing. Locally your shared config file was quietly covering for it.",
      },
      {
        question: "Is this a permissions problem?",
        answer:
          "No. A permissions problem returns AccessDenied. This error means authentication never succeeded, so the policy was never consulted.",
      },
    ],
    awsDocsUrl:
      "https://docs.aws.amazon.com/sdkref/latest/guide/standardized-credentials.html",
    wrapsDocsUrl: "https://wraps.dev/docs/guides/aws-setup/permissions",
  },
  {
    slug: "expired-token",
    awsExceptionName: "ExpiredTokenException",
    title: 'AWS "ExpiredToken" on SES: Causes and Fix',
    literalMessage: "The security token included in the request is expired.",
    wrapsErrorCode: "SESSION_TOKEN_EXPIRED",
    category: "credentials",
    description:
      "Why temporary AWS credentials expire mid-run, how SSO sessions and assumed roles differ, and how to refresh without restarting the job.",
    whyItHappens:
      "The credentials were valid and have run out. Temporary credentials from SSO, an assumed role, or an instance or container role all carry an expiry, and AWS refuses any request signed with one past that point. Long-running jobs hit this in the middle rather than at the start.",
    causes: [
      "An SSO session expired.",
      "An assumed-role session reached the end of its duration.",
      "Credentials were captured into environment variables once and never refreshed.",
      "A job ran longer than the session duration it started with.",
    ],
    fixes: [
      {
        heading: "Refresh the session",
        body: "For SSO, log in again. For an assumed role, re-run the assume-role step that produced the credentials.",
        code: "aws sso login",
        codeLanguage: "bash",
      },
      {
        heading: "Stop freezing credentials into environment variables",
        body: "Exporting AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_SESSION_TOKEN takes a snapshot the SDK can never refresh. Let the SDK resolve the profile instead, so it can renew on its own.",
      },
      {
        heading: "Raise the session duration for long jobs",
        body: "If a batch legitimately runs longer than the session, the role's maximum session duration is the setting to change, within whatever your organization permits.",
      },
      {
        heading: "Check the clock if it expires immediately",
        body: "A host clock far ahead of real time makes a fresh token look expired the moment it is issued.",
        code: "date -u",
        codeLanguage: "bash",
      },
    ],
    prevention: [
      {
        heading: "Let the SDK own refresh",
        body: "Credential providers renew temporary credentials on their own. Every mechanism that copies them out defeats that and reintroduces this error.",
      },
      {
        heading: "Make long jobs resumable",
        body: "A batch that cannot be resumed turns an expiry into lost work. One that checkpoints turns it into a refresh.",
      },
    ],
    wrapsNote:
      "The Wraps CLI maps ExpiredTokenException, TokenRefreshRequired and SSOTokenExpired to SESSION_TOKEN_EXPIRED and tells you to refresh rather than to reconfigure. That is the difference between a five-second fix and rotating keys you did not need to rotate.",
    faqs: [
      {
        question: "How long do AWS temporary credentials last?",
        answer:
          "It depends on how they were issued. Assumed-role sessions run from 15 minutes up to the role's maximum duration, and SSO sessions are governed by the permission set. Neither is indefinite.",
      },
      {
        question: "Why did my token expire in the middle of a batch send?",
        answer:
          "Because the batch outlived the session it started with. Either the credentials were frozen into environment variables so nothing could refresh them, or the job runs longer than the session duration allows.",
      },
      {
        question: "Do I need new access keys after an ExpiredToken error?",
        answer:
          "No. Nothing is wrong with the underlying identity. Refresh the session and the same credentials work again.",
      },
    ],
    awsDocsUrl:
      "https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp.html",
    wrapsDocsUrl: "https://wraps.dev/docs/guides/aws-setup/permissions",
  },
  {
    slug: "access-denied",
    awsExceptionName: "AccessDeniedException",
    title: 'AWS SES "AccessDenied": Causes and Fix',
    literalMessage:
      "User: arn:aws:iam::123456789012:user/dev is not authorized to perform: ses:SendEmail on resource: arn:aws:ses:us-east-1:123456789012:identity/example.com",
    wrapsErrorCode: "IAM_PERMISSION_DENIED",
    category: "credentials",
    description:
      "How to read an SES AccessDenied message, which IAM action and resource it names, and the four things that deny a call AWS otherwise authenticated.",
    whyItHappens:
      "AWS knew exactly who you were and refused anyway. That makes this the most readable failure in the set: the message names the principal, the action and the resource. Everything you need to fix it is in the string, provided you read all three parts.",
    causes: [
      "The identity policy does not grant the named action.",
      "The policy grants the action but not on the named resource.",
      "A permissions boundary or service control policy denies it above the identity policy.",
      "An identity policy on the SES identity itself denies this principal.",
    ],
    fixes: [
      {
        heading: "Read the three parts of the message",
        body: "The principal is who was refused, the action is the exact IAM action to grant, and the resource is the ARN to grant it on. A policy that grants ses:SendEmail on a different identity ARN produces this error even though it looks correct.",
      },
      {
        heading: "Confirm the principal is the one you meant",
        body: "The ARN in the message is authoritative and often surprising, especially in CI where a role is assumed on your behalf.",
        code: "aws sts get-caller-identity",
        codeLanguage: "bash",
      },
      {
        heading: "Grant the action on the resource that was named",
        body: "Add the specific action to the identity's policy, scoped to the resource in the message. Grant what was denied rather than widening to a wildcard to make the error go away.",
      },
      {
        heading: "Check for a deny above the identity policy",
        body: "If the identity policy plainly allows it, look for a permissions boundary or an organization service control policy. An explicit deny at either level wins over any allow below it.",
      },
    ],
    prevention: [
      {
        heading: "Check permissions before the deploy, not during",
        body: "The set of IAM actions a send path needs is knowable up front. Verifying them ahead of time is cheaper than discovering them one denial at a time.",
      },
      {
        heading: "Keep CI and local identities aligned",
        body: "Most surprise denials are a CI role that was never granted what a developer's own identity already had.",
      },
    ],
    wrapsNote:
      "The Wraps CLI maps AccessDenied, AccessDeniedException and UnauthorizedAccess to IAM_PERMISSION_DENIED, quotes the action back to you, and points at `wraps permissions --json`, which prints the actions a given command needs. Changing an IAM policy is a change in your AWS account, so it stays yours to make.",
    faqs: [
      {
        question: "Which IAM action does SES need for sending?",
        answer:
          "Read it out of the message rather than guessing. The AccessDenied string names the exact action that was denied, which is the one to grant.",
      },
      {
        question: "Why is my policy allowing this but the call still denied?",
        answer:
          "Either the resource ARN in the policy does not match the one in the message, or an explicit deny in a permissions boundary or service control policy is overriding the allow.",
      },
      {
        question: "Is AccessDenied the same as a credentials problem?",
        answer:
          "No, and the difference matters. AccessDenied means authentication succeeded and authorization failed. Credential errors mean AWS never established who you were.",
      },
      {
        question: "Why does it work locally but not in CI?",
        answer:
          "Different principals. The ARN in the error tells you which identity CI actually assumed, and that identity usually has a narrower policy than your own.",
      },
    ],
    awsDocsUrl:
      "https://docs.aws.amazon.com/IAM/latest/UserGuide/troubleshoot_access-denied.html",
    wrapsDocsUrl: "https://wraps.dev/docs/guides/aws-setup/permissions",
  },
];

export const SES_ERROR_CATEGORIES: readonly {
  id: SesErrorCategory;
  label: string;
  blurb: string;
}[] = [
  {
    id: "identity",
    label: "Identity and verification",
    blurb:
      "The request reached SES and SES refused it over what is, or is not, verified.",
  },
  {
    id: "throughput",
    label: "Throughput and quota",
    blurb:
      "The send was well formed and you asked for more than the account is allowed right now.",
  },
  {
    id: "account-state",
    label: "Account and configuration set state",
    blurb:
      "Sending is switched off, either for the whole account or for one configuration set.",
  },
  {
    id: "credentials",
    label: "Credentials and permissions",
    blurb:
      "The request never got past authentication or authorization, so SES never saw the message.",
  },
];

export function sesErrorBySlug(slug: string): SesError {
  const error = SES_ERRORS.find((entry) => entry.slug === slug);
  if (error === undefined) {
    throw new Error(`Unknown SES error slug: ${slug}`);
  }
  return error;
}

export function sesErrorsInCategory(
  category: SesErrorCategory
): readonly SesError[] {
  return SES_ERRORS.filter((entry) => entry.category === category);
}
