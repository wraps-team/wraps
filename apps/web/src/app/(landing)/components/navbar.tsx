"use client";

import {
  ChevronDown,
  Github,
  LayoutDashboard,
  Menu,
  Moon,
  Sun,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { MegaMenu } from "@/components/landing/mega-menu";
import { Logo } from "@/components/logo";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useTheme } from "@/hooks/use-theme";

const navigationItems = [
  { name: "Home", href: "/landing" },
  { name: "Features", href: "#features" },
  { name: "Solutions", href: "#features", hasMegaMenu: true },
  { name: "Team", href: "#team" },
  { name: "Pricing", href: "#pricing" },
  { name: "FAQ", href: "#faq" },
  { name: "Contact", href: "#contact" },
];

// Solutions menu items for mobile
const solutionsItems = [
  { title: "Browse Products" },
  { name: "Free Blocks", href: "#free-blocks" },
  { name: "Premium Templates", href: "#premium-templates" },
  { name: "Admin Dashboards", href: "#admin-dashboards" },
  { name: "Landing Pages", href: "#landing-pages" },
  { title: "Categories" },
  { name: "E-commerce", href: "#ecommerce" },
  { name: "SaaS Dashboards", href: "#saas-dashboards" },
  { name: "Analytics", href: "#analytics" },
  { name: "Authentication", href: "#authentication" },
  { title: "Resources" },
  { name: "Documentation", href: "#docs" },
  { name: "Component Showcase", href: "#showcase" },
  { name: "GitHub Repository", href: "#github" },
  { name: "Design System", href: "#design-system" },
];

// Smooth scroll function
const smoothScrollTo = (targetId: string) => {
  if (targetId.startsWith("#")) {
    const element = document.querySelector(targetId);
    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }
};

