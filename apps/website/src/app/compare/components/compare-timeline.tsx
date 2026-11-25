import { FlowBox } from "@/app/landing/components/flow-primitives";

export type TimelineStep = {
  duration: string;
  label: string;
  /** A sentence or two under the label, for steps that need it. */
  detail?: React.ReactNode;
};

/**
 * Phase dots with durations, in order. One column on a phone, three from `sm`.
 */
export function CompareTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol
      className={`grid gap-x-6 gap-y-5 sm:grid-cols-2 ${
        steps.some((step) => step.detail) ? "" : "lg:grid-cols-3"
      }`}
    >
      {steps.map((step) => (
        <li
          className="relative min-w-0 border-l pl-5 [&:last-child]:border-l-transparent"
          key={step.label}
        >
          <span
            aria-hidden="true"
            className="absolute top-1.5 -left-1.5 size-3 rounded-full bg-brand"
          />
          <b className="block font-semibold">{step.duration}</b>
          <span className="block text-muted-foreground text-sm">
            {step.label}
          </span>
          {step.detail ? (
            <span className="mt-1 block text-muted-foreground text-sm">
              {step.detail}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** What exports and what to rebuild, as two labelled boxes. */
export function CompareExports({
  exports,
  rebuild,
}: {
  exports: React.ReactNode[];
  rebuild: React.ReactNode[];
}) {
  return (
    <div className="grid gap-x-6 gap-y-8 md:grid-cols-2">
      <FlowBox className="min-w-0 pb-5" label="Comes across cleanly">
        <ul className="space-y-2 text-sm">
          {exports.map((item, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed list
            <li className="flex min-w-0 items-start gap-2.5" key={index}>
              <span
                aria-hidden="true"
                className="mt-1.5 size-2 shrink-0 rounded-full bg-success"
              />
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ul>
      </FlowBox>
      <FlowBox className="min-w-0 pb-5" label="Needs rebuilding">
        <ul className="space-y-2 text-sm">
          {rebuild.map((item, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed list
            <li className="flex min-w-0 items-start gap-2.5" key={index}>
              <span
                aria-hidden="true"
                className="mt-1.5 size-2 shrink-0 rounded-full bg-warning"
              />
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ul>
      </FlowBox>
    </div>
  );
}
