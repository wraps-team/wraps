"use client";

import { ModeToggle } from "@wraps/ui/components/mode-toggle";
import { Button } from "@wraps/ui/components/ui/button";
import { XLogo } from "@/components/icons/x-logo";
import { Logo } from "@/components/logo";
import { Github } from "@/components/ui/svgs/brand-icons";
import { FOOTER_COLUMNS, GITHUB_URL } from "@/config/site-nav";

const LICENSE_URL = "https://github.com/wraps-team/wraps/blob/main/LICENSE";
const EE_LICENSE_URL =
  "https://github.com/wraps-team/wraps/blob/main/ee/LICENSE.md";

export function LandingFooter() {
  return (
    <footer className="border-border border-t bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-3 lg:grid-cols-[2.2fr_repeat(5,minmax(0,1fr))]">
          {/* Brand column */}
          <div className="col-span-2 grid content-start gap-4 md:col-span-3 lg:col-span-1">
            <a
              aria-label="Wraps home"
              className="block w-full max-w-sm"
              href="/"
            >
              <Logo className="aspect-[3/1] h-auto w-full" />
            </a>
            <p className="text-muted-foreground text-sm">
              Email on your own AWS.
            </p>
            <p className="max-w-sm text-muted-foreground text-sm">
              Sending runs in your AWS account; you pay AWS directly.
            </p>
            <div className="flex items-center gap-2">
              <Button asChild size="icon" variant="ghost">
                <a
                  aria-label="GitHub"
                  className="cursor-pointer"
                  href={GITHUB_URL}
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

          {FOOTER_COLUMNS.map((column) => (
            <nav aria-label={column.title} key={column.title}>
              <h2 className="mb-4 font-sans font-semibold text-foreground text-xs uppercase tracking-eyebrow">
                {column.title}
              </h2>
              <ul className="space-y-3 text-sm">
                {column.links.map((link) => (
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
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-border border-t pt-6 text-muted-foreground text-sm">
          <span>&copy; {new Date().getFullYear()} Wraps.</span>
          <p className="max-w-3xl">
            Open source under AGPLv3, except the enterprise (ee) directories,
            which are under a commercial license. The SDKs are MIT.{" "}
            <a
              className="underline underline-offset-4 hover:text-foreground"
              href={LICENSE_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              LICENSE
            </a>
            {" · "}
            <a
              className="underline underline-offset-4 hover:text-foreground"
              href={EE_LICENSE_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              ee/LICENSE.md
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
