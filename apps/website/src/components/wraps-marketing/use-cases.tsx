import { Card } from "@/components/ui/card";

export function UseCases() {
  return (
    <section className="container pb-24">
      <div className="mx-auto max-w-[980px]">
        <h2 className="mb-4 font-bold text-3xl leading-tight tracking-tighter md:text-4xl">
          Built for modern teams
        </h2>
        <p className="mb-12 max-w-[600px] text-muted-foreground leading-relaxed">
          Wraps gives you the power of AWS with the experience of modern SaaS
          tools. Deploy infrastructure in seconds, not hours.
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <h3 className="mb-2 font-bold text-lg">Email Infrastructure</h3>
            <p className="mb-4 text-muted-foreground text-sm leading-relaxed">
              Deploy production-ready email infrastructure with AWS SES. Track
              sends, bounces, and engagement in the local console.
            </p>
            <div className="rounded-lg bg-muted p-4 font-mono text-xs">
              <div className="mb-2 text-muted-foreground"># Deploy to AWS</div>
              <div>$ npx @wraps.dev/cli init</div>
              <div className="mt-2 text-green-400">
                ✓ SES configured in us-east-1
              </div>
              <div className="text-green-400">✓ Domain verified</div>
              <div className="text-green-400">✓ Ready to send emails</div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="mb-2 font-bold text-lg">Local Development</h3>
            <p className="mb-4 text-muted-foreground text-sm leading-relaxed">
              Run the Wraps console locally to view all your email data,
              metrics, and logs without touching the AWS Console.
            </p>
            <div className="rounded-lg bg-muted p-4 font-mono text-xs">
              <div className="mb-2 text-muted-foreground">
                # Start local console
              </div>
              <div>$ npx @wraps.dev/cli console</div>
              <div className="mt-2 text-blue-400">
                → Console running on localhost:3000
              </div>
              <div className="mt-2 text-muted-foreground">
                View emails, metrics, and lists
              </div>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
