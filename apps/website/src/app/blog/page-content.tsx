import {
  ArrowRight,
  Bot,
  Building2,
  Code2,
  Database,
  DollarSign,
  FileCheck,
  FileText,
  Inbox,
  KeyRound,
  Mail,
  Network,
  Receipt,
  Send,
  Server,
  Shield,
  Zap,
} from "lucide-react";
import Image from "next/image";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { SectionKicker } from "@/app/landing/components/section-kicker";

type BlogPost = {
  slug: string;
  title: string;
  description: string;
  category: string;
  date: string;
  readTime: string;
  author: string;
  featured?: boolean;
  icon?: React.ReactNode;
  image?: string;
};

const posts: BlogPost[] = [
  {
    slug: "reduce-transactional-email-costs",
    title: "At 100K Emails a Month, the Send Rate Is the Small Number",
    description:
      "Sending 100,000 transactional emails on SES costs $10. A dedicated IP costs $24.95, attachments cost $24, and SES Pro costs $127. The full bill at 100K, the 17x spread across providers, and why cutting 30,000 sends saves $3.00.",
    category: "Research",
    date: "August 2026",
    readTime: "11 min read",
    author: "Wraps Team",
    featured: true,
    icon: <Receipt className="h-6 w-6" />,
  },
  {
    slug: "ses-pricing-plans-2026",
    title: "AWS SES Pricing Plans: What Actually Changed",
    description:
      "AWS added three subscription plans to SES and now starts every new account and Region on Essentials at $0.16 per 1,000 on the first 10M each month. À la carte is still $0.10, untiered — here's how to tell which one you're on and how to move back.",
    category: "Research",
    date: "July 2026",
    readTime: "12 min read",
    author: "Wraps Team",
    featured: true,
    icon: <DollarSign className="h-6 w-6" />,
  },
  {
    slug: "python-email-sdk",
    title: "A Python Email SDK for Your Own SES",
    description:
      "wraps-email 0.1.0 is on PyPI. It signs SigV4 straight against SES in your AWS account — no Wraps API key, no Wraps server in the request path.",
    category: "Product",
    date: "July 2026",
    readTime: "9 min read",
    author: "Wraps Team",
    icon: <Code2 className="h-6 w-6" />,
  },
  {
    slug: "agent-mailboxes",
    title: "Agent Mailboxes: A Leash the Agent Can't Reach",
    description:
      "An email identity for an AI agent, constrained by a Lambda in your own AWS account. Kill switch, sender pin, allowlist, and caps decided where the agent's credential can't reach them.",
    category: "Product",
    date: "July 2026",
    readTime: "14 min read",
    author: "Wraps Team",
    featured: true,
    icon: <Bot className="h-6 w-6" />,
  },
  {
    slug: "dmarcbis-what-changes",
    title: "DMARC Is Finally an Actual Standard: What RFC 9989 Changes",
    description:
      "RFC 9989 made DMARC Standards Track in May 2026, obsoleting RFC 7489 and RFC 9091. The Public Suffix List is replaced by a DNS tree walk, pct= is removed, np= and t= are in.",
    category: "Security",
    date: "July 2026",
    readTime: "13 min read",
    author: "Wraps Team",
    featured: true,
    icon: <Shield className="h-6 w-6" />,
  },
  {
    slug: "agent-readable-docs",
    title: "Making Our Docs Agent-Readable",
    description:
      "Per-page markdown over content negotiation, well-known discovery documents, an in-browser tool surface, and AI crawl signals. What we shipped, what it does not do, and which of it is actually a standard.",
    category: "Engineering",
    date: "May 2026",
    readTime: "11 min read",
    author: "Wraps Team",
    icon: <FileText className="h-6 w-6" />,
  },
  {
    slug: "scale-plan-enterprise-features",
    title: "SSO, Behavioral Segments, and What's Next: Inside the Scale Plan",
    description:
      "Every Scale-exclusive feature explained — SSO + SCIM, behavioral segments, unlimited AWS accounts, 1-year history — plus a look at audit trail and custom retention coming next.",
    category: "Product",
    date: "May 2026",
    readTime: "7 min read",
    author: "Wraps Team",
    icon: <Building2 className="h-6 w-6" />,
  },
  {
    slug: "vibe-coding-email",
    title: "Sending Email from AI-Built Apps (Lovable, Bolt, Base44, Replit)",
    description:
      "Built your app with AI? Here's how to add email without putting AWS credentials in your code. One CLI command, one API key, any platform.",
    category: "Guide",
    date: "May 2026",
    readTime: "5 min read",
    author: "Wraps Team",
    icon: <Send className="h-6 w-6" />,
  },
  {
    slug: "lovable-send-email",
    title: "How to Send Email from Your Lovable App",
    description:
      "Deploy one CLI command, add two env vars to Lovable via Supabase, and send email with plain fetch. AWS credentials never touch your app.",
    category: "Guide",
    date: "May 2026",
    readTime: "8 min read",
    author: "Wraps Team",
    icon: <Mail className="h-6 w-6" />,
  },
  {
    slug: "bolt-send-email",
    title: "How to Send Email from Your Bolt.new App",
    description:
      "Deploy one CLI command, add two server env vars to Bolt, and send email from a server route. AWS credentials stay on your machine.",
    category: "Guide",
    date: "May 2026",
    readTime: "8 min read",
    author: "Wraps Team",
    icon: <Mail className="h-6 w-6" />,
  },
  {
    slug: "base44-send-email",
    title: "How to Send Email from Your Base44 App",
    description:
      "Deploy one CLI command, add two server secrets to Base44, and send email from a backend function. AWS credentials never reach browser code.",
    category: "Guide",
    date: "May 2026",
    readTime: "8 min read",
    author: "Wraps Team",
    icon: <Mail className="h-6 w-6" />,
  },
  {
    slug: "replit-send-email",
    title: "How to Send Email from Your Replit App",
    description:
      "Deploy one CLI command, add two Replit Secrets, and send email from a server route. AWS credentials stay on your local machine.",
    category: "Guide",
    date: "May 2026",
    readTime: "8 min read",
    author: "Wraps Team",
    icon: <Mail className="h-6 w-6" />,
  },
  {
    slug: "signed-reply-threading",
    title: "Signed Reply-To for Agents",
    description:
      "Cryptographic conversation correlation for email agents. HMAC-signed reply-to addresses verified in a Lambda running in your AWS account — the signing secret never leaves your cloud.",
    category: "Engineering",
    date: "April 2026",
    readTime: "6 min read",
    author: "Wraps Team",
    icon: <KeyRound className="h-6 w-6" />,
  },
  {
    slug: "yc-w26-email-security-audit",
    title:
      "We Graded 200 YC W26 Companies on Email Security. Only 23% Got an A.",
    description:
      "We scanned every YC W26 company for SPF, DKIM, and DMARC using public DNS records. 70% don't enforce DMARC. Full data and methodology.",
    category: "Research",
    date: "March 2026",
    readTime: "5 min read",
    author: "Wraps Team",
    icon: <Shield className="h-6 w-6" />,
    image: "/blog/yc-w26-email-security-audit.webp",
  },
  {
    slug: "supabase-email-guide",
    title: "4 Email Flows Your Supabase App Needs Before Going Live",
    description:
      "Supabase handles auth and database. Email beyond magic links? That's on you. The 4 flows every production Supabase app needs — auth, transactional, broadcasts, automations — and how to set each one up.",
    category: "Guide",
    date: "March 2026",
    readTime: "12 min read",
    author: "Wraps Team",
    icon: <Database className="h-6 w-6" />,
    image: "/blog/supabase-email-guide.webp",
  },
  {
    slug: "how-email-works",
    title: "How Email Actually Works",
    description:
      "You click Send. What happens in the next 3 seconds? An interactive journey through SMTP handshakes, DNS lookups, relay hops, and authentication — with a terminal you can type in.",
    category: "Engineering",
    date: "March 2026",
    readTime: "20 min read",
    author: "Wraps Team",
    icon: <Mail className="h-6 w-6" />,
    image: "/blog/how-email-works.webp",
  },
  {
    slug: "email-templates-react-workflows-typescript",
    title: "Email Templates as React, Workflows as TypeScript",
    description:
      "Write email templates as React components and automation workflows as TypeScript. Version-controlled, type-safe, code-reviewable email infrastructure.",
    category: "Developer Experience",
    date: "February 2026",
    readTime: "10 min read",
    author: "Wraps Team",
    icon: <Code2 className="h-6 w-6" />,
    image: "/blog/wraps-templates-and-workflows-as-code.webp",
  },
  {
    slug: "inbound-email-guide",
    title: "Receive Emails in Your AWS Account with Wraps",
    description:
      "Build support inboxes, automate order processing, and create email-to-ticket workflows. All in your AWS account with EventBridge webhooks.",
    category: "Engineering",
    date: "February 2026",
    readTime: "8 min read",
    author: "Wraps Team",
    icon: <Inbox className="h-6 w-6" />,
    image: "/blog/wraps-inbound.webp",
  },
  {
    slug: "your-dmarc-policy-is-useless",
    title: "Your DMARC policy is useless",
    description:
      "82% of domains have no DMARC. Of those that do, most set p=none—which tells receivers not to enforce. An interactive deep-dive into email authentication.",
    category: "Security",
    date: "January 2026",
    readTime: "12 min read",
    author: "Wraps Team",
    icon: <Shield className="h-6 w-6" />,
    image: "/blog/DMARC_EXPLOITED.webp",
  },
  {
    slug: "spf-guide",
    title: "The SPF 10-Lookup Limit: Why Your Email Might Be Failing",
    description:
      "SPF looks simple until you hit the 10-lookup limit. Learn how lookups are counted, which providers cost the most, and how to stay under the limit.",
    category: "Guide",
    date: "January 2026",
    readTime: "10 min read",
    author: "Wraps Team",
    icon: <Server className="h-6 w-6" />,
  },
  {
    slug: "ses-sandbox-guide",
    title: "How to Get Out of Amazon SES Sandbox",
    description:
      "The complete guide to SES production access approval. Interactive checklists, request templates, and everything you need to escape the sandbox on your first try.",
    category: "Guide",
    date: "January 2026",
    readTime: "15 min read",
    author: "Wraps Team",
    icon: <FileCheck className="h-6 w-6" />,
    image: "/blog/get-out-of-sandbox.webp",
  },
  {
    slug: "ses-production-architecture",
    title: "AWS SES Production Architecture Guide",
    description:
      "Everything you need to deploy SES at scale: dedicated IPs, bounce handling, rate limiting, configuration sets, and the patterns that protect your sender reputation.",
    category: "Architecture",
    date: "January 2026",
    readTime: "15 min read",
    author: "Wraps Team",
    icon: <Network className="h-6 w-6" />,
  },
  {
    slug: "aws-ses-simplified",
    title: "AWS SES Setup Simplified: From Hours to Minutes",
    description:
      "What should be a simple 'send email from my app' turns into a multi-day odyssey. See how one command deploys production-ready SES infrastructure.",
    category: "Engineering",
    date: "January 2026",
    readTime: "10 min read",
    author: "Wraps Team",
    icon: <Zap className="h-6 w-6" />,
    image: "/blog/aws-ses-simplified.webp",
  },
  {
    slug: "nextjs-vercel-ses-guide",
    title: "Next.js + Vercel + AWS SES: The Complete Email Guide",
    description:
      "Deploy production-ready email infrastructure to your AWS account in minutes. No stored credentials, zero access keys.",
    category: "Guide",
    date: "January 2026",
    readTime: "12 min read",
    author: "Wraps Team",
    icon: <Server className="h-6 w-6" />,
    image: "/blog/nextjs-vercel-ses-guide.webp",
  },
];

