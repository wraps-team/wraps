import { CloudUpload, Sparkles, UserPlus } from "lucide-react";

const items = [
  {
    icon: UserPlus,
    title: "Sign up free",
    description: "No credit card required.",
  },
  {
    icon: CloudUpload,
    title: "Connect your AWS",
    description: "Four CLI commands, or CloudFormation from your browser.",
  },
  {
    icon: Sparkles,
    title: "Build with AI",
    description: "Templates and workflows, no code required.",
  },
];

export function HowItWorksSection() {
  return (
    <section className="pb-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
          {items.map((item, index) => (
            <div
              className="rounded-lg border border-border bg-card p-4"
              key={item.title}
            >
              <div className="mb-3 flex items-center gap-2 font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
                <span className="h-px w-3 bg-orange-500" />
                {String(index + 1).padStart(2, "0")}
              </div>
              <div className="flex items-start gap-2.5">
                <item.icon
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <div>
                  <h3 className="mb-1 font-medium text-sm">{item.title}</h3>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
