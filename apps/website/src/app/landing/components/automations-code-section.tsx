import { Badge } from "@/components/ui/badge";
import { FadeIn } from "./animations";
import { AutomationsCodePanel } from "./automations-code-panel";

export function AutomationsCodeSection() {
  return (
    <section className="py-24" id="automations">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <FadeIn className="mx-auto mb-12 max-w-3xl text-center">
          <Badge className="mb-4 bg-orange-500/10 text-orange-600 dark:text-orange-400">
            Workflow Automations
          </Badge>
          <h2 className="mb-4 font-bold text-3xl tracking-tight md:text-4xl">
            Code it. Or{" "}
            <span className="bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">
              prompt AI to build it.
            </span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Developers define workflows in TypeScript and version them in git.
            AI generates them from a prompt. Both run on the Wraps platform.
          </p>
        </FadeIn>

        {/* Interactive panel */}
        <AutomationsCodePanel />
      </div>
    </section>
  );
}
