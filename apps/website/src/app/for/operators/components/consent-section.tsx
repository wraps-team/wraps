import { SectionKicker } from "@/app/landing/components/section-kicker";

// Consent facts an operator gets asked to produce under audit. Each one is a
// shipped surface: topics, double opt-in with its own verified sender, and the
// JWT-protected hosted preference center.
const records = [
  {
    question: "Did they say yes?",
    answer:
      "Topics carry double opt-in. The confirmation email goes out from a sender you verify, and the contact is not subscribed until they click the token link.",
  },
  {
    question: "When, and to what exactly?",
    answer:
      "Subscriptions are per topic, with a confirmation timestamp. Product news and billing alerts are separate consents, not one blanket list.",
  },
  {
    question: "Can they change it without emailing you?",
    answer:
      "Every send footer points at a hosted preference center, reachable by signed link only. They pick topics themselves; you never process the request by hand.",
  },
  {
    question: "Did the unsubscribe actually take?",
    answer:
      "Status changes at the contact, not at the campaign. Broadcast recipient selection only ever resolves to contacts still marked active.",
  },
];

export function OperatorsConsentSection() {
  return (
    <section className="border-border/60 border-y bg-muted/30 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 max-w-3xl">
          <SectionKicker>Consent</SectionKicker>
          <h2 className="mb-3 font-bold text-3xl tracking-tight sm:text-4xl">
            Consent is a record you can produce, not a checkbox you remember.
          </h2>
          <p className="text-lg text-muted-foreground">
            The four questions that arrive together, usually from legal, usually
            about one specific person, usually on a Friday.
          </p>
        </div>

        <dl className="grid gap-x-10 gap-y-8 md:grid-cols-2">
          {records.map(({ question, answer }) => (
            <div key={question}>
              <dt className="mb-2 flex items-baseline gap-2.5 font-medium tracking-tight">
                <span
                  aria-hidden="true"
                  className="h-px w-4 shrink-0 translate-y-[-0.35rem] bg-orange-500"
                />
                {question}
              </dt>
              <dd className="pl-6.5 text-muted-foreground leading-relaxed">
                {answer}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
