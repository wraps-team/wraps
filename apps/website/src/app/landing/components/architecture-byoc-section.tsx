import Link from "next/link";
import { ControlPlaneDataPlaneTable } from "./control-plane-data-plane-table";
import { SectionKicker } from "./section-kicker";

const caption = (
  <>
    Wraps orchestrates. Your AWS sends and stores. Delivery events stream to
    both places: your DynamoDB keeps the copy you own, and Wraps receives the
    same stream to power suppression, analytics, and workflow triggers. Full
    detail on what we receive is on the BYOC page.
  </>
);

export function ArchitectureByocSection() {
  return (
    <section className="border-border border-b py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-2xl">
          <SectionKicker>Who holds what</SectionKicker>
          <h2 className="mb-4 font-heading font-semibold text-3xl tracking-tight md:text-4xl">
            Your email sends through your AWS, not ours.
          </h2>
          <p className="text-muted-foreground">
            This model has a name now: BYOC for email sending, bring your own
            cloud, applied to how you send. Wraps hosts the dashboard,
            templates, and workflows. Your AWS account holds the sending
            infrastructure and the delivery data.
          </p>
        </div>

        <ControlPlaneDataPlaneTable caption={caption} />

        <div className="mt-6">
          <Link
            className="font-medium text-brand text-sm hover:text-brand hover:underline"
            href="/byoc"
          >
            How our BYOC model works →
          </Link>
        </div>
      </div>
    </section>
  );
}
