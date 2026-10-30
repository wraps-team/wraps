import Image from "next/image";
import Link from "next/link";
import type { Release } from "../releases";
import { TAG_LABELS } from "../releases";

/**
 * Entries carry ISO dates so they sort and can serve as a sitemap lastmod.
 * The page shows month and year, which is the precision the 63 migrated
 * entries actually have. Switching to day precision later is a change to this
 * one formatter.
 */
const RELEASE_DATE = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const formatReleaseDate = (iso: string): string =>
  RELEASE_DATE.format(new Date(`${iso}T00:00:00Z`));

type EntryCardProps = {
  release: Release;
  /** The index links its titles out; the entry page is already there. */
  linkTitle: boolean;
  /** Only the newest entry on the index gets the badge. */
  isLatest: boolean;
};

export function EntryCard({ release, linkTitle, isLatest }: EntryCardProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Header */}
      <div className="border-border border-b bg-muted/30 px-6 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {release.tags.map((tag) => (
            <span
              className="rounded-full border border-border px-2 py-0.5 font-mono text-3xs text-muted-foreground uppercase tracking-eyebrow"
              key={tag}
            >
              {TAG_LABELS[tag]}
            </span>
          ))}
          <span className="text-muted-foreground text-sm">
            {formatReleaseDate(release.date)}
          </span>
          {isLatest && (
            <span className="rounded-full border border-brand/40 px-2 py-0.5 font-mono text-3xs text-brand-text uppercase tracking-eyebrow">
              Latest
            </span>
          )}
        </div>
        <h3 className="mt-2 font-heading font-semibold text-lg tracking-tight">
          {linkTitle ? (
            <Link
              className="hover:text-brand-text"
              href={`/changelog/${release.slug}`}
            >
              {release.title}
            </Link>
          ) : (
            release.title
          )}
        </h3>
        {release.summary ? (
          <p className="mt-1 text-muted-foreground text-sm">
            {release.summary}
          </p>
        ) : null}
      </div>

      {/* Figure, when the release has one */}
      {release.media ? (
        <Image
          alt={release.media.alt}
          className="block w-full border-border border-b"
          height={release.media.height}
          /* An animated GIF goes through the optimizer as a
             single still frame. Nothing else here needs it. */
          src={release.media.src}
          unoptimized={release.media.src.endsWith(".gif")}
          width={release.media.width}
        />
      ) : null}

      {/* Items */}
      <div className="p-6">
        <ul className="space-y-2">
          {release.items.map((item, itemIndex) => (
            <li className="flex items-start gap-3 text-sm" key={itemIndex}>
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {release.alsoFixed && release.alsoFixed.length > 0 ? (
          <details className="mt-4 border-border border-t pt-4">
            <summary className="cursor-pointer text-muted-foreground text-sm">
              Also fixed ({release.alsoFixed.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {release.alsoFixed.map((fix) => (
                <li className="text-muted-foreground text-sm" key={fix}>
                  {fix}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {release.versions && release.versions.length > 0 ? (
          <p className="mt-4 font-mono text-2xs text-muted-foreground">
            {release.versions.join(" · ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
