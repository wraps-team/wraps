import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="container flex flex-col items-center gap-8 pt-24 pb-24 md:pt-32 md:pb-32">
      <div className="flex flex-col items-center gap-2">
        <div className="inline-flex items-center rounded-full border border-transparent bg-secondary px-2.5 py-0.5 font-semibold text-secondary-foreground text-xs transition-colors hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
          <span className="mr-1">●</span> Wraps is in beta
        </div>
      </div>
      <div className="flex max-w-[980px] flex-col items-center gap-4 text-center">
        <h1 className="text-balance font-bold text-4xl leading-tight tracking-tighter md:text-6xl lg:text-7xl lg:leading-[1.1]">
          Make AWS Feel Like
          <br />A Modern SaaS
        </h1>
        <p className="max-w-[750px] text-balance text-lg text-muted-foreground sm:text-xl">
          <span className="font-mono text-foreground">wraps</span> brings
          delightful developer experiences to AWS services. Start with email via
          SES, with a local console, metrics, and an SDK that just works.
        </p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row">
        <Button className="gap-2" size="lg">
          Get Started
        </Button>
        <Button
          className="gap-2 bg-transparent font-mono"
          size="lg"
          variant="outline"
        >
          npm i @wraps-js/email
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </section>
  );
}
