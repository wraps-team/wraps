"use client";

import { Github, Heart } from "lucide-react";
import { XLogo } from "@/components/icons/x-logo";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const footerLinks = {
  product: [
    { name: "Features", href: "#features" },
    { name: "Pricing", href: "#pricing" },
    { name: "Cost Calculator", href: "/calculator" },
    { name: "Quickstart", href: "/docs/quickstart" },
    { name: "CLI Reference", href: "/docs/cli-reference" },
    { name: "SDK Reference", href: "/docs/sdk-reference" },
  ],
  developers: [
    { name: "Documentation", href: "/docs" },
    {
      name: "TypeScript SDK",
      href: "https://github.com/wraps-team/wraps-js",
      external: true,
    },
    {
      name: "npm Package",
      href: "https://www.npmjs.com/package/@wraps.dev/email",
      external: true,
    },
    {
      name: "GitHub",
      href: "https://github.com/wraps-team/wraps",
      external: true,
    },
  ],
  resources: [
    { name: "FAQ", href: "#faq" },
    {
      name: "AWS SES Docs",
      href: "https://docs.aws.amazon.com/ses/",
      external: true,
    },
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
    {
      name: "License (AGPLv3)",
      href: "https://github.com/wraps-team/wraps/blob/main/LICENSE",
      external: true,
    },
  ],
};

export function LandingFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        {/* Main Footer Content */}
        <div className="grid grid-cols-4 gap-8 lg:grid-cols-6">
          {/* Brand Column */}
          <div className="col-span-4 max-w-2xl lg:col-span-2">
            <div className="mb-4 flex items-center max-lg:justify-center">
              <a className="flex cursor-pointer items-center" href="/">
                <Logo size={32} />
              </a>
            </div>
            <p className="mb-6 text-muted-foreground max-lg:flex max-lg:justify-center max-lg:text-center">
              Deploy production-ready email infrastructure to your AWS account.
              Own your data, pay AWS directly, and never lock in.
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
                  <Github className="h-4 w-4" />
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
                  <XLogo className="h-4 w-4" />
                </a>
              </Button>
            </div>
          </div>

          {/* Links Columns */}
          <div className="max-md:col-span-2 lg:col-span-1">
            <h4 className="mb-4 font-semibold">Product</h4>
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
            <h4 className="mb-4 font-semibold">Developers</h4>
            <ul className="space-y-3">
              {footerLinks.developers.map((link) => (
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
            <h4 className="mb-4 font-semibold">Resources</h4>
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
            <h4 className="mb-4 font-semibold">Legal</h4>
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
              <Heart className="h-4 w-4 fill-current text-red-500" />
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
              href="https://github.com/wraps-team/wraps/blob/main/LICENSE"
              rel="noopener noreferrer"
              target="_blank"
            >
              License (AGPLv3)
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
