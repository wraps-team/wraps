import { SectionKicker } from "@/app/landing/components/section-kicker";

/** Kicker, heading and an optional intro: the head of every compare section. */
export function CompareSectionHead({
  kicker,
  title,
  children,
  id,
}: {
  kicker: string;
  title: string;
  children?: React.ReactNode;
  id?: string;
}) {
  return (
    <header className="mb-6 max-w-3xl">
      <SectionKicker className="mb-3">{kicker}</SectionKicker>
      <h2
        className="font-heading font-semibold text-2xl tracking-tight sm:text-3xl"
        id={id}
      >
        {title}
      </h2>
      {children ? (
        <p className="mt-3 text-muted-foreground">{children}</p>
      ) : null}
    </header>
  );
}

/** A section on the page: the same spacing every time. */
export function CompareSection({
  children,
  labelledBy,
}: {
  children: React.ReactNode;
  labelledBy?: string;
}) {
  return (
    <section aria-labelledby={labelledBy} className="mb-16">
      {children}
    </section>
  );
}
