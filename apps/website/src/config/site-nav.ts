// The marketing site's navigation, one source for the navbar and the footer.
// Every href resolves to a route under src/app (src/__tests__/site-nav.test.ts
// checks it), except the founders page behind FOUNDERS_PAGE_LIVE.

/**
 * Plan 076 builds /for/founders. Until the route exists its nav and footer
 * links stay hidden, so they never 404. Flip this to true in the same change
 * that adds src/app/for/founders/page.tsx; the test fails if the two disagree.
 */
export const FOUNDERS_PAGE_LIVE = false;

export type NavLink = {
  name: string;
  href: string;
  description?: string;
  /** Not rendered while true (the route it points at does not exist yet). */
  hidden?: boolean;
};

export type NavGroup = {
  heading?: string;
  links: NavLink[];
};

export type NavFeature = {
  name: string;
  description: string;
  href: string;
  cta: string;
};

export type NavMenu = {
  name: string;
  /** A plain top-level link when there are no groups. */
  href?: string;
  groups?: NavGroup[];
  feature?: NavFeature;
};

const founders: NavLink = {
  name: "Founders",
  href: "/for/founders",
  description: "Cut the email bill as you grow",
  hidden: !FOUNDERS_PAGE_LIVE,
};

export const NAV_MENUS: NavMenu[] = [
  {
    name: "Product",
    groups: [
      {
        heading: "Email",
        links: [
          {
            name: "Newsletters",
            href: "/platform#newsletters",
            description: "Write it once, send to everyone or a segment",
          },
          {
            name: "Automations",
            href: "/platform#automations",
            description: "Emails that send when something happens",
          },
          {
            name: "Templates",
            href: "/platform#templates",
            description: "Branded templates, written with AI",
          },
          {
            name: "Inbox health",
            href: "/platform#deliverability",
            description: "Bounces, complaints and domain checks",
          },
        ],
      },
      {
        heading: "Also",
        links: [
          {
            name: "Receive email",
            href: "/inbound",
            description: "Inbound email into your AWS",
          },
          {
            name: "Text messages",
            href: "/sms",
            description: "SMS from your AWS account",
          },
          {
            name: "How it works",
            href: "/#how",
            description: "Your dashboard, Amazon's sending",
          },
          {
            name: "Security",
            href: "/security",
            description: "What we can see, what we store",
          },
          {
            name: "Why Wraps",
            href: "/why-wraps",
            description: "The evaluation guide you can forward",
          },
        ],
      },
    ],
    feature: {
      name: "The Wraps platform",
      description:
        "Contacts, newsletters, automations and reports. Sending runs in your AWS account.",
      href: "/platform",
      cta: "See the platform",
    },
  },
  {
    name: "Solutions",
    groups: [
      {
        heading: "By team",
        links: [
          {
            name: "Marketing teams",
            href: "/for/marketing",
            description: "Newsletters, segments, unlimited contacts",
          },
          {
            name: "Email operations",
            href: "/for/operators",
            description: "Consent, deliverability, a paper trail",
          },
          founders,
          {
            name: "Developers",
            href: "/cli",
            description: "CLI, SDKs and an MCP server",
          },
          {
            name: "AI agents",
            href: "/agents",
            description: "Email your agents can send and receive",
          },
        ],
      },
      {
        heading: "Switching from",
        links: [
          { name: "Klaviyo", href: "/compare/klaviyo-vs-wraps" },
          { name: "SendGrid", href: "/compare/sendgrid-vs-wraps" },
          { name: "Customer.io", href: "/compare/customer-io-vs-wraps" },
          { name: "Mailgun", href: "/compare/mailgun-vs-wraps" },
          { name: "See all comparisons", href: "/compare" },
        ],
      },
    ],
  },
  {
    name: "Developers",
    groups: [
      {
        links: [
          {
            name: "Quickstart",
            href: "/docs/quickstart",
            description: "Set up and send your first email",
          },
          { name: "Docs", href: "/docs", description: "Guides and references" },
          {
            name: "CLI",
            href: "/cli",
            description: "Deploy into your AWS with one command",
          },
          {
            name: "SDKs",
            href: "/sdk",
            description: "TypeScript and Python",
          },
          {
            name: "MCP server",
            href: "/mcp",
            description: "Your email as tools for AI agents",
          },
          {
            name: "Bring your own cloud",
            href: "/byoc",
            description: "What deploys into your AWS, and how",
          },
          {
            name: "CDK and Pulumi",
            href: "/docs/cdk-reference",
            description: "Deploy with your own infrastructure code",
          },
        ],
      },
    ],
  },
  { name: "Pricing", href: "/#pricing" },
  {
    name: "Resources",
    groups: [
      {
        heading: "Learn",
        links: [
          { name: "Blog", href: "/blog" },
          { name: "Email glossary", href: "/glossary" },
          { name: "Amazon SES guides", href: "/ses" },
          { name: "Changelog", href: "/changelog" },
        ],
      },
      {
        heading: "Decide",
        links: [
          { name: "Alternatives", href: "/alternatives" },
          { name: "Four ways to send email", href: "/approaches" },
          { name: "Provider comparisons", href: "/versus" },
          { name: "Migration guides", href: "/migrate" },
          { name: "Free email tools", href: "/tools" },
          { name: "Cost calculator", href: "/tools/ses-calculator" },
        ],
      },
    ],
  },
];