const META_RULE = "font-mono text-[11px] uppercase tracking-[0.08em]";

const TRAILING_READ = /\s*read$/;

/** "12 min read" -> "12 min" — the panel has room for the number, not the verb. */
function shortReadTime(readTime: string) {
  return readTime.replace(TRAILING_READ, "");
}

/**
 * The art slot for a featured post. Posts with cover art use it; posts without
 * get a typographic panel built from the metadata they already carry, so an
 * imageless post reads as designed rather than as a hole in the layout.
 */
function PostArt({ post }: { post: BlogPost }) {
  if (post.image) {
    return (
      <Image
        alt=""
        className="object-cover"
        fill
        sizes="(max-width: 768px) 100vw, 300px"
        src={post.image}
      />
    );
  }

  return (
    <div className="flex size-full flex-col justify-between bg-muted/40 p-6">
      <div>
        <span className="font-mono text-[19px] text-foreground uppercase leading-none tracking-[0.06em] md:text-[22px]">
          {post.category}
        </span>
        <span
          aria-hidden="true"
          className="mt-4 block h-px w-10 bg-orange-500"
        />
      </div>
      <div className={`${META_RULE} space-y-1 text-muted-foreground`}>
        <div>{post.date}</div>
        <div>{shortReadTime(post.readTime)}</div>
      </div>
      <span className={`${META_RULE} text-muted-foreground/50`}>wraps.dev</span>
    </div>
  );
}

