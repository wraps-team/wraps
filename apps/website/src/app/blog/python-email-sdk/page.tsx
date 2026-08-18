import { Card } from "@wraps/ui/components/ui/card";
import {
  AlertTriangle,
  ChevronRight,
  KeyRound,
  Package,
  Shield,
  Terminal,
} from "lucide-react";
import type { Metadata } from "next";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { JsonLd } from "@/components/json-ld";
import { CodeBlock } from "./page-content";

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "A Python Email SDK for Your Own SES",
  description:
    "wraps-email 0.1.0 is on PyPI. It signs SigV4 straight against SES in your AWS account — no Wraps API key, no Wraps server in the request path.",
  datePublished: "2026-07-15T00:00:00.000Z",
  dateModified: "2026-08-18T00:00:00.000Z",
  author: {
    "@type": "Organization",
    name: "Wraps",
    url: "https://wraps.dev",
    description:
      "Email infrastructure experts building tools to deploy production-ready email systems to AWS.",
    sameAs: ["https://github.com/wraps-team", "https://twitter.com/wrapsdev"],
  },
  publisher: {
    "@type": "Organization",
    name: "Wraps",
    logo: {
      "@type": "ImageObject",
      url: "https://wraps.dev/logo.png",
    },
  },
  mainEntityOfPage: {
    "@type": "WebPage",
    "@id": "https://wraps.dev/blog/python-email-sdk",
  },
};

export const metadata: Metadata = {
  title: "A Python Email SDK for Your Own SES",
  description:
    "wraps-email 0.1.0 is on PyPI. It signs SigV4 straight against SES in your AWS account — no Wraps API key, no Wraps server in the request path.",
  openGraph: {
    title: "A Python Email SDK for Your Own SES | Wraps",
    description:
      "wraps-email 0.1.0: send, batch, attachments, SES templates, and suppression from Python, signed directly against your own SES.",
    type: "article",
    url: "https://wraps.dev/blog/python-email-sdk",
    publishedTime: "2026-07-15T00:00:00.000Z",
    authors: ["Wraps Team"],
  },
  twitter: {
    card: "summary_large_image",
    title: "A Python Email SDK for Your Own SES | Wraps",
    description:
      "wraps-email 0.1.0: send, batch, attachments, SES templates, and suppression from Python, signed directly against your own SES.",
  },
  alternates: {
    canonical: "https://wraps.dev/blog/python-email-sdk",
  },
};

