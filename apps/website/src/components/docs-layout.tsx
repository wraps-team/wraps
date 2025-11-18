"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DocsNav } from "./docs-nav";

interface DocsLayoutProps {
  children: React.ReactNode;
}

export function DocsLayout({ children }: DocsLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
          <a className="flex items-center gap-2" href="/">
            <span className="font-bold text-xl">Wraps</span>
          </a>

          {/* Navigation */}
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="ghost">
              <a href="/docs">Docs</a>
            </Button>
            <Button asChild variant="ghost">
              <a href="/">Home</a>
            </Button>
          </div>
        </div>
      </header>

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
              className="fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 overflow-y-auto border-r bg-background p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <DocsNav />
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="min-w-0 flex-1 py-8 lg:pl-8">
          <div className="mx-auto max-w-4xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
