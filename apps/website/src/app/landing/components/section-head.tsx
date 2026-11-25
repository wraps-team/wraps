import { SectionKicker } from "./section-kicker";

/** Kicker, H2 and an optional lede: the header every homepage section opens with. */
export function SectionHead({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-10 max-w-3xl">
      <SectionKicker>{kicker}</SectionKicker>
      <h2 className="text-balance font-heading font-semibold text-3xl text-foreground leading-tight tracking-tight md:text-4xl">
        {title}
      </h2>
      {children ? (
        <p className="mt-4 max-w-[60ch] text-pretty text-lg text-muted-foreground leading-relaxed">
          {children}
        </p>
      ) : null}
    </div>
  );
}
