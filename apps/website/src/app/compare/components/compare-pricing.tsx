export type PricingRow = {
  /** "100,000" */
  volume: string;
  /** "~10,000" */
  contacts: string;
  /** "$150" */
  competitor: string;
  /** Optional line under the competitor figure ("$100 + 5K overage ..."). */
  competitorNote?: string;
  /** "$41.50": the page passes the estimator's figure; this component does no math. */
  wraps: string;
  /** "$29 Pro + $12.50 Amazon" */
  wrapsBreakdown: string;
  /** Derived by the page from the displayed numbers. */
  savings?: string;
  savingsNote?: string;
};

/**
 * Volume, contacts, the competitor's bill and the Wraps all-in figure with its
 * breakdown line. Pure presentation: every number arrives as a string.
 */
export function ComparePricing({
  competitor,
  rows,
  savingsHeading,
}: {
  competitor: string;
  rows: PricingRow[];
  savingsHeading?: string;
}) {
  const hasSavings = rows.some((row) => row.savings);
  return (
    <>
      <ul className="divide-y border sm:hidden">
        {rows.map((row) => (
          <li
            className="min-w-0 space-y-3 p-4 text-sm tabular-nums"
            key={row.volume}
          >
            <p className="font-semibold">
              {row.volume} emails a month
              <span className="font-normal text-muted-foreground">
                {" "}
                · {row.contacts} contacts
              </span>
            </p>
            <div>
              <p className="text-muted-foreground text-xs">{competitor}</p>
              <p>{row.competitor}</p>
              {row.competitorNote ? (
                <p className="text-muted-foreground text-xs">
                  {row.competitorNote}
                </p>
              ) : null}
            </div>
            <div className="bg-brand/5 p-3">
              <p className="text-brand-text text-xs">Wraps, all in</p>
              <p className="font-semibold">{row.wraps}</p>
              <p className="text-muted-foreground text-xs">
                {row.wrapsBreakdown}
              </p>
            </div>
            {row.savings ? (
              <p className="text-xs">
                <span className="text-muted-foreground">
                  {savingsHeading ?? "Difference"}:{" "}
                </span>
                <span className="font-semibold text-brand-text">
                  {row.savings}
                </span>
                {row.savingsNote ? (
                  <span className="text-muted-foreground">
                    {" "}
                    {row.savingsNote}
                  </span>
                ) : null}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto border sm:block">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">
            Monthly cost of {competitor} against Wraps, all in, at five volumes
          </caption>
          <thead>
            <tr className="border-b bg-muted/50 text-left">
              <th className="p-3 font-semibold sm:p-4" scope="col">
                Emails a month
              </th>
              <th className="p-3 font-semibold sm:p-4" scope="col">
                Contacts
              </th>
              <th className="p-3 font-semibold sm:p-4" scope="col">
                {competitor}
              </th>
              <th
                className="bg-brand/5 p-3 font-semibold text-brand-text sm:p-4"
                scope="col"
              >
                Wraps, all in
              </th>
              {hasSavings ? (
                <th className="p-3 font-semibold sm:p-4" scope="col">
                  {savingsHeading ?? "Difference"}
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr className="align-top" key={row.volume}>
                <th className="p-3 text-left font-semibold sm:p-4" scope="row">
                  {row.volume}
                </th>
                <td className="p-3 text-muted-foreground sm:p-4">
                  {row.contacts}
                </td>
                <td className="p-3 sm:p-4">
                  <div>{row.competitor}</div>
                  {row.competitorNote ? (
                    <div className="text-muted-foreground text-xs">
                      {row.competitorNote}
                    </div>
                  ) : null}
                </td>
                <td className="bg-brand/5 p-3 sm:p-4">
                  <div className="font-semibold">{row.wraps}</div>
                  <div className="text-muted-foreground text-xs">
                    {row.wrapsBreakdown}
                  </div>
                </td>
                {hasSavings ? (
                  <td className="p-3 sm:p-4">
                    <div className="font-semibold text-brand-text">
                      {row.savings}
                    </div>
                    {row.savingsNote ? (
                      <div className="text-muted-foreground text-xs">
                        {row.savingsNote}
                      </div>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
