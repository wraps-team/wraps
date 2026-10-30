import { Badge } from "@wraps/ui/components/ui/badge";
import {
  CheckCircle,
  Code,
  Eye,
  LayoutGrid,
  Palette,
  Sparkles,
} from "lucide-react";
import { SectionKicker } from "@/app/landing/components/section-kicker";
import { assetUrl } from "@/lib/utils";

const features = [
  {
    icon: Sparkles,
    title: "AI-Powered",
    description: "Generate emails from prompts",
    badge: "AI",
  },
  {
    icon: LayoutGrid,
    title: "React Email",
    description: "20+ typed components",
  },
  {
    icon: CheckCircle,
    title: "Every Client",
    description: "React Email powered",
  },
  {
    icon: Eye,
    title: "Live Preview",
    description: "Desktop, tablet, mobile",
  },
  {
    icon: Code,
    title: "Export",
    description: "HTML, JSON, React",
  },
  {
    icon: Palette,
    title: "Brand Kits",
    description: "Auto-apply your styles",
  },
];

export function DashboardTemplatesSection() {
  return (
    <section className="relative overflow-x-clip py-24" id="templates">
      {/* Chapter indicator */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="mb-14">
          <SectionKicker>Create</SectionKicker>
          <h2 className="font-heading font-semibold text-2xl tracking-tight sm:text-3xl">
            Build Templates
          </h2>
        </div>
      </div>

      {/* Full-width screenshot - larger on desktop */}
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:max-w-7xl lg:px-8 xl:max-w-[90rem]">
        <div className="relative overflow-hidden">
          {/* Light mode image */}
          <img
            alt="Template Editor - Light Mode"
            className="block w-full object-cover dark:hidden"
            decoding="async"
            loading="lazy"
            src={assetUrl("template-editor-full-light.webp")}
          />
          {/* Dark mode image */}
          <img
            alt="Template Editor - Dark Mode"
            className="hidden w-full object-cover dark:block"
            decoding="async"
            loading="lazy"
            src={assetUrl("template-editor-full-dark.webp")}
          />

          {/* Bottom fade effect */}
          <div className="absolute bottom-0 left-0 h-32 w-full bg-linear-to-t from-background via-background/80 to-transparent" />
        </div>
      </div>

      {/* Content below screenshot */}
      <div className="mx-auto max-w-5xl px-4 pt-12 sm:px-6 lg:px-8">
        <p className="mb-10 max-w-2xl text-lg text-muted-foreground">
          AI-first editor with raw code access. Built on React Email for
          pixel-perfect rendering across Gmail, Outlook, Apple Mail, and every
          other client.
        </p>

        {/* Feature Pills */}
        <div className="flex flex-wrap gap-3">
          {features.map((feature) => (
            <div
              className="flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 transition-colors hover:border-brand/40"
              key={feature.title}
            >
              <feature.icon
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              <span className="font-medium text-sm">{feature.title}</span>
              {feature.badge && (
                <Badge className="font-mono" variant="secondary">
                  {feature.badge}
                </Badge>
              )}
            </div>
          ))}
        </div>

        <p className="mt-8 text-muted-foreground text-sm">
          Included in all plans — even Free
        </p>
      </div>
    </section>
  );
}
