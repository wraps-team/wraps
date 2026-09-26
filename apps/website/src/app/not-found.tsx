import { Button } from "@wraps/ui/components/ui/button";
import Link from "next/link";
import { NOT_FOUND_LINKS } from "@/lib/not-found-content";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-xl text-center">
        <h1 className="mb-4 font-bold text-9xl text-primary">404</h1>
        <h2 className="mb-4 font-semibold text-3xl">Page Not Found</h2>
        <p className="mb-8 text-lg text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Button asChild size="lg">
          <Link href="/">Go Home</Link>
        </Button>

        <div className="mt-12 text-left">
          <h3 className="mb-4 text-center font-medium text-muted-foreground text-sm uppercase tracking-wide">
            Where to look next
          </h3>
          <ul className="space-y-2">
            {NOT_FOUND_LINKS.map((link) => (
              <li className="text-sm" key={link.href}>
                <a
                  className="font-medium text-foreground underline underline-offset-4 hover:text-brand"
                  href={link.href}
                >
                  {link.label}
                </a>
                <span className="text-muted-foreground">
                  {" "}
                  — {link.description}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