function FeaturedCard({ post }: { post: BlogPost }) {
  return (
    <a
      className="group block border-foreground border-t pt-6 transition-colors hover:border-orange-500"
      href={`/blog/${post.slug}`}
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,300px)_1fr] md:gap-10">
        <div className="relative aspect-[16/10] overflow-hidden rounded-lg border border-border md:aspect-[3/2]">
          <PostArt post={post} />
        </div>

        <div className="flex flex-col justify-center">
          <div
            className={`${META_RULE} mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-muted-foreground`}
          >
            <span className="text-orange-600 dark:text-orange-500">
              {post.category}
            </span>
            <span aria-hidden="true">/</span>
            <span>{post.author}</span>
            <span aria-hidden="true">/</span>
            <span>{post.date}</span>
            <span aria-hidden="true">/</span>
            <span>{post.readTime}</span>
          </div>

          <h3 className="font-heading font-semibold text-[22px] text-foreground leading-[1.15] tracking-[-0.02em] transition-colors group-hover:text-orange-600 md:text-[27px] dark:group-hover:text-orange-500">
            {post.title}
          </h3>

          <p className="mt-3 max-w-[62ch] text-[14.5px] text-muted-foreground leading-[1.6]">
            {post.description}
          </p>

          <span className="mt-5 inline-flex items-center gap-2 font-medium text-[13.5px] text-foreground">
            Read article
            <ArrowRight
              aria-hidden="true"
              className="size-3.5 transition-transform group-hover:translate-x-1"
            />
          </span>
        </div>
      </div>
    </a>
  );
}

