import { CliTabs } from "./cli-tabs";

export function CliTabbedSection() {
  return (
    <section className="py-24" id="cli">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Header - server rendered */}
        <div className="mb-12 text-center animate-fade-in-up">
          <h2 className="mb-4 font-bold text-3xl tracking-tight md:text-4xl">
            Deploy to your AWS in one command.
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            One command deploys and configures SES, DynamoDB, Lambda, and
            EventBridge to your AWS. No console clicking. Configured for
            deliverability.
          </p>
        </div>

        {/* Interactive tabs - client component */}
        <div className="animate-fade-in-up animation-delay-100">
          <CliTabs />
        </div>
      </div>
    </section>
  );
}
