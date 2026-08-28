import { ChevronRight } from "lucide-react";
import Link from "next/link";

export function AlternativesBreadcrumb({ current }: { current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-8">
      <ol className="flex items-center gap-1.5 text-muted-foreground text-sm">
        <li>
          <Link className="transition-colors hover:text-foreground" href="/">
            Home
          </Link>
        </li>
        <li>
          <ChevronRight className="size-3.5" />
        </li>
        <li>
          <Link
            className="transition-colors hover:text-foreground"
            href="/alternatives"
          >
            Alternatives
          </Link>
        </li>
        <li>
          <ChevronRight className="size-3.5" />
        </li>
        <li className="text-foreground">{current}</li>
      </ol>
    </nav>
  );
}
