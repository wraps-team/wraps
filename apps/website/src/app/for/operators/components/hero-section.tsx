import { DotPattern } from "@wraps/ui/components/dot-pattern";
import { OperatorsHeroCTA } from "./hero-cta";
import { SendLedger } from "./send-ledger";

export function OperatorsHeroSection() {
  return (
    <section className="relative overflow-hidden bg-linear-to-b from-background to-background/80 pt-20 pb-16 sm:pt-28">
      <div className="absolute inset-0">
        <DotPattern className="opacity-100" fadeStyle="ellipse" size="md" />
      </div>

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-14">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
              <span className="size-1.5 rounded-full bg-orange-500" />
              <span>wraps · for email operations</span>
            </div>

            <h1 className="mb-6 text-pretty font-heading font-semibold text-4xl leading-tight tracking-tight sm:text-5xl">
              Your name is on the send.{" "}
              <span className="text-orange-500">So is the paper trail.</span>
            </h1>

            <p className="mb-6 max-w-md text-muted-foreground">
              Somebody has to answer for the complaint rate, prove that the
              person who unsubscribed stopped getting mail, and say what
              happened to one specific message. Wraps keeps that record — and
              the sending domain it describes stays in your AWS account.
            </p>

            <OperatorsHeroCTA />
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-orange-500/10 opacity-60 blur-2xl" />
            <div className="relative">
              <SendLedger />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
