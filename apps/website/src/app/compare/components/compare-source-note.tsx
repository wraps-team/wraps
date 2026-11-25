import { ExternalLink } from "lucide-react";

/** "Last updated" line, the competitor's sources, and the correction mailto. */
export function CompareSourceNote({
  updated,
  competitor,
  sources,
}: {
  updated: string;
  competitor: string;
  sources: { label: string; href: string }[];
}) {
  return (
    <div className="mt-12 border-t pt-8 text-center text-muted-foreground text-xs">
      <p className="mb-2">
        Last updated: {updated}. {competitor} pricing and features sourced from{" "}
        {sources.map((source, index) => (
          <span key={source.href}>
            {index > 0 ? (index === sources.length - 1 ? ", and " : ", ") : ""}
            <a
              className="text-brand-text underline"
              href={source.href}
              rel="noopener noreferrer"
              target="_blank"
            >
              {source.label}
              <ExternalLink
                aria-hidden="true"
                className="ml-0.5 inline size-3"
              />
            </a>
          </span>
        ))}
        .
      </p>
      <p>
        See something inaccurate?{" "}
        <a
          className="text-brand-text underline"
          href="mailto:support@wraps.dev"
        >
          Let us know
        </a>{" "}
        and we&rsquo;ll fix it.
      </p>
    </div>
  );
}
