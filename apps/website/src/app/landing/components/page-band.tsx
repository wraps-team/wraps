import { SectionKicker } from "./section-kicker";

/** A full-width page section; `sunken` tints it and adds the hairline borders. */
export function Band({
  children,
  sunken = false,
  id,
}: {
  children: React.ReactNode;
  sunken?: boolean;
  id?: string;
}) {
  return (
    <section
      className={`py-16 sm:py-24 ${sunken ? "border-border/60 border-y bg-muted/30" : ""}`}
      id={id}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  );
}

/** Kicker, H2 and an optional lede, the head of every Band. */
export function SectionHead({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body?: React.ReactNode;
}) {
  return (
    <div className="mb-10 max-w-3xl">
      <SectionKicker>{kicker}</SectionKicker>
      <h2 className="mb-3 text-balance font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
        {title}
      </h2>
      {body && <p className="text-lg text-muted-foreground">{body}</p>}
    </div>
  );
}
