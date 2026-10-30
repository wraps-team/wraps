import { Badge } from "@wraps/ui/components/ui/badge";
import { Card, CardContent } from "@wraps/ui/components/ui/card";

const tools = [
  {
    name: "list_recent_sends",
    write: false,
    description:
      "List recent sends from your email history table — who, what, when, and current status.",
    prompt: "“What did we send to acme.com this week?”",
  },
  {
    name: "get_email_event_log",
    write: false,
    description:
      "The full delivery event log for one message: Send, Delivery, Bounce, Complaint, Open, Click.",
    prompt: "“Why did the reset email to dana@ bounce?”",
  },
  {
    name: "verify_domain_status",
    write: false,
    description:
      "Verification and DKIM status of a sending domain, straight from SES.",
    prompt: "“Is mail.myapp.com verified yet?”",
  },
  {
    name: "list_suppressions",
    write: false,
    description:
      "Addresses on your SES suppression list, filterable by BOUNCE or COMPLAINT.",
    prompt: "“Who complained in the last import?”",
  },
  {
    name: "estimate_cost",
    write: false,
    description:
      "What a given send volume actually costs on Wraps + AWS, itemized — including whether the account is on the SES rate it should be.",
    prompt: "“What would 500K emails a month cost us?”",
  },
  {
    name: "send_email",
    write: true,
    description:
      "Send a transactional email through your SES account. Refuses to send until you set WRAPS_WRITE_ENABLED, and caps recipients per call.",
    prompt: "“Email the weekly report to the team.”",
  },
  {
    name: "check_send_status",
    write: false,
    description:
      "Poll the outcome of a send that's waiting on operator approval (enforced mode).",
    prompt: "“Did anyone approve that send yet?”",
  },
];

export function McpToolsSection() {
  return (
    <section className="bg-muted/30 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-3xl">
          <h2 className="mb-3 font-bold text-3xl tracking-tight sm:text-4xl">
            Your agent can answer email questions itself.
          </h2>
          <p className="text-lg text-muted-foreground">
            Deliverability debugging, domain checks, suppression lookups — the
            questions you'd open the AWS console for become one tool call in
            Claude Code, Claude Desktop, Cursor, or any MCP client.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <Card key={tool.name}>
              <CardContent className="p-5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="truncate font-mono text-sm">{tool.name}</p>
                  <Badge
                    className="shrink-0"
                    variant={tool.write ? "brand" : "outline"}
                  >
                    {tool.write ? "write" : "read"}
                  </Badge>
                </div>
                <p className="mb-3 text-muted-foreground text-sm">
                  {tool.description}
                </p>
                <p className="font-mono text-muted-foreground text-xs">
                  {tool.prompt}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
