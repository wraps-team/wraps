"use client";

import { ModeToggle } from "@wraps/ui/components/mode-toggle";
import { Button } from "@wraps/ui/components/ui/button";
import { Separator } from "@wraps/ui/components/ui/separator";
import { Heart } from "lucide-react";
import { XLogo } from "@/components/icons/x-logo";
import { Logo } from "@/components/logo";
import { Github } from "@/components/ui/svgs/brand-icons";
import { WrapsMotifLayers } from "@/components/wraps-motif-layers";

const footerLinks = {
  product: [
    { name: "CLI & SDK", href: "/cli" },
    { name: "Inbound Email", href: "/inbound" },
    { name: "Agents", href: "/agents" },
    { name: "MCP Server", href: "/mcp" },
    { name: "Platform", href: "/platform" },
    { name: "Pricing", href: "/#pricing" },
  ],
  developers: [
    { name: "Documentation", href: "/docs" },
    { name: "Quickstart", href: "/docs/quickstart" },
    { name: "CLI Reference", href: "/docs/cli-reference" },
    { name: "SDK Reference", href: "/docs/sdk-reference" },
    { name: "MCP Reference", href: "/docs/mcp-reference" },
    { name: "CDK Reference", href: "/docs/cdk-reference" },
    { name: "Pulumi Reference", href: "/docs/pulumi-reference" },
    { name: "llms.txt", href: "/llms.txt" },
  ],
  company: [
    { name: "About", href: "/about" },
    { name: "Contact", href: "/contact" },
    { name: "Why Wraps", href: "/why-wraps" },
    { name: "Changelog", href: "/changelog" },
  ],
  resources: [
    { name: "Compare", href: "/compare" },
    { name: "Email Tools", href: "/tools" },
    { name: "SES Cost Calculator", href: "/tools/ses-calculator" },
    {
      name: "Community",
      href: "https://github.com/wraps-team/wraps/discussions",
      external: true,
    },
    {
      name: "Report Issue",
      href: "https://github.com/wraps-team/wraps/issues",
      external: true,
    },
  ],
  legal: [
    { name: "Privacy Policy", href: "/privacy" },
    { name: "Terms of Service", href: "/terms" },
    {
      name: "License (AGPLv3)",
      href: "https://github.com/wraps-team/wraps/blob/main/LICENSE",
      external: true,
    },
  ],
};

export function LandingFooter() {
  return (
    <footer className="dark relative overflow-hidden border-border border-t bg-background text-foreground">
      <WrapsMotifLayers
        className="pointer-events-none absolute bottom-4 right-4 h-[280px] w-[310px] md:h-[340px] md:w-[375px]"
        strokeColor="#ff6600"
      />

      <div className="relative container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        {/* Main Footer Content */}
        <div className="grid grid-cols-4 gap-8 lg:grid-cols-7">
          {/* Brand Column */}
          <div className="col-span-4 max-w-2xl lg:col-span-2">
            <div className="mb-4 flex w-full items-center max-lg:justify-center">
              <a className="flex w-full cursor-pointer items-center" href="/">
                <Logo
                  style={{
                    width: "100%",
                    height: "auto",
                    aspectRatio: "3/1",
                    position: "relative",
                  }}
                />
              </a>
            </div>
            <p className="mb-6 text-muted-foreground max-lg:flex max-lg:justify-center max-lg:text-center">
              Deploy email infrastructure with tracking, suppression, and
              analytics to your AWS account. Own your data, pay AWS directly.
            </p>
            <div className="flex space-x-4 max-lg:justify-center">
              <Button asChild size="icon" variant="ghost">
                <a
                  aria-label="GitHub"
                  className="cursor-pointer"
                  href="https://github.com/wraps-team/wraps"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <Github aria-hidden="true" className="h-4 w-4" />
                </a>
              </Button>
              <Button asChild size="icon" variant="ghost">
                <a
                  aria-label="X"
                  className="cursor-pointer"
                  href="https://x.com/useWraps"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <XLogo aria-hidden="true" className="h-4 w-4" />
                </a>
              </Button>
              <ModeToggle variant="ghost" />
            </div>
          </div>

          {/* Links Columns */}
          <div className="max-md:col-span-2 lg:col-span-1">
            <h4 className="mb-4 font-mono font-semibold text-foreground text-xs uppercase tracking-[0.08em]">
              Product
            </h4>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.name}>
                  <a
                    className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                    href={link.href}
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="max-md:col-span-2 lg:col-span-1">
            <h4 className="mb-4 font-mono font-semibold text-foreground text-xs uppercase tracking-[0.08em]">
              Developers
            </h4>
            <ul className="space-y-3">
              {footerLinks.developers.map((link) => (
                <li key={link.name}>
                  <a
                    className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                    href={link.href}
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="max-md:col-span-2 lg:col-span-1">
            <h4 className="mb-4 font-mono font-semibold text-foreground text-xs uppercase tracking-[0.08em]">
              Company
            </h4>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.name}>
                  <a
                    className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                    href={link.href}
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="max-md:col-span-2 lg:col-span-1">
            <h4 className="mb-4 font-mono font-semibold text-foreground text-xs uppercase tracking-[0.08em]">
              Resources
            </h4>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.name}>
                  <a
                    className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                    href={link.href}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    target={link.external ? "_blank" : undefined}
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="max-md:col-span-2 lg:col-span-1">
            <h4 className="mb-4 font-mono font-semibold text-foreground text-xs uppercase tracking-[0.08em]">
              Legal
            </h4>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.name}>
                  <a
                    className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground"
                    href={link.href}
                    rel={link.external ? "noopener noreferrer" : undefined}
                    target={link.external ? "_blank" : undefined}
                  >
                    {link.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Separator className="my-8" />

        {/* Bottom Footer */}
        <div className="flex flex-col items-center justify-between gap-2 lg:flex-row">
          <div className="flex flex-col items-center gap-2 text-muted-foreground text-sm sm:flex-row">
            <div className="flex items-center gap-1">
              <span>Built with</span>
              <Heart
                aria-hidden="true"
                className="h-4 w-4 fill-current text-red-500"
              />
              <span className="sr-only">love</span>
              <span>for developers</span>
            </div>
            <span className="hidden sm:inline">•</span>
            <span>
              © {new Date().getFullYear()} Wraps. Open source under AGPLv3.
            </span>
          </div>
          <div className="mt-4 flex items-center space-x-4 text-muted-foreground text-sm md:mt-0">
            <a
              className="cursor-pointer transition-colors hover:text-foreground"
              href="/privacy"
            >
              Privacy
            </a>
            <span>•</span>
            <a
              className="cursor-pointer transition-colors hover:text-foreground"
              href="/terms"
            >
              Terms
            </a>
            <span>•</span>
            <a
              className="cursor-pointer transition-colors hover:text-foreground"
              href="https://github.com/wraps-team/wraps/blob/main/LICENSE"
              rel="noopener noreferrer"
              target="_blank"
            >
              License
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
