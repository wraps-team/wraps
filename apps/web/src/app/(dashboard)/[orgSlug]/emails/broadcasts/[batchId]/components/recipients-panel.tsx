"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wraps/ui/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@wraps/ui/components/ui/tabs";
import { AlertTriangle, Download, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  exportBroadcastRecipients,
  listBroadcastRecipientOutcomes,
} from "@/actions/batch";
import { Button } from "@/components/ui/button";
import { broadcastRecipientCSVColumns } from "@/lib/csv-columns";
import { exportTableToCSV } from "@/lib/csv-export";

type RecipientsPanelProps = {
  batchId: string;
  organizationId: string;
};

type RecipientRow = {
  id: string;
  recipient: string;
  status: string;
  error: string | null;
  bounceType: string | null;
  bounceSubType: string | null;
  sentAt: Date | null;
  createdAt: Date;
};

type StatusFilter = "failed" | "all";

// Three distinguishable states — loading, empty, and error — so a broken
// query can never present itself as "no failures".
type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; rows: RecipientRow[]; total: number };

const PAGE_SIZE = 50;

function bounceLabel(row: RecipientRow): string {
  if (!row.bounceType) {
    return "—";
  }
  return row.bounceSubType
    ? `${row.bounceType} / ${row.bounceSubType}`
    : row.bounceType;
}

export function RecipientsPanel({
  batchId,
  organizationId,
}: RecipientsPanelProps) {
  // Defaults to failures — this is the question the panel exists to answer.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("failed");
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [isExporting, setIsExporting] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const result = await listBroadcastRecipientOutcomes(
      batchId,
      organizationId,
      {
        status: statusFilter === "failed" ? "failed" : undefined,
        limit: PAGE_SIZE,
        offset,
      }
    );
    if (result.success) {
      setState({
        kind: "ready",
        rows: result.recipients,
        total: result.total,
      });
    } else {
      setState({ kind: "error", message: result.error });
    }
  }, [batchId, organizationId, statusFilter, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const handleFilterChange = (value: string) => {
    setStatusFilter(value === "all" ? "all" : "failed");
    setOffset(0);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const result = await exportBroadcastRecipients(batchId, organizationId, {
        status: statusFilter === "failed" ? "failed" : undefined,
      });
      if (result.success) {
        exportTableToCSV(
          result.recipients,
          broadcastRecipientCSVColumns,
          `broadcast-${batchId}-recipients-${new Date().toISOString().slice(0, 10)}.csv`
        );
        // Never report a truncated export as complete.
        toast.success(
          result.truncated
            ? `Exported the first ${result.recipients.length.toLocaleString()} of ${result.total.toLocaleString()} recipients`
            : `Exported ${result.recipients.length.toLocaleString()} recipients`
        );
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsExporting(false);
    }
  };

  const rows = state.kind === "ready" ? state.rows : [];
  const total = state.kind === "ready" ? state.total : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-lg">Recipients</CardTitle>
        <Button
          disabled={isExporting || state.kind !== "ready" || total === 0}
          onClick={handleExport}
          size="sm"
          variant="outline"
        >
          {isExporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Export CSV
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs onValueChange={handleFilterChange} value={statusFilter}>
          <TabsList>
            <TabsTrigger value="failed">Failed</TabsTrigger>
            <TabsTrigger value="all">All recipients</TabsTrigger>
          </TabsList>
        </Tabs>

        {state.kind === "loading" && (
          <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading recipients...
          </div>
        )}

        {state.kind === "error" && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="space-y-1">
              <p className="font-medium text-destructive text-sm">
                Couldn't load recipient outcomes.
              </p>
              <p className="text-destructive/80 text-xs">{state.message}</p>
            </div>
          </div>
        )}

        {state.kind === "ready" && rows.length === 0 && (
          <p className="py-8 text-center text-muted-foreground text-sm">
            {statusFilter === "failed"
              ? "No failed recipients."
              : "No recipients yet."}
          </p>
        )}

        {state.kind === "ready" && rows.length > 0 && (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead>Bounce type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="max-w-[240px] truncate font-medium">
                      {row.recipient}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.status === "failed" ? "destructive" : "secondary"
                        }
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[360px] whitespace-pre-wrap break-words text-muted-foreground text-sm">
                      {row.error ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {bounceLabel(row)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {state.kind === "ready" && total > 0 && (
          <div className="flex items-center justify-between pt-2">
            <p className="text-muted-foreground text-sm">
              Showing {rows.length.toLocaleString()} of {total.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <Button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                size="sm"
                variant="outline"
              >
                Previous
              </Button>
              <Button
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                size="sm"
                variant="outline"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
