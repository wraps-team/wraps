import { Check } from "lucide-react";
import { FlowBox } from "@/app/landing/components/flow-primitives";

function Points({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-3 text-sm">
      {items.map((item, index) => (
        <li
          className="flex min-w-0 items-start gap-2.5"
          // Static, ordered copy: the index is the identity.
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed list
          key={index}
        >
          <Check
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-success"
          />
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Two labelled boxes: "Pick {competitor} if" and "Pick Wraps if". The Wraps
 * box is the dashed brand box that marks the one we recommend for that reader.
 * Each list should say plainly that Wraps needs an AWS account.
 */
export function CompareVerdict({
  competitor,
  competitorPoints,
  wrapsPoints,
}: {
  competitor: string;
  competitorPoints: React.ReactNode[];
  wrapsPoints: React.ReactNode[];
}) {
  return (
    <div className="grid gap-x-6 gap-y-8 md:grid-cols-2">
      <FlowBox className="min-w-0 pb-5" label={`Pick ${competitor} if`}>
        <Points items={competitorPoints} />
      </FlowBox>
      <FlowBox className="min-w-0 pb-5" dashed label="Pick Wraps if">
        <Points items={wrapsPoints} />
      </FlowBox>
    </div>
  );
}
