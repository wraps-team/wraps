export type GlanceRow = {
  label: string;
  competitor: React.ReactNode;
  wraps: React.ReactNode;
};

/**
 * The short version, in plain words. The Wraps column is last and tinted. The
 * table scrolls inside its wrapper if a cell ever outgrows the screen; the page
 * itself never scrolls sideways.
 */
export function CompareGlance({
  competitor,
  rows,
}: {
  competitor: string;
  rows: GlanceRow[];
}) {
  return (
    <div className="overflow-x-auto border">
      <table className="w-full text-sm">
        <caption className="sr-only">
          {competitor} and Wraps, side by side
        </caption>
        <thead>
          <tr className="border-b bg-muted/50 text-left">
            <td className="p-3 sm:p-4">
              <span className="sr-only">Topic</span>
            </td>
            <th className="p-3 font-semibold sm:p-4" scope="col">
              {competitor}
            </th>
            <th
              className="bg-brand/5 p-3 font-semibold text-brand-text sm:p-4"
              scope="col"
            >
              Wraps
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr className="align-top" key={row.label}>
              <th
                className="w-1/4 p-3 text-left font-semibold sm:p-4"
                scope="row"
              >
                {row.label}
              </th>
              <td className="p-3 text-muted-foreground sm:p-4">
                {row.competitor}
              </td>
              <td className="bg-brand/5 p-3 text-foreground sm:p-4">
                {row.wraps}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