export const SIGN_UP_URL = "https://app.wraps.dev/auth?mode=signup";
export const SIGN_IN_URL = "https://app.wraps.dev/auth?mode=signin";
export const GITHUB_URL = "https://github.com/wraps-team/wraps";

export type FooterColumn = {
  title: string;
  links: (NavLink & { external?: boolean })[];
};

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "Product",
    links: [
      { name: "Platform", href: "/platform" },
      { name: "Newsletters", href: "/platform#newsletters" },
      { name: "Automations", href: "/platform#automations" },
      { name: "Receive email", href: "/inbound" },
      { name: "Text messages", href: "/sms" },
      { name: "Pricing", href: "/#pricing" },
      { name: "Security", href: "/security" },
      { name: "Why Wraps", href: "/why-wraps" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { name: "Marketing teams", href: "/for/marketing" },
      { name: "Email operations", href: "/for/operators" },
      { name: founders.name, href: founders.href, hidden: founders.hidden },
      { name: "Developers", href: "/cli" },
      { name: "AI agents", href: "/agents" },
      { name: "Compare Wraps", href: "/compare" },
    ],
  },
  {
    title: "Developers",
    links: [
      { name: "Quickstart", href: "/docs/quickstart" },
      { name: "Docs", href: "/docs" },
      { name: "CLI", href: "/cli" },
      { name: "SDKs", href: "/sdk" },
      { name: "MCP server", href: "/mcp" },
      { name: "CDK and Pulumi", href: "/docs/cdk-reference" },
      { name: "llms.txt", href: "/llms.txt" },
      { name: "GitHub", href: GITHUB_URL, external: true },
    ],
  },
  {
    title: "Resources",
    links: [
      { name: "Blog", href: "/blog" },
      { name: "Glossary", href: "/glossary" },
      { name: "Amazon SES guides", href: "/ses" },
      { name: "Alternatives", href: "/alternatives" },
      { name: "Migration guides", href: "/migrate" },
      { name: "Free email tools", href: "/tools" },
      { name: "Changelog", href: "/changelog" },
    ],
  },
  {
    title: "Company",
    links: [
      { name: "About", href: "/about" },
      { name: "Contact", href: "/contact" },
      { name: "Subprocessors", href: "/subprocessors" },
      { name: "DPA", href: "/dpa" },
      { name: "Privacy", href: "/privacy" },
      { name: "Terms", href: "/terms" },
    ],
  },
];
