"use client";

import { Button } from "@wraps/ui/components/ui/button";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CommandSearch, SearchTrigger } from "@/components/command-search";
import { Logo } from "@/components/logo";
import { DocsNav } from "./docs-nav";
import { DocsToc } from "./docs-toc";

type DocsLayoutProps = {
  children: React.ReactNode;
  headerActions?: React.ReactNode;
};

export function DocsLayout({ children, headerActions }: DocsLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Cmd/Ctrl+K opens the command palette on docs pages (which don't render the
  // marketing SiteHeader that hosts it elsewhere).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center px-4 sm:px-6 lg:px-8">
          {/* Mobile menu button */}
          <Button
            className="mr-4 lg:hidden"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            size="icon"
            variant="ghost"
          >
            {sidebarOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
            <span className="sr-only">Toggle menu</span>
          </Button>

          {/* Logo */}
          <a className="flex items-center" href="/">
            <Logo size={28} />
          </a>

          {/* Navigation */}
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden w-40 sm:block lg:w-56">
              <SearchTrigger onClick={() => setSearchOpen(true)} />
            </div>
            {headerActions}
            <Button asChild variant="ghost">
              <Link href="/docs">Docs</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/">Home</Link>
            </Button>
          </div>
        </div>
      </header>

      <CommandSearch onOpenChange={setSearchOpen} open={searchOpen} />

      <div className="container mx-auto flex px-4 sm:px-6 lg:px-8">
        {/* Sidebar - Desktop */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 overflow-y-auto border-r py-8 pr-8 lg:block">
          <DocsNav />
        </aside>

        {/* Sidebar - Mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 top-16 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          >
            <aside
              className="fixed top-16 left-0 h-[calc(100vh-4rem)] w-64 overflow-y-auto border-r bg-background p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <DocsNav />
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="min-w-0 flex-1 py-8 lg:pl-8">
          <div className="mx-auto max-w-4xl" ref={contentRef}>
            {children}
          </div>
        </main>

        {/* Table of contents - Desktop only */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-56 shrink-0 overflow-y-auto py-8 pl-8 xl:block">
          <DocsToc contentRef={contentRef} />
        </aside>
      </div>
    </div>
  );
}
