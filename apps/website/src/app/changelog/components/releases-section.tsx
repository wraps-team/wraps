import { Lightbulb } from "lucide-react";
import { tagOptions } from "../filter";
import { releases, TAG_LABELS } from "../releases";
import { EntryCard } from "./entry-card";
import { ReleasesFilter } from "./releases-filter";

export function ChangelogReleasesSection() {
  const ordered = [...releases].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section className="py-12 pb-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="relative">
          <ReleasesFilter
            entries={ordered.map((release, index) => {
              const Icon = release.icon;
              return {
                slug: release.slug,
                tags: release.tags,
                node: (
                  <div className="relative pl-16">
                    {/* Timeline dot - outer circle */}
                    <div className="absolute left-0 flex size-12 items-center justify-center rounded-full bg-background">
                      {/* Inner node — orange only marks the latest release */}
                      <div
                        className={
                          index === 0
                            ? "flex size-10 items-center justify-center rounded-full border border-brand/40 bg-brand/10 text-brand-text"
                            : "flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"
                        }
                      >
                        <Icon className="size-5" />
                      </div>
                    </div>

                    {/* Content */}
                    <EntryCard
                      isLatest={index === 0}
                      linkTitle
                      release={release}
                    />
                  </div>
                ),
              };
            })}
            options={tagOptions(TAG_LABELS, releases)}
          />

          {/* Origin card - where it all began */}
          <div className="relative mt-12 pl-16">
            {/* Line connecting from releases to lightbulb center */}
            <div className="-top-12 absolute left-[24px] h-[72px] w-[1.5px] bg-border" />

            {/* Timeline terminator dot - covers end of line */}
            <div className="absolute left-0 flex size-12 items-center justify-center rounded-full bg-background">
              <div className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
                <Lightbulb className="size-5" />
              </div>
            </div>

            {/* Content */}
            <div className="overflow-hidden rounded-xl border border-border border-dashed bg-muted/20">
              <div className="px-6 py-5">
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground text-sm">
                    October 30th, 2025
                  </span>
                </div>
                <h3 className="mt-2 font-heading font-semibold text-lg tracking-tight">
                  The Idea
                </h3>
                <p className="mt-2 text-muted-foreground text-sm">
                  What if deploying email infrastructure to AWS was as simple as
                  one command? No vendor lock-in, no markup on AWS pricing, just
                  great developer experience.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
