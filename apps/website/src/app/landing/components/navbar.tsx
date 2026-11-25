"use client";

import { Button } from "@wraps/ui/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wraps/ui/components/ui/collapsible";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@wraps/ui/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@wraps/ui/components/ui/sheet";
import { useTheme } from "@wraps/ui/hooks/use-theme";
import { ChevronDown, Menu, Moon, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";
import { Github } from "@/components/ui/svgs/brand-icons";
import { WrapsMotif } from "@/components/wraps-motif";
import {
  GITHUB_URL,
  NAV_MENUS,
  type NavMenu,
  SIGN_IN_URL,
  SIGN_UP_URL,
} from "@/config/site-nav";
import { trackEvent } from "@/utils/analytics";

// Smooth scroll function - only works when element exists on page
const smoothScrollTo = (targetId: string) => {
  const hash = targetId.startsWith("/#") ? targetId.slice(1) : targetId;
  if (hash.startsWith("#")) {
    const element = document.querySelector(hash);
    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return true;
    }
  }
  return false;
};

// Check if href is a hash link (starts with # or /#)
const isHashLink = (href: string) =>
  href.startsWith("#") || href.startsWith("/#");

export function LandingNavbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const { setTheme, theme } = useTheme();

  // Handle hash scrolling on page load (for navigation from other pages)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      // Small delay to ensure the page has rendered
      const timeoutId = setTimeout(() => {
        const element = document.querySelector(hash);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }
  }, []);

  return (
    <header className="sticky top-0 z-50 w-full border-border border-b bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="flex items-center">
          <a
            aria-label="Wraps home"
            className="flex cursor-pointer items-center"
            href="/"
          >
            <Logo size={42} />
          </a>
        </div>

        {/* Desktop Navigation */}
        <NavigationMenu className="hidden xl:flex">
          <NavigationMenuList>
            {NAV_MENUS.map((menu) => (
              <NavigationMenuItem key={menu.name}>
                {menu.groups ? (
                  <>
                    <NavigationMenuTrigger className="cursor-pointer">
                      {menu.name}
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <div className="flex gap-2 p-3">
                        {(menu.groups ?? []).map((group) => (
                          <div
                            className="grid min-w-56 flex-1 content-start gap-0.5"
                            key={group.heading ?? menu.name}
                          >
                            {group.heading && (
                              <span className="px-3 pt-1 pb-1.5 font-sans font-semibold text-muted-foreground text-xs uppercase tracking-eyebrow">
                                {group.heading}
                              </span>
                            )}
                            {group.links.map((link) => (
                              <NavigationMenuLink asChild key={link.name}>
                                <a
                                  className="block cursor-pointer select-none p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                  href={link.href}
                                >
                                  <div className="mb-1 font-medium text-sm leading-none">
                                    {link.name}
                                  </div>
                                  {link.description && (
                                    <p className="text-muted-foreground text-xs leading-snug">
                                      {link.description}
                                    </p>
                                  )}
                                </a>
                              </NavigationMenuLink>
                            ))}
                          </div>
                        ))}
                        {menu.feature && (
                          <NavigationMenuLink asChild>
                            <a
                              className="relative flex w-52 shrink-0 flex-col gap-2 bg-terminal p-4 text-terminal-foreground no-underline outline-none hover:bg-terminal hover:text-terminal-foreground focus:bg-terminal focus:text-terminal-foreground focus-visible:bg-terminal focus-visible:text-terminal-foreground focus-visible:ring-2 focus-visible:ring-ring"
                              href={menu.feature.href}
                            >
                              <WrapsMotif
                                aria-hidden="true"
                                className="h-6 w-6 text-brand"
                              />
                              <span className="font-semibold text-sm">
                                {menu.feature.name}
                              </span>
                              <span className="text-terminal-muted text-xs leading-snug">
                                {menu.feature.description}
                              </span>
                              <span className="mt-1 font-semibold text-brand text-sm">
                                {menu.feature.cta} &rarr;
                              </span>
                            </a>
                          </NavigationMenuLink>
                        )}
                      </div>
                    </NavigationMenuContent>
                  </>
                ) : (
                  <NavigationMenuLink
                    className="group inline-flex h-10 w-max cursor-pointer items-center justify-center"
                    href={menu.href}
                    onClick={(e) => {
                      // Smooth scroll for hash links when the element is on this page;
                      // otherwise the browser navigates to /#hash.
                      if (
                        menu.href &&
                        isHashLink(menu.href) &&
                        smoothScrollTo(menu.href)
                      ) {
                        e.preventDefault();
                      }
                    }}
                  >
                    {menu.name}
                  </NavigationMenuLink>
                )}
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

        {/* Desktop CTA */}
        <div className="hidden items-center space-x-2 xl:flex">
          <Button
            asChild
            className="cursor-pointer"
            size="icon"
            variant="ghost"
          >
            <a
              aria-label="GitHub Repository"
              href={GITHUB_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Github aria-hidden="true" className="h-5 w-5" />
            </a>
          </Button>
          <Button asChild className="cursor-pointer" variant="ghost">
            <a href={SIGN_IN_URL}>Log in</a>
          </Button>
          <Button asChild className="cursor-pointer" variant="brand">
            <a
              href={SIGN_UP_URL}
              onClick={() =>
                trackEvent("cta_click", {
                  location: "navbar_desktop",
                  cta_text: "Start free",
                })
              }
            >
              Start free
            </a>
          </Button>
        </div>

        {/* Mobile Menu */}
        <Sheet onOpenChange={setIsOpen} open={isOpen}>
          <SheetTrigger asChild className="xl:hidden">
            <Button className="cursor-pointer" size="icon" variant="ghost">
              <Menu aria-hidden="true" className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            className="flex h-dvh w-full flex-col gap-0 overflow-hidden p-0 sm:w-[400px] [&>button]:hidden"
            side="right"
          >
            <div className="flex h-full flex-col">
              {/* Header */}
              <SheetHeader className="space-y-0 p-4 pb-2">
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <div className="flex items-center gap-2">
                  <Logo size={24} />
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      aria-label={
                        theme === "light"
                          ? "Switch to dark mode"
                          : "Switch to light mode"
                      }
                      className="h-8 w-8 cursor-pointer"
                      onClick={() =>
                        setTheme(theme === "light" ? "dark" : "light")
                      }
                      size="icon"
                      variant="ghost"
                    >
                      <Moon
                        aria-hidden="true"
                        className="dark:-rotate-90 h-4 w-4 rotate-0 scale-100 transition-all motion-reduce:transition-none dark:scale-0"
                      />
                      <Sun
                        aria-hidden="true"
                        className="absolute h-4 w-4 rotate-90 scale-0 transition-all motion-reduce:transition-none dark:rotate-0 dark:scale-100"
                      />
                    </Button>
                    <Button
                      asChild
                      className="h-8 w-8 cursor-pointer"
                      size="icon"
                      variant="ghost"
                    >
                      <a
                        aria-label="GitHub Repository"
                        href={GITHUB_URL}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <Github aria-hidden="true" className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button
                      aria-label="Close menu"
                      className="h-8 w-8 cursor-pointer"
                      onClick={() => setIsOpen(false)}
                      size="icon"
                      variant="ghost"
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </SheetHeader>

              {/* Navigation Links */}
              <div className="flex-1 overflow-y-auto">
                <nav aria-label="Main" className="space-y-1 p-6">
                  {NAV_MENUS.map((menu) => (
                    <div key={menu.name}>
                      {menu.groups ? (
                        <Collapsible
                          onOpenChange={(open) =>
                            setOpenGroup(open ? menu.name : null)
                          }
                          open={openGroup === menu.name}
                        >
                          <CollapsibleTrigger asChild>
                            <button
                              className="flex w-full cursor-pointer items-center justify-between px-4 py-3 font-medium text-base focus-visible:ring-2 focus-visible:ring-ring"
                              type="button"
                            >
                              {menu.name}
                              <ChevronDown
                                aria-hidden="true"
                                className={`h-4 w-4 transition-transform motion-reduce:transition-none ${
                                  openGroup === menu.name ? "rotate-180" : ""
                                }`}
                              />
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-1 pl-4">
                            {(menu.groups ?? []).map((group) => (
                              <div key={group.heading ?? menu.name}>
                                {group.heading && (
                                  <span className="block px-4 pt-3 pb-1 font-sans font-semibold text-muted-foreground text-xs uppercase tracking-eyebrow">
                                    {group.heading}
                                  </span>
                                )}
                                {group.links.map((link) => (
                                  <a
                                    className="flex cursor-pointer flex-col px-4 py-2 transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                    href={link.href}
                                    key={link.name}
                                    onClick={() => setIsOpen(false)}
                                  >
                                    <span className="font-medium text-sm">
                                      {link.name}
                                    </span>
                                    {link.description && (
                                      <span className="text-muted-foreground text-xs">
                                        {link.description}
                                      </span>
                                    )}
                                  </a>
                                ))}
                              </div>
                            ))}
                            {menu.feature && (
                              <a
                                className="mt-2 flex flex-col gap-1 bg-terminal px-4 py-3 text-terminal-foreground focus-visible:ring-2 focus-visible:ring-ring"
                                href={menu.feature.href}
                                onClick={() => setIsOpen(false)}
                              >
                                <span className="font-semibold text-sm">
                                  {menu.feature.name}
                                </span>
                                <span className="font-semibold text-brand text-sm">
                                  {menu.feature.cta} &rarr;
                                </span>
                              </a>
                            )}
                          </CollapsibleContent>
                        </Collapsible>
                      ) : (
                        <a
                          className="flex cursor-pointer items-center gap-2 px-4 py-3 font-medium text-base transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          href={menu.href}
                          onClick={(e) => {
                            setIsOpen(false);
                            if (menu.href && isHashLink(menu.href)) {
                              const hash = menu.href.startsWith("/#")
                                ? menu.href.slice(1)
                                : menu.href;
                              const element = document.querySelector(hash);
                              if (element) {
                                e.preventDefault();
                                const target = menu.href;
                                setTimeout(() => smoothScrollTo(target), 100);
                              }
                            }
                          }}
                        >
                          {menu.name}
                        </a>
                      )}
                    </div>
                  ))}
                </nav>
              </div>

              {/* Footer Actions */}
              <div className="space-y-4 border-t p-6">
                <div className="space-y-3">
                  <Button
                    asChild
                    className="w-full cursor-pointer"
                    size="lg"
                    variant="brand"
                  >
                    <a
                      href={SIGN_UP_URL}
                      onClick={() => {
                        trackEvent("cta_click", {
                          location: "navbar_mobile",
                          cta_text: "Start free",
                        });
                        setIsOpen(false);
                      }}
                    >
                      Start free
                    </a>
                  </Button>

                  <Button
                    asChild
                    className="w-full cursor-pointer"
                    size="lg"
                    variant="outline"
                  >
                    <a href={SIGN_IN_URL} onClick={() => setIsOpen(false)}>
                      Log in
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