export function LandingNavbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const { setTheme, theme } = useTheme();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="flex items-center space-x-2">
          <Link
            className="flex cursor-pointer items-center space-x-2"
            href="/landing"
          >
            <Logo size={32} />
            <span className="font-bold">ShadcnStore</span>
          </Link>
        </div>

        {/* Desktop Navigation */}
        <NavigationMenu className="hidden xl:flex">
          <NavigationMenuList>
            {navigationItems.map((item) => (
              <NavigationMenuItem key={item.name}>
                {item.hasMegaMenu ? (
                  <>
                    <NavigationMenuTrigger className="cursor-pointer bg-transparent px-4 py-2 font-medium text-sm transition-colors hover:bg-transparent hover:text-primary focus:bg-transparent focus:text-primary data-[active]:bg-transparent data-[state=open]:bg-transparent">
                      {item.name}
                    </NavigationMenuTrigger>
                    <NavigationMenuContent>
                      <MegaMenu />
                    </NavigationMenuContent>
                  </>
                ) : (
                  <NavigationMenuLink
                    className="group inline-flex h-10 w-max cursor-pointer items-center justify-center px-4 py-2 font-medium text-sm transition-colors hover:text-primary focus:text-primary focus:outline-none"
                    onClick={(e: React.MouseEvent) => {
                      e.preventDefault();
                      if (item.href.startsWith("#")) {
                        smoothScrollTo(item.href);
                      } else {
                        window.location.href = item.href;
                      }
                    }}
                  >
                    {item.name}
                  </NavigationMenuLink>
                )}
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

        {/* Desktop CTA */}
        <div className="hidden items-center space-x-2 xl:flex">
          <ModeToggle variant="ghost" />
          <Button
            asChild
            className="cursor-pointer"
            size="icon"
            variant="ghost"
          >
            <a
              aria-label="GitHub Repository"
              href="https://github.com/silicondeck/shadcn-dashboard-landing-template"
              rel="noopener noreferrer"
              target="_blank"
            >
              <Github className="h-5 w-5" />
            </a>
          </Button>
          <Button asChild className="cursor-pointer" variant="outline">
            <Link href="/dashboard" rel="noopener noreferrer" target="_blank">
              <LayoutDashboard className="mr-2 h-4 w-4" />
              Dashboard
            </Link>
          </Button>
          <Button asChild className="cursor-pointer" variant="ghost">
            <Link href="/auth/sign-in">Sign In</Link>
          </Button>
          <Button asChild className="cursor-pointer">
            <Link href="/auth/sign-up">Get Started</Link>
          </Button>
        </div>

        {/* Mobile Menu */}
        <Sheet onOpenChange={setIsOpen} open={isOpen}>
          <SheetTrigger asChild className="xl:hidden">
            <Button className="cursor-pointer" size="icon" variant="ghost">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:w-[400px] [&>button]:hidden"
            side="right"
          >
            <div className="flex h-full flex-col">
              {/* Header */}
              <SheetHeader className="space-y-0 border-b p-4 pb-2">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Logo size={16} />
                  </div>
                  <SheetTitle className="font-semibold text-lg">
                    ShadcnStore
                  </SheetTitle>
                  <div className="ml-auto flex items-center gap-2">
                    <Button
                      className="h-8 w-8 cursor-pointer"
                      onClick={() =>
                        setTheme(theme === "light" ? "dark" : "light")
                      }
                      size="icon"
                      variant="ghost"
                    >
                      <Moon className="dark:-rotate-90 h-4 w-4 rotate-0 scale-100 transition-all dark:scale-0" />
                      <Sun className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    </Button>
                    <Button
                      asChild
                      className="h-8 w-8 cursor-pointer"
                      size="icon"
                      variant="ghost"
                    >
                      <a
                        aria-label="GitHub Repository"
                        href="https://github.com/silicondeck/shadcn-dashboard-landing-template"
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <Github className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button
                      className="h-8 w-8 cursor-pointer"
                      onClick={() => setIsOpen(false)}
                      size="icon"
                      variant="ghost"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </SheetHeader>

              {/* Navigation Links */}
              <div className="flex-1 overflow-y-auto">
                <nav className="space-y-1 p-6">
                  {navigationItems.map((item) => (
                    <div key={item.name}>
                      {item.hasMegaMenu ? (
                        <Collapsible
                          onOpenChange={setSolutionsOpen}
                          open={solutionsOpen}
                        >
                          <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between rounded-lg px-4 py-3 font-medium text-base transition-colors hover:bg-accent hover:text-accent-foreground">
                            {item.name}
                            <ChevronDown
                              className={`h-4 w-4 transition-transform ${solutionsOpen ? "rotate-180" : ""}`}
                            />
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-1 pl-4">
                            {solutionsItems.map((solution, index) =>
                              solution.title ? (
                                <div
                                  className="mt-5 px-4 py-2 font-semibold text-muted-foreground/50 text-xs uppercase tracking-wider"
                                  key={`title-${index}`}
                                >
                                  {solution.title}
                                </div>
                              ) : (
                                <a
                                  className="flex cursor-pointer items-center rounded-lg px-4 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                                  href={solution.href}
                                  key={solution.name}
                                  onClick={(e) => {
                                    setIsOpen(false);
                                    if (solution.href?.startsWith("#")) {
                                      e.preventDefault();
                                      setTimeout(
                                        () => smoothScrollTo(solution.href),
                                        100
                                      );
                                    }
                                  }}
                                >
                                  {solution.name}
                                </a>
                              )
                            )}
                          </CollapsibleContent>
                        </Collapsible>
                      ) : (
                        <a
                          className="flex cursor-pointer items-center rounded-lg px-4 py-3 font-medium text-base transition-colors hover:bg-accent hover:text-accent-foreground"
                          href={item.href}
                          onClick={(e) => {
                            setIsOpen(false);
                            if (item.href.startsWith("#")) {
                              e.preventDefault();
                              setTimeout(() => smoothScrollTo(item.href), 100);
                            }
                          }}
                        >
                          {item.name}
                        </a>
                      )}
                    </div>
                  ))}
                </nav>
              </div>

              {/* Footer Actions */}
              <div className="space-y-4 border-t p-6">
                {/* Primary Actions */}
                <div className="space-y-3">
                  <Button
                    asChild
                    className="w-full cursor-pointer"
                    size="lg"
                    variant="outline"
                  >
                    <Link href="/dashboard">
                      <LayoutDashboard className="size-4" />
                      Dashboard
                    </Link>
                  </Button>

                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      asChild
                      className="cursor-pointer"
                      size="lg"
                      variant="outline"
                    >
                      <Link href="/auth/sign-in">Sign In</Link>
                    </Button>
                    <Button asChild className="cursor-pointer" size="lg">
                      <Link href="/auth/sign-up">Get Started</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