function PostCard({ post }: { post: BlogPost }) {
  return (
    <a
      className="group block border-foreground border-t pt-5 transition-colors hover:border-orange-500"
      href={`/blog/${post.slug}`}
    >
      <div
        className={`${META_RULE} mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-muted-foreground`}
      >
        <span className="text-orange-600 dark:text-orange-500">
          {post.category}
        </span>
        <span aria-hidden="true">/</span>
        <span>{shortReadTime(post.readTime)}</span>
      </div>

      <h3 className="mb-2 font-semibold text-[15px] text-foreground leading-snug transition-colors group-hover:text-orange-600 dark:group-hover:text-orange-500">
        {post.title}
      </h3>

      <p className="line-clamp-3 text-[13.5px] text-muted-foreground leading-[1.55]">
        {post.description}
      </p>

      <span className={`${META_RULE} mt-3 block text-muted-foreground/70`}>
        {post.date}
      </span>
    </a>
  );
}

export default function BlogContent() {
  const featured = posts.filter((p) => p.featured);
  const rest = posts.filter((p) => !p.featured);

  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />

      <main>
        {/* Masthead */}
        <section className="border-border border-b py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-[620px]">
              <SectionKicker>The Wraps blog</SectionKicker>
              <h1 className="font-heading font-semibold text-[34px] text-foreground leading-[1.08] tracking-[-0.022em] md:text-[46px]">
                Deep dives into email infrastructure.
              </h1>
              <p className="mt-4 max-w-[52ch] text-[17px] text-muted-foreground leading-[1.55]">
                Deliverability, DNS, AWS pricing, and developer experience —
                researched properly, with the sources and the numbers shown.
              </p>
            </div>
          </div>
        </section>

        {/* Featured */}
        {featured.length > 0 && (
          <section className="border-border border-b py-16 md:py-20">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <SectionKicker>Featured</SectionKicker>
              <div className="mt-2 space-y-12">
                {featured.map((post) => (
                  <FeaturedCard key={post.slug} post={post} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Archive */}
        {rest.length > 0 && (
          <section className="border-border border-b py-16 md:py-20">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
              <SectionKicker>All articles</SectionKicker>
              <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((post) => (
                  <PostCard key={post.slug} post={post} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Closer */}
        <section className="py-16 md:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-[52ch] border-foreground border-t pt-5">
              <h2 className="mb-2 font-semibold text-[15px] text-foreground">
                More coming soon
              </h2>
              <p className="text-[13.5px] text-muted-foreground leading-[1.55]">
                We're working on more deep-dives into email infrastructure, DNS,
                and developer tooling. Stay tuned.
              </p>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
