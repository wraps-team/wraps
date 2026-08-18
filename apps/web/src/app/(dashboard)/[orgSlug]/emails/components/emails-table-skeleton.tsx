import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@wraps/ui/components/ui/table";

/** Column count of the emails table, used only to size the skeleton. */
const EMAILS_COLUMN_COUNT = 7;
const SKELETON_ROW_COUNT = 5;

type SkeletonRowsProps = {
  columnCount?: number;
  rowCount?: number;
};

/** The in-table loading rows, shared by the table itself and `loading.tsx`. */
export function EmailsTableSkeletonRows({
  columnCount = EMAILS_COLUMN_COUNT,
  rowCount = SKELETON_ROW_COUNT,
}: SkeletonRowsProps) {
  return Array.from({ length: rowCount }).map((_, i) => (
    <TableRow key={`skeleton-${i}`}>
      {Array.from({ length: columnCount }).map((__, j) => (
        <TableCell key={`skeleton-${i}-${j}`}>
          <Skeleton className="h-4 w-full" />
        </TableCell>
      ))}
    </TableRow>
  ));
}

/**
 * Segment-level loading shape for the emails list (audit finding F16).
 *
 * The page had no `loading.tsx` and no Suspense boundary anywhere in its
 * chain, so a client-side navigation into /emails left the previous screen
 * frozen for roughly two seconds before anything moved. This is what fills
 * that gap: the same filter bar, table and pagination the real page renders,
 * so nothing shifts when the data arrives.
 */
export function EmailsTableSkeleton() {
  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-9 w-full max-w-sm" />
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-[150px]" />
          <Skeleton className="h-9 w-[140px]" />
          <Skeleton className="h-9 w-9" />
        </div>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableBody>
            <EmailsTableSkeletonRows />
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between py-4">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-48" />
      </div>
    </div>
  );
}
