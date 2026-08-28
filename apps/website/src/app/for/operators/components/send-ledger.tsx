// The operator's anchor artifact: one message, every event that touched it,
// in order. Mirrors the event types the pipeline actually records
// (Send, Delivery, Open, Click, Bounce, Complaint, Reject).

const events = [
  {
    at: "14:02:11.204",
    type: "Send",
    tone: "text-muted-foreground",
    detail: "via ses:us-east-1 · your account",
  },
  {
    at: "14:02:12.867",
    type: "Delivery",
    tone: "text-emerald-700 dark:text-emerald-400",
    detail: "smtp 250 · 1.66s",
  },
  {
    at: "14:19:48.010",
    type: "Open",
    tone: "text-muted-foreground",
    detail: "bot-filtered · not counted",
  },
  {
    at: "16:41:02.559",
    type: "Open",
    tone: "text-emerald-700 dark:text-emerald-400",
    detail: "counted",
  },
  {
    at: "16:41:35.118",
    type: "Click",
    tone: "text-emerald-700 dark:text-emerald-400",
    detail: "/pricing",
  },
  {
    at: "16:44:09.732",
    type: "Complaint",
    tone: "text-red-700 dark:text-red-400",
    detail: "feedback loop · suppressed",
  },
];

export function SendLedger() {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/80 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between border-border border-b px-4 py-3">
        <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
          message trace
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">
          0102f9a1c4e7b3d0
        </span>
      </div>

      <ol className="divide-y divide-border/60">
        {events.map((event) => (
          <li
            className="flex items-baseline gap-3 px-4 py-2.5 font-mono text-[12px]"
            key={`${event.at}-${event.type}`}
          >
            <span className="shrink-0 text-muted-foreground/70 tabular-nums">
              {event.at}
            </span>
            <span className={`w-20 shrink-0 font-medium ${event.tone}`}>
              {event.type}
            </span>
            <span className="truncate text-muted-foreground">
              {event.detail}
            </span>
          </li>
        ))}
      </ol>

      <div className="border-border border-t bg-muted/40 px-4 py-3">
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          The complaint suppressed the contact automatically. The next broadcast
          cannot select them, whoever builds it.
        </p>
      </div>
    </div>
  );
}
