import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { Eye, ListChecks, ShieldCheck } from "lucide-react";
import Link from "next/link";

const layers = [
  {
    icon: Eye,
    title: "Read-only by default",
    description:
      "Out of the box, the server can look but not touch. send_email stays disabled until you set WRAPS_WRITE_ENABLED=true — an explicit decision, not a default you have to find and turn off.",
  },
  {
    icon: ListChecks,
    title: "Allowlists and caps for write mode",
    description:
      "When you do enable sending, you scope it: exact recipient addresses, allowed domains, a per-call recipient cap, and a locked from address. The agent sends what you permitted, nothing else.",
  },
  {
    icon: ShieldCheck,
    title: "Enforced mode for provisioned agents",
    description:
      "Provisioned agents get a credential that can only invoke an enforcer Lambda in your account — never SES directly. Kill-switch, allowlist, and hourly/daily caps are decided server-side, with operator approval for anything outside policy.",
  },
];

export function McpGuardrailsSection() {
  return (
    <section className="bg-muted/30 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-3xl">
          <h2 className="mb-3 font-bold text-3xl tracking-tight sm:text-4xl">
            An agent with a send button needs a leash.
          </h2>
          <p className="text-lg text-muted-foreground">
            Your SES account carries your domain reputation. The Wraps MCP
            server treats sending as the privileged operation it is — three
            layers, from cautious default to hard enforcement.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {layers.map((layer) => (
            <Card key={layer.title}>
              <CardContent className="p-6">
                <layer.icon className="mb-4 size-5 text-brand-text" />
                <p className="mb-2 font-medium">{layer.title}</p>
                <p className="text-muted-foreground text-sm">
                  {layer.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="mt-8 text-muted-foreground text-sm">
          Every guardrail variable is documented in{" "}
          <Link
            className="text-brand-text underline decoration-brand/30 underline-offset-4 hover:decoration-brand/60"
            href="/docs/mcp-reference"
          >
            the MCP reference
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
