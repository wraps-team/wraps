import { SectionKicker } from "@/app/landing/components/section-kicker";

const ITEMS = [
  {
    title: "Delivery reports",
    body: "Opens, clicks, bounces and complaints for every message.",
  },
  {
    title: "Message history",
    body: "Search any email and read its full timeline.",
  },
  {
    title: "Contacts",
    body: "Import lists, track preferences, handle unsubscribes.",
  },
  {
    title: "Domains",
    body: "Add domains and see their setup checks in one place.",
  },
  {
    title: "Inbox health",
    body: "Bounce and complaint rates against Amazon’s own limits.",
  },
  {
    title: "SMTP",
    body: "Credentials for older tools that only speak SMTP.",
  },
];

export function PlatformEverythingElseSection() {
  return (
    <section className="scroll-mt-20 py-16 sm:py-24" id="deliverability">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-3xl">
          <SectionKicker>Everything else</SectionKicker>
          <h2 className="font-heading font-semibold text-3xl tracking-tight sm:text-4xl">
            Included on every plan.
          </h2>
        </div>
        <ul className="grid border-border border-t sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((item) => (
            <li
              className="border-border border-b p-5 sm:border-r sm:[&:nth-child(2n)]:border-r-0 lg:[&:nth-child(2n)]:border-r lg:[&:nth-child(3n)]:border-r-0"
              key={item.title}
            >
              <h3 className="mb-1 font-semibold text-base">{item.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
