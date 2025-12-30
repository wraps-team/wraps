"use client";

import {
  ArrowRight,
  Code,
  Eye,
  Infinity as InfinityIcon,
  LayoutGrid,
  Palette,
  Sparkles,
} from "lucide-react";
import { Image3D } from "@/components/image-3d";
import { Button } from "@/components/ui/button";
import { assetUrl } from "@/lib/utils";
import { SectionWrapper } from "./section-card";

const features = [
  {
    icon: Sparkles,
    title: "AI-Powered Content",
    description: "Generate entire emails or refine sections with AI assistance",
    premium: true,
  },
  {
    icon: LayoutGrid,
    title: "20+ Drag & Drop Blocks",
    description: "Buttons, images, sections, layouts, and pre-built templates",
  },
  {
    icon: InfinityIcon,
    title: "Unlimited Templates",
    description:
      "Create as many templates as you need. No limits or per-template fees",
  },
  {
    icon: Eye,
    title: "Real-time Preview",
    description: "See your email on desktop, tablet, and mobile instantly",
  },
  {
    icon: Code,
    title: "Export to Code",
    description: "Export as React Email, HTML, or JSON for full flexibility",
  },
  {
    icon: Palette,
    title: "Brand Kits",
    description: "Apply your brand colors and styles automatically",
  },
];

function PlaceholderImage({
  alt,
  className,
}: {
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={`relative aspect-video w-full overflow-hidden rounded-2xl border-2 border-muted-foreground/25 border-dashed bg-muted/50 ${className}`}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex aspect-square size-16 items-center justify-center rounded-full border-2 border-orange-500 bg-orange-500/5">
          <LayoutGrid className="size-8 text-orange-500" />
        </div>
        <div>
          <p className="font-semibold text-foreground">{alt}</p>
          <p className="text-muted-foreground text-sm">
            Screenshot coming soon
          </p>
        </div>
      </div>
    </div>
  );
}

function ImageWithFallback({
  lightSrc,
  darkSrc,
  alt,
  className,
  direction,
}: {
  lightSrc: string;
  darkSrc: string;
  alt: string;
  className?: string;
  direction?: "left" | "right";
}) {
  return (
    <Image3D
      alt={alt}
      className={className}
      darkSrc={darkSrc}
      direction={direction}
      lightSrc={lightSrc}
    />
  );
}

export function TemplateEditorSection() {
  return (
    <SectionWrapper
      badge="Template Editor · Starter Plan"
      description="A professional-grade email builder with drag-and-drop components, AI generation, real-time preview, and one-click publishing to your AWS account."
      id="template-editor"
      premium
      title="Build Beautiful Emails with AI"
    >
      {/* Hero Image - Full Editor */}
      <div className="mb-16">
        <div className="group relative">
          {/* Background glow */}
          <div className="absolute top-2 left-1/2 mx-auto h-16 w-[70%] -translate-x-1/2 transform rounded-full bg-orange-500/10 blur-2xl lg:-top-4 lg:h-32" />

          <div className="relative overflow-hidden rounded-2xl border-2 bg-card shadow-2xl">
            {/* Light mode image */}
            <img
              alt="Template Editor - Light Mode"
              className="block w-full rounded-xl object-cover dark:hidden"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                e.currentTarget.nextElementSibling?.classList.remove("hidden");
              }}
              src={assetUrl("template-editor-full-light.webp")}
            />
            <div className="hidden dark:hidden">
              <PlaceholderImage alt="Template Editor Preview" />
            </div>

            {/* Dark mode image */}
            <img
              alt="Template Editor - Dark Mode"
              className="hidden w-full rounded-xl object-cover dark:block"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                e.currentTarget.nextElementSibling?.classList.remove("!hidden");
              }}
              src={assetUrl("template-editor-full-dark.webp")}
            />
            <div className="!hidden dark:!hidden">
              <PlaceholderImage alt="Template Editor Preview" />
            </div>

            {/* Bottom fade effect */}
            <div className="absolute bottom-0 left-0 h-32 w-full rounded-b-xl bg-linear-to-b from-background/0 via-background/70 to-background md:h-40" />
          </div>
        </div>
      </div>

      {/* Feature Cards Grid */}
      <div className="mb-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              className="rounded-xl border bg-background p-6 transition-all hover:border-orange-500/50"
              key={feature.title}
            >
              <div className="mb-4 flex aspect-square size-10 items-center justify-center rounded-full border-2 border-orange-500 bg-orange-500/5">
                <feature.icon className="size-5 text-orange-500" />
              </div>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="font-semibold text-lg">{feature.title}</h3>
                {"premium" in feature && feature.premium && (
                  <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-orange-600 text-xs dark:text-orange-400">
                    AI
                  </span>
                )}
              </div>
              <p className="text-muted-foreground text-sm">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Two-column: AI Panel + Blocks Palette */}
      <div className="mb-16 grid gap-12 lg:grid-cols-2 lg:gap-16">
        {/* AI Panel */}
        <div className="flex flex-col gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex aspect-square size-10 items-center justify-center rounded-full border-2 border-orange-500 bg-orange-500/5">
                <Sparkles className="size-5 text-orange-500" />
              </div>
              <h3 className="font-semibold text-xl">AI Content Assistant</h3>
            </div>
            <p className="text-muted-foreground">
              Generate entire email templates from a simple prompt, or refine
              individual sections. The AI understands your brand kit and
              maintains consistent styling across all generated content.
            </p>
            <ul className="space-y-2 text-muted-foreground text-sm">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                Quick prompts for welcome, newsletter, and more
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                Conversational chat interface
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                50 AI messages/month (more coming soon)
              </li>
            </ul>
          </div>
          <ImageWithFallback
            alt="AI Assistant Panel"
            className="mt-auto"
            darkSrc="template-editor-ai-dark.webp"
            direction="left"
            lightSrc="template-editor-ai-light.webp"
          />
        </div>

        {/* Blocks Palette */}
        <div className="flex flex-col gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex aspect-square size-10 items-center justify-center rounded-full border-2 border-orange-500 bg-orange-500/5">
                <LayoutGrid className="size-5 text-orange-500" />
              </div>
              <h3 className="font-semibold text-xl">Drag & Drop Components</h3>
            </div>
            <p className="text-muted-foreground">
              Choose from 20+ email-optimized components including buttons,
              images, sections, layouts, and pre-built template sections like
              headers, footers, and CTAs.
            </p>
            <ul className="space-y-2 text-muted-foreground text-sm">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                Email-optimized responsive components
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                Pre-built sections (Hero, Features, CTA)
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                Save and reuse custom blocks across templates
              </li>
            </ul>
          </div>
          <ImageWithFallback
            alt="Block Palette"
            className="mt-auto"
            darkSrc="template-editor-blocks-dark.webp"
            direction="right"
            lightSrc="template-editor-blocks-light.webp"
          />
        </div>
      </div>

      {/* CTA Buttons */}
      <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
        <Button
          asChild
          className="cursor-pointer bg-orange-500 hover:bg-orange-600"
          size="lg"
        >
          <a href="https://app.wraps.dev/auth?mode=signup&plan=starter">
            Start Building Templates
            <ArrowRight className="ml-2 h-4 w-4" />
          </a>
        </Button>
        <Button asChild className="cursor-pointer" size="lg" variant="outline">
          <a href="#pricing">View Pricing</a>
        </Button>
      </div>
      <p className="mt-4 text-center text-muted-foreground text-sm">
        Template editor included in Starter plan ($10/mo)
      </p>
    </SectionWrapper>
  );
}
