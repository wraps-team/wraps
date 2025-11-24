import type { PropsWithChildren } from "react";
import { Logo } from "@/components/logo";

export default function OnboardingLayout({ children }: PropsWithChildren) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto flex items-center px-4 py-4">
          <Logo className="h-8" />
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-4xl">{children}</div>
      </main>

      {/* Footer */}
      <footer className="border-t py-4">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          Need help?{" "}
          <a
            className="underline hover:text-foreground"
            href="https://wraps.dev/docs"
            rel="noopener noreferrer"
            target="_blank"
          >
            View documentation
          </a>
          {" or "}
          <a
            className="underline hover:text-foreground"
            href="mailto:support@wraps.dev"
          >
            contact support
          </a>
        </div>
      </footer>
    </div>
  );
}
