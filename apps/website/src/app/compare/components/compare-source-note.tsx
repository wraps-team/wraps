import { ExternalLink } from "lucide-react";

/** "Last updated" line, the competitor's sources, and the correction mailto. */
export function CompareSourceNote({
  updated,
  competitor,
  sources,
  alsoFrom,
}: {
  updated: string;
  competitor: string;
  sources: { label: string; href: string }[];
  /** Plain text after the links, e.g. "public documentation". */
  alsoFrom?: string;
}) {
  const total = sources.length + (alsoFrom ? 1 : 0);
  const joiner = (index: number) => {
    if (index === 0) {
      return "";
    }
    if (total === 2) {
      return " and ";
    }
    return index === total - 1 ? ", and " : ", ";
  };
  return (
    <div className="mt-12 border-t pt-8 text-center text-muted-foreground text-xs">
      <p className="mb-2">
        Last updated: {updated}. {competitor} pricing and features sourced from{" "}
        {sources.map((source, index) => (
          <span key={source.href}>
            {joiner(index)}
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
        {alsoFrom ? `${joiner(sources.length)}${alsoFrom}` : null}.
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
