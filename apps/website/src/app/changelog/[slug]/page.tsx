import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LandingFooter } from "@/app/landing/components/footer";
import { LandingNavbar } from "@/app/landing/components/navbar";
import { EntryCard } from "../components/entry-card";
import { releases } from "../releases";

/** Every entry is known at build time, so no slug should ever be rendered on demand. */
export const dynamicParams = false;

export function generateStaticParams() {
  return releases.map((release) => ({ slug: release.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const release = releases.find((entry) => entry.slug === slug);
  if (release === undefined) {
    return {};
  }
  const description =
    release.summary ?? `What changed in Wraps: ${release.title}.`;
  return {
    title: `${release.title} | Changelog`,
    description,
    openGraph: {
      title: `${release.title} | Wraps Changelog`,
      description,
      type: "article",
      publishedTime: `${release.date}T00:00:00Z`,
      images: release.media ? [release.media.src] : undefined,
    },
    twitter: {
      title: `${release.title} | Wraps Changelog`,
      description,
    },
    alternates: {
      canonical: `https://wraps.dev/changelog/${release.slug}`,
    },
  };
}

export default async function ChangelogEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const release = releases.find((entry) => entry.slug === slug);
  if (release === undefined) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main className="mx-auto max-w-3xl px-4 pt-32 pb-24 sm:px-6 lg:px-8">
        <Link
          className="font-mono text-2xs text-muted-foreground uppercase tracking-eyebrow hover:text-brand-text"
          href="/changelog"
        >
          ← All changes
        </Link>
        <div className="mt-6">
          <EntryCard isLatest={false} linkTitle={false} release={release} />
        </div>
        {release.docs ? (
          <Link
            className="mt-6 inline-block text-brand-text text-sm hover:underline"
            href={release.docs}
          >
            Read the docs →
          </Link>
        ) : null}
      </main>
      <LandingFooter />
    </div>
  );
}