export default function Page() {
  return (
    <>
      <JsonLd data={articleSchema} />
      <div className="min-h-screen bg-background text-foreground">
        <LandingNavbar />

        {/* Hero */}
        <header className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-900/20 via-transparent to-transparent" />
          <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg width=%2260%22 height=%2260%22 viewBox=%220 0 60 60%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cg fill=%22none%22 fill-rule=%22evenodd%22%3E%3Cg fill=%22%239C92AC%22 fill-opacity=%220.03%22%3E%3Cpath d=%22M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%22/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')] opacity-50" />

          <div className="relative mx-auto max-w-4xl px-6 pt-20 pb-16">
            <div className="mb-4 flex items-center gap-2 font-medium text-orange-600 text-sm dark:text-orange-400">
              <Package size={16} />
              <span>Product</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">9 min read</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">Wraps Team</span>
              <span className="text-muted-foreground/50">&bull;</span>
              <span className="text-muted-foreground">July 15, 2026</span>
            </div>

            <h1 className="mb-6 font-bold text-4xl leading-tight md:text-5xl lg:text-6xl">
              A Python Email SDK
              <span className="block bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent dark:from-orange-400 dark:to-amber-400">
                for Your Own SES
              </span>
            </h1>

            <p className="max-w-2xl text-muted-foreground text-xl leading-relaxed">
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-base">
                wraps-email
              </code>{" "}
              landed on PyPI on Monday. It signs SigV4 against SES in your AWS
              account. There is no Wraps API key and no Wraps server in the
              request path.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Terminal
                  className="text-orange-600 dark:text-orange-400"
                  size={16}
                />
                <span className="text-foreground/80 text-sm">
                  pip install wraps-email
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <Shield
                  className="text-orange-600 dark:text-orange-400"
                  size={16}
                />
                <span className="text-foreground/80 text-sm">
                  SigV4 straight to SES
                </span>
              </div>
              <div className="flex items-center gap-2 rounded-full border bg-muted/30 px-4 py-2">
                <KeyRound
                  className="text-orange-600 dark:text-orange-400"
                  size={16}
                />
                <span className="text-foreground/80 text-sm">
                  Python 3.10 &ndash; 3.13
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-4xl space-y-16 px-6 py-16">
          {/* Problem */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              What you had to write yourself
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              If you send transactional email from Python and you own your SES
              account, you have had two options, and both of them cost you
              something.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Option one is boto3. It works &mdash; SESv2's{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">SendEmail</code>{" "}
              is right there, and the credential story is already solved. What
              isn't solved is everything shaped like an email API. Attachments
              mean switching the request to{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">Raw</code>{" "}
              content and hand-assembling a MIME message with the stdlib. Bcc
              handling is on you, and the obvious implementation leaks the Bcc
              addresses into the message headers. Sending a hundred distinct
              messages means writing your own concurrency and your own
              per-message result bookkeeping. Every response comes back as an
              untyped dict.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Option two is a vendor SDK. You get the ergonomics immediately,
              and you get them by putting someone else's API key in your
              environment and someone else's servers in your request path. Your
              sending reputation, your suppression list, and your delivery data
              stop being yours.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              <code className="rounded bg-muted px-1.5 py-0.5">
                wraps-email
              </code>{" "}
              is the third one: the ergonomics of a vendor SDK pointed at your
              own SES account.
            </p>
          </section>

          {/* Install / first send */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">Install and send</h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The distribution is{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                wraps-email
              </code>
              ; you import it as{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                wraps.email
              </code>
              .
            </p>

            <CodeBlock
              code={`pip install wraps-email
# or
uv add wraps-email`}
              title="terminal"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              A first send is four required arguments plus at least one body:
            </p>

            <CodeBlock
              code={`from wraps.email import WrapsEmail

email = WrapsEmail(region="us-east-1")

result = email.send(
    from_="you@yourdomain.com",
    to="user@example.com",
    subject="Hello from Python",
    html="<h1>It works</h1>",
    text="It works",
)
print(result.message_id, result.request_id)`}
              lang="python"
              title="send.py"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              Two things about that signature.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">send()</code> is
              entirely keyword-only &mdash; there is no positional form to get
              wrong. And the sender field is{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">from_</code> with
              a trailing underscore, because{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">from</code> is a
              Python keyword and cannot be a parameter name. That underscore is
              the one piece of ugliness the language forces on us, and we'd
              rather wear it than invent a synonym you have to look up.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Every recipient field &mdash;{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">to</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">cc</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">bcc</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">reply_to</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">from_</code>{" "}
              &mdash; takes a bare string, an{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                EmailAddress
              </code>{" "}
              with a display name, or a list mixing both:
            </p>

            <CodeBlock
              code={`from wraps.email import EmailAddress, WrapsEmail

email = WrapsEmail(region="us-east-1")

email.send(
    from_=EmailAddress(email="you@yourdomain.com", name="Acme Support"),
    to=["a@example.com", EmailAddress(email="b@example.com", name="Bee")],
    reply_to="support@yourdomain.com",
    subject="Hi",
    text="hi",
    configuration_set_name="wraps-email-default",
    tags={"campaign": "welcome"},
)`}
              lang="python"
              title="addresses.py"
            />

            <p className="mt-4 text-foreground/80 text-lg leading-relaxed">
              Configuration sets and message tags are pass-through, so the
              events you already collect keep flowing the way they did before.
            </p>
          </section>

          {/* No Wraps in the path */}
          <section>
            <h2 className="mb-6 flex items-center gap-3 font-bold text-3xl">
              <Shield className="text-orange-600 dark:text-orange-400" />
              There is no Wraps in the request path
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              This is the part worth being precise about, because it is the
              whole reason the SDK exists. When you call{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                email.send(...)
              </code>
              , the request that leaves your process looks like this:
            </p>

            <CodeBlock
              code={`POST https://email.us-east-1.amazonaws.com/v2/email/outbound-emails
Authorization: AWS4-HMAC-SHA256 Credential=AKIA.../20260715/us-east-1/ses/aws4_request, SignedHeaders=...`}
              lang="text"
              title="the wire"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              That's it. An SESv2 endpoint in your region, signed with your
              credentials, scoped to the{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">ses</code>{" "}
              service. There is no Wraps hostname anywhere in the package, no
              Wraps API key to configure, and no Wraps account required to use
              it. Install the library and it talks to AWS.
            </p>

            <Card className="p-6">
              <p className="text-foreground/80 leading-relaxed">
                The practical consequence: your SES quota, your sending
                reputation, your suppression list, and your CloudWatch metrics
                stay exactly where they were. If Wraps disappeared tomorrow,
                your sends would keep working, because nothing of ours is
                between your process and{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  email.us-east-1.amazonaws.com
                </code>
                .
              </p>
            </Card>
          </section>

          {/* Credentials */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              Credentials come from the chain you already have
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Nothing about auth is bespoke. If your environment can already run{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">aws ses</code>{" "}
              commands, the SDK is configured. Resolution runs in a documented
              priority order: explicit static credentials, then{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">role_arn</code>{" "}
              assume-role, then a named{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">profile</code>,
              then the standard chain &mdash; environment variables, shared
              config, SSO, OIDC/web-identity, IMDS, and container credentials.
            </p>

            <CodeBlock
              code={`from wraps.email import WrapsEmail

# whatever the environment already provides:
# env vars, ~/.aws/config, SSO, OIDC, IMDS, ECS task role
email = WrapsEmail(region="us-east-1")

# a named profile
email = WrapsEmail(region="us-east-1", profile="prod")

# assume a role - refreshable STS credentials
email = WrapsEmail(
    region="us-east-1",
    role_arn="arn:aws:iam::123456789012:role/email-sender",
)

# explicit static credentials
email = WrapsEmail(
    region="us-east-1",
    credentials={"access_key_id": "AKIA...", "secret_access_key": "..."},
)`}
              lang="python"
              title="credentials.py"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              Temporary credentials refresh on their own. The signer asks for a
              fresh frozen snapshot on every single request rather than caching
              one at construction, so a long-lived worker holding a client
              across an SSO or assume-role expiry keeps signing valid requests
              instead of failing an hour in.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              When nothing resolves, you get a{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                CredentialsError
              </code>{" "}
              whose message lists every option &mdash; SSO, access keys, env
              vars, a named profile &mdash; without ranking them. That's the
              same rule the Wraps CLI follows. We don't know which auth method
              your org standardized on, so we don't guess.
            </p>
          </section>

          {/* Transport */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              The wire layer does no I/O
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              There are three runtime dependencies:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">httpx</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">botocore</code>,
              and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">pydantic</code>.
              Notably not{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">boto3</code>{" "}
              &mdash; and that is an architecture decision, not a footprint one.
              Botocore is used for exactly two things: SigV4 signing and
              credential-chain resolution. Both are hard, both are already
              solved, and neither one needs to own the SES request. No botocore
              client is constructed for SES at all &mdash; the only botocore
              client this package ever builds is an STS client, and only when
              you pass{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">role_arn</code>.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Every SES operation lives in an internal{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">_transport</code>{" "}
              package as a pure function that returns a request descriptor
              &mdash; a{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                (method, url, headers, body)
              </code>{" "}
              tuple. Twelve builders, six parsers, no network:
            </p>

            <CodeBlock
              code={`def build_send_email(
    *, region: str, from_address: str, to: list[str], subject: str,
    cc=None, bcc=None, reply_to=None, html=None, text=None,
    configuration_set_name=None, tags=None,
) -> tuple[str, str, dict[str, str], bytes]:
    ...
    body = json.dumps(payload).encode("utf-8")
    url = f"{endpoint(region)}/v2/email/outbound-emails"
    headers = {"Content-Type": "application/json"}
    return "POST", url, headers, body`}
              lang="python"
              title="_transport/ses.py"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              Signing is the same shape: a function that takes that tuple plus a
              credential snapshot and returns signed headers. Which means the
              client itself is a thin driver. Its entire I/O surface &mdash; for
              sends, batches, template CRUD, and every suppression call &mdash;
              is one method:
            </p>

            <CodeBlock
              code={`def _request(self, method, url, headers, body) -> httpx.Response:
    """Sign a request with SigV4 and send it. Shared by all operations."""
    signed = sign(
        method=method, url=url, headers=headers, body=body,
        service=ses.SERVICE, region=self._region, creds=self._creds.frozen(),
    )
    return self._http.request(method, url, headers=signed, content=body)`}
              lang="python"
              title="client.py"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              We shaped it that way deliberately. An async client is the next
              thing on the roadmap, and when it lands it changes the last line
              of that method and nothing else &mdash; no second copy of the
              request builders, no second signing path, no drift between the two
              over time. A boto3 client would have owned the socket and forced
              two parallel implementations instead.
            </p>

            <div className="rounded-lg border-destructive border-l-4 bg-destructive/10 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium">
                    To be clear: 0.1.0 is sync only.
                  </p>
                  <p className="mt-2 text-foreground/80 leading-relaxed">
                    There is no{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      AsyncWrapsEmail
                    </code>{" "}
                    in this release and nothing you can{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      await
                    </code>
                    . The seam described above is the groundwork for one, not
                    evidence of one. If you're on an event loop today, you'll
                    need a thread-pool executor until the async client ships.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Attachments */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              Attachments, and where Bcc goes
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Pass{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                attachments
              </code>{" "}
              and the send switches from SESv2's{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">Simple</code>{" "}
              content to a base64 raw MIME message. You don't opt in; the
              presence of an attachment is the signal.
            </p>

            <CodeBlock
              code={`from wraps.email import Attachment, WrapsEmail

email = WrapsEmail()

email.send(
    from_="you@yourdomain.com",
    to="user@example.com",
    bcc="audit@yourdomain.com",
    subject="Your report",
    html="<p>Attached.</p>",
    attachments=[
        Attachment(
            filename="report.csv",
            content="a,b\\n1,2\\n",
            content_type="text/csv",
        ),
    ],
)`}
              lang="python"
              title="attachment.py"
            />

            <p className="mt-4 text-foreground/80 text-lg leading-relaxed">
              Note the{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">bcc</code> in
              that call. This is the detail hand-rolled MIME gets wrong most
              often: the assembled message has no{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">Bcc:</code>{" "}
              header at all. The address rides the SES envelope on{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                Destination.BccAddresses
              </code>{" "}
              instead, which is the only place it can go without every recipient
              seeing it. There's a test that decodes the raw MIME back through
              the stdlib parser to assert that header stays absent.
            </p>
          </section>

          {/* Templates, batch, suppression */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              Templates, batches, suppression
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              SES-stored templates get full CRUD plus a paginated list, and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                send_template
              </code>{" "}
              renders them server-side. The template is named by{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">template</code>{" "}
              and its variables go in{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">data</code>{" "}
              &mdash; not{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                template_name
              </code>{" "}
              or{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                template_data
              </code>
              , which is what most people reach for first.
            </p>

            <CodeBlock
              code={`from wraps.email import WrapsEmail

email = WrapsEmail()

email.templates.create(
    name="welcome",
    subject="Hi {{name}}",
    html="<h1>Welcome, {{name}}</h1>",
)

email.send_template(
    template="welcome",
    from_="you@yourdomain.com",
    to="user@example.com",
    data={"name": "Sam"},
)`}
              lang="python"
              title="templates.py"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              <code className="rounded bg-muted px-1.5 py-0.5">send_batch</code>{" "}
              takes N distinct messages and returns per-entry results aligned to
              input order. It does not abort on a partial failure &mdash; a
              rejected address in position 3 doesn't cost you positions 4
              through 200. Malformed entries are a different story: those are
              rejected before anything is sent at all, so you never end up
              halfway through a batch discovering a typo.
            </p>

            <CodeBlock
              code={`from wraps.email import WrapsEmail

email = WrapsEmail()

result = email.send_batch(
    [
        {"from_": "you@yourdomain.com", "to": "a@example.com",
         "subject": "Hi", "text": "1"},
        {"from_": "you@yourdomain.com", "to": "b@example.com",
         "subject": "Hi", "text": "2"},
    ],
    max_concurrency=10,
)

print(result.success_count, result.failure_count)
for entry in result.results:          # aligned to input order
    if not entry.success:
        print(entry.index, entry.error_code, entry.error)`}
              lang="python"
              title="batch.py"
            />

            <p className="mt-4 mb-4 text-foreground/80 text-lg leading-relaxed">
              Suppression is the account-level SES list, not a Wraps-side copy.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">get()</code>{" "}
              returns{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">None</code>{" "}
              rather than raising when an address isn't suppressed, so a
              pre-send check is a plain truthiness test:
            </p>

            <CodeBlock
              code={`from wraps.email import WrapsEmail

email = WrapsEmail()

entry = email.suppression.get("bad@example.com")
if entry:
    print(f"{entry.email} suppressed: {entry.reason} at {entry.last_update_time}")
else:
    print("not suppressed")

email.suppression.add("worse@example.com", "COMPLAINT")
page = email.suppression.list(reason="BOUNCE", page_size=20)
email.suppression.remove("worse@example.com")`}
              lang="python"
              title="suppression.py"
            />

            <p className="mt-4 text-foreground/80 text-lg leading-relaxed">
              One inconsistency worth flagging before it bites you:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                templates.create
              </code>{" "}
              and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                templates.update
              </code>{" "}
              are keyword-only, while{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                templates.get
              </code>{" "}
              and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                templates.delete
              </code>{" "}
              take the name positionally.
            </p>
          </section>

          {/* Errors */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              Errors you can branch on
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              Nobody should be parsing exception strings to decide whether to
              retry. Every failure mode carries structured fields.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">SESError</code>{" "}
              gives you{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">.code</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">.status</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                .request_id
              </code>
              , and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">.retryable</code>
              , where retryable means 5xx or throttling and nothing else &mdash;
              a 400 for an unverified sender is never going to succeed on retry
              and won't be marked as though it might.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                ValidationError
              </code>{" "}
              carries{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">.field</code> and
              is raised before any AWS call happens.
            </p>

            <CodeBlock
              code={`from wraps.email import CredentialsError, SESError, ValidationError, WrapsEmail

email = WrapsEmail()

try:
    email.send(
        from_="you@yourdomain.com",
        to="user@example.com",
        subject="Hi",
        html="<p>Hi</p>",
    )
except ValidationError as err:
    print("bad input, no AWS call was made:", err.field)
except CredentialsError:
    print("no AWS credentials resolved")
except SESError as err:
    print(err.code, err.status, err.request_id, err.retryable)`}
              lang="python"
              title="errors.py"
            />

            <div className="mt-4 rounded-lg border-destructive border-l-4 bg-destructive/10 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="font-medium">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      except WrapsEmailError
                    </code>{" "}
                    does not catch credential failures.
                  </p>
                  <p className="mt-2 text-foreground/80 leading-relaxed">
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      ValidationError
                    </code>
                    ,{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      SESError
                    </code>
                    , and{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      BatchError
                    </code>{" "}
                    all subclass{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      WrapsEmailError
                    </code>
                    .{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      CredentialsError
                    </code>{" "}
                    subclasses plain{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      Exception
                    </code>{" "}
                    &mdash; it comes from the credential layer, which sits below
                    the email API and fails before an email error is even
                    meaningful. Catch it explicitly, or catch both.
                  </p>
                  <p className="mt-2 text-foreground/80 leading-relaxed">
                    <strong className="text-foreground">Update (0.2.0):</strong>{" "}
                    fixed.{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      CredentialsError
                    </code>{" "}
                    now subclasses{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      WrapsEmailError
                    </code>
                    , so the single catch really does cover everything. It is
                    also raised from{" "}
                    <code className="rounded bg-muted px-1.5 py-0.5">
                      send()
                    </code>{" "}
                    rather than the constructor &mdash; credential resolution is
                    lazy now, so constructing a client does no I/O.
                  </p>
                </div>
              </div>
            </div>

            <p className="mt-4 text-foreground/80 text-lg leading-relaxed">
              A second sharp edge, since it would be easy to assume otherwise:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">BatchError</code>{" "}
              is exported but nothing in 0.1.0 raises it.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">send_batch</code>{" "}
              reports partial failure through its return value, by design. The
              type is there for callers who want to raise their own.
            </p>

            <p className="mt-4 text-foreground/80 text-lg leading-relaxed">
              <strong className="text-foreground">Update (0.2.0):</strong>{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">BatchError</code>{" "}
              is gone. A dead export invited exactly the wrong assumption, so
              0.2.0 removed it rather than keep exporting a class nothing
              raises.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">send_batch</code>{" "}
              still reports partial failure through its return value &mdash;
              that part was always the design.
            </p>
          </section>

          {/* What's not in 0.1.0 */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">What's not in 0.1.0</h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              This is a first release and it is narrower than{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                @wraps.dev/email
              </code>
              , which has had a lot longer to grow. The send path is at parity
              &mdash; send, batch, attachments, templates, suppression, and the
              full credential chain all exist in both. Here is what the
              TypeScript SDK has that Python doesn't:
            </p>

            <div className="space-y-4">
              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">An async client</h3>
                <p className="text-foreground/80 leading-relaxed">
                  The largest gap, and the reason the transport is shaped the
                  way it is. Sync only today.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  Inbound email and event history
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  Reading received mail out of S3 and querying delivery events
                  out of DynamoDB are both TypeScript-only. If you need them
                  from Python today, the events are in your own account &mdash;
                  boto3 can read them directly.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  Reply threading and signed reply tokens
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  The HMAC reply-token codec has no Python implementation yet,
                  so a Python agent can't verify a token the TypeScript SDK
                  signed.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    send_bulk_template
                  </code>{" "}
                  and automatic HTML&rarr;text
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  One template rendered to many destinations in a single SESv2
                  call isn't wired up &mdash;{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    send_batch
                  </code>{" "}
                  covers the same ground with independent sends. And if you want
                  a plain-text alternative, pass{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">text</code>{" "}
                  yourself; nothing derives it from your HTML. The TypeScript
                  SDK's address validation and CRLF header-injection guard
                  aren't ported either, so sanitize addresses that came from
                  user input before you hand them over.
                </p>
              </div>

              <div className="rounded-lg border p-5">
                <h3 className="mb-1 font-medium">
                  React Email rendering &mdash; and why that one isn't coming
                </h3>
                <p className="text-foreground/80 leading-relaxed">
                  The TypeScript SDK renders React Email components to HTML.
                  There is no Python equivalent to port and we're not going to
                  invent one. Author templates wherever your templating already
                  lives, or store them in SES and use{" "}
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    send_template
                  </code>
                  .
                </p>
              </div>
            </div>

            <p className="mt-4 text-foreground/80 text-lg leading-relaxed">
              There is also no{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">wraps-sms</code>,{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                wraps-client
              </code>
              , or MCP server for Python. The{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">wraps</code>{" "}
              package is a PEP 420 implicit namespace &mdash; there is no{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                wraps/__init__.py
              </code>{" "}
              in the wheel &mdash; specifically so a future distribution can
              install{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">wraps/sms/</code>{" "}
              beside{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">
                wraps/email/
              </code>{" "}
              without either one owning the top-level name. That's plumbing for
              a package that doesn't exist yet, not a promise about when it
              will.
            </p>
          </section>

          {/* How it's built */}
          <section>
            <h2 className="mb-6 font-bold text-3xl">
              How it's built and shipped
            </h2>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              The package is managed with uv, linted and formatted with ruff,
              type-checked with ty, and models every input and result with
              Pydantic v2. It ships{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">py.typed</code>,
              so mypy, ty, and Pyright check your call sites and your editor
              autocompletes the keyword arguments instead of guessing at{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">**kwargs</code>.
              CI runs the test suite against Python 3.10, 3.11, 3.12, and 3.13
              &mdash; all four classifiers are tested, not just declared.
            </p>

            <p className="mb-4 text-foreground/80 text-lg leading-relaxed">
              There are 17 tests and they all pass. That is a modest suite for a
              first release and we're not going to dress it up as more than it
              is. What they do have going for them is where they cut: every one
              of them intercepts httpx at the transport boundary with{" "}
              <code className="rounded bg-muted px-1.5 py-0.5">respx</code> and
              asserts on the actual signed HTTP request &mdash; the URL, the
              headers, the JSON body &mdash; rather than on a mock of our own
              code. The attachment tests go one step further and decode the
              base64 MIME back through the standard library parser.
            </p>

            <p className="text-foreground/80 text-lg leading-relaxed">
              Publishing runs on PyPI Trusted Publishing over OIDC, so there is
              no PyPI token stored anywhere in the repo or its secrets. Pushing
              a <code className="rounded bg-muted px-1.5 py-0.5">email-v*</code>{" "}
              tag re-runs ruff, ty, and the tests, and only then builds and
              uploads. It felt wrong to hold a long-lived publishing credential
              at a company whose pitch is that it doesn't hold your credentials
              either.
            </p>
          </section>

          {/* Continue reading */}
          <section className="space-y-4">
            <h2 className="font-bold text-2xl">Continue reading</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/docs/python-sdk-reference"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Python SDK Reference
                </h3>
                <p className="text-muted-foreground text-sm">
                  Every method, parameter, model, and error type in 0.1.0
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/docs/sdk-reference"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  TypeScript SDK Reference
                </h3>
                <p className="text-muted-foreground text-sm">
                  What <code>@wraps.dev/email</code> covers that Python doesn't
                  yet
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="/docs/quickstart/email"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  Email Quickstart
                </h3>
                <p className="text-muted-foreground text-sm">
                  Standing up SES in your own AWS account from scratch
                </p>
              </a>
              <a
                className="group rounded-xl border p-4 transition-colors hover:border-primary/50"
                href="https://pypi.org/project/wraps-email/"
                rel="noopener"
                target="_blank"
              >
                <h3 className="font-semibold group-hover:text-primary">
                  wraps-email on PyPI
                </h3>
                <p className="text-muted-foreground text-sm">
                  Source lives at github.com/wraps-team/wraps-py
                </p>
              </a>
            </div>
          </section>

          {/* CTA */}
          <section className="relative">
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-r from-orange-500/10 to-amber-500/10 blur-xl" />
            <Card className="relative p-8 text-center md:p-12">
              <h2 className="mb-4 font-bold text-3xl md:text-4xl">
                One install, your own SES
              </h2>
              <p className="mx-auto mb-8 max-w-lg text-muted-foreground">
                No API key to provision, no account to create. If your
                environment already has AWS credentials, you can send in the
                next five minutes.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                <div className="rounded-xl border bg-muted/30 px-6 py-3 font-mono text-orange-600 dark:text-orange-400">
                  pip install wraps-email
                </div>
                <a
                  className="flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 font-semibold text-white transition-colors hover:bg-orange-400"
                  href="/docs/python-sdk-reference"
                >
                  Read the Reference
                  <ChevronRight size={18} />
                </a>
              </div>
            </Card>
          </section>
        </main>

        <LandingFooter />
      </div>
    </>
  );
}
