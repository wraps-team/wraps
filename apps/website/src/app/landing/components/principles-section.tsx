import { Cloud, GitPullRequest, ShieldCheck, Sparkles } from "lucide-react";

const principles = [
  {
    icon: GitPullRequest,
    title: "Code You Can Review",
    description:
      "Templates and workflows live in your repo. Review in PRs. Roll back bad deploys. No more 'don't edit while I'm editing.'",
    delay: "animation-delay-0",
  },
  {
    icon: ShieldCheck,
    title: "Type-Safe Everything",
    description:
      "TypeScript SDK. Typed template variables. Typed workflow definitions. Catch errors before they reach an inbox.",
    delay: "animation-delay-100",
  },
  {
    icon: Sparkles,
    title: "AI When You Want It",
    description:
      "Don't want to write code? AI generates templates and workflows from a prompt. You review the output, not a GUI.",
    delay: "animation-delay-200",
  },
  {
    icon: Cloud,
    title: "Sends Through Your AWS",
    description:
      "Your SES. Your DynamoDB. Your domain reputation. Pay AWS directly. Leave anytime, keep everything.",
    delay: "animation-delay-300",
  },
];

function DotGrid({
  position,
  fadeDirection,
}: {
  position: string;
  fadeDirection: "to-bottom-left" | "to-top-right";
}) {
  const rows = 8;
  const cols = 12;

  return (
    <div className={`absolute ${position}`}>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {Array.from({ length: rows * cols }).map((_, i) => {
          const row = Math.floor(i / cols);
          const col = i % cols;

          // Calculate opacity based on distance from corner
          let distance: number;
          if (fadeDirection === "to-bottom-left") {
            // Top-right corner: fade as we go down-left
            distance = (row + (cols - 1 - col)) / (rows + cols - 2);
          } else {
            // Bottom-left corner: fade as we go up-right
            distance = (rows - 1 - row + col) / (rows + cols - 2);
          }

          const opacity = Math.max(0, 1 - distance * 1.2);

          if (opacity <= 0.05) {
            return <div className="size-1" key={i} />;
          }

          return (
            <div
              className="size-1 rounded-full bg-orange-500 dark:bg-orange-400"
              key={i}
              style={{ opacity: opacity * 0.5 }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function PrinciplesSection() {
  return (
    <section className="relative overflow-hidden pt-6 pb-16 sm:pt-8 sm:pb-20">
      {/* Bottom-left Dot Grid */}
      <DotGrid fadeDirection="to-top-right" position="-bottom-4 -left-4" />

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Principles Grid */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {principles.map((principle) => {
            const Icon = principle.icon;
            return (
              <div
                className={`animate-fade-in-up ${principle.delay}`}
                key={principle.title}
              >
                <div className="group relative h-full overflow-hidden rounded-lg border border-zinc-200 bg-white p-4 pt-12 transition-all hover:border-orange-500/50 hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
                  {/* Large background icon */}
                  <div className="absolute -right-3 -top-3 opacity-[0.07] transition-opacity group-hover:opacity-[0.12]">
                    <Icon className="size-24 text-orange-500" />
                  </div>

                  {/* Small accent icon */}
                  <div className="absolute left-4 top-4">
                    <Icon className="size-5 text-orange-500" />
                  </div>

                  <h3 className="relative mb-1 font-semibold text-sm text-foreground">
                    {principle.title}
                  </h3>
                  <p className="relative text-muted-foreground text-xs leading-relaxed">
                    {principle.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
