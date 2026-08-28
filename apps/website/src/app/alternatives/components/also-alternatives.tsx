import { Card, CardContent } from "@wraps/ui/components/ui/card";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { ALTERNATIVES_PAGES } from "@/config/alternatives";

/** Cross-links to the other alternatives lists, excluding the current one. */
export function AlsoAlternatives({ currentSlug }: { currentSlug: string }) {
  const others = ALTERNATIVES_PAGES.filter((page) => page.slug !== currentSlug);

  return (
    <section className="mb-16">
      <h2 className="mb-4 font-heading font-semibold text-2xl tracking-tight">
        Other lists
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {others.map((page) => (
          <Link href={`/alternatives/${page.slug}`} key={page.slug}>
            <Card className="h-full transition-colors hover:border-orange-500/50">
              <CardContent className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{page.incumbent} alternatives</p>
                  <p className="text-muted-foreground text-sm">
                    {page.ranked.length} options, ranked
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
