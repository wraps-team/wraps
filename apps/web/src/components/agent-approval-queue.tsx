"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
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
import { CheckCircle2, Inbox, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { approveSend, listApprovals, rejectSend } from "@/actions/agents";
import { Button } from "@/components/ui/button";
import type { AgentApprovalStatus, ApprovalWithMeta } from "@/lib/agents";

type AgentApprovalQueueProps = {
  organizationId: string;
  orgSlug: string;
  userRole: string;
};

const STATUS_ORDER: Record<AgentApprovalStatus, number> = {
  PENDING: 0,
  APPROVED: 1,
  FAILED: 2,
  SENT: 3,
  REJECTED: 4,
};

function statusBadge(status: AgentApprovalStatus) {
  switch (status) {
    case "PENDING":
      return <Badge variant="secondary">Pending</Badge>;
    case "APPROVED":
      return <Badge variant="outline">Approved</Badge>;
    case "SENT":
      return <Badge variant="default">Sent</Badge>;
    case "REJECTED":
      return <Badge variant="outline">Rejected</Badge>;
    case "FAILED":
      return <Badge variant="destructive">Failed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function sortApprovals(rows: ApprovalWithMeta[]): ApprovalWithMeta[] {
  return [...rows].sort((a, b) => {
    const order = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (order !== 0) return order;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function AgentApprovalQueue({
  organizationId,
  userRole,
}: AgentApprovalQueueProps) {
  const [approvals, setApprovals] = useState<ApprovalWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const canManage = userRole === "owner" || userRole === "admin";

  const reloadApprovals = useCallback(async () => {
    try {
      const result = await listApprovals(organizationId);
      if (result.success) {
        setApprovals(sortApprovals(result.approvals));
      }
    } catch {
      // Best-effort refresh; the toast from the failing action already fired.
    }
  }, [organizationId]);

  useEffect(() => {
    let active = true;
    async function loadData() {
      setLoading(true);
      try {
        const result = await listApprovals(organizationId);
        if (!active) return;
        if (result.success) {
          setApprovals(sortApprovals(result.approvals));
        } else {
          toast.error(result.error);
        }
      } catch (error) {
        toast.error(
          error instanceof TypeError
            ? "Couldn't reach the server. Check your connection and try again."
            : "Failed to load the approval queue."
        );
      } finally {
        if (active) setLoading(false);
      }
    }
    loadData();
    return () => {
      active = false;
    };
  }, [organizationId]);

  async function handleDecision(
    approval: ApprovalWithMeta,
    decision: "approve" | "reject"
  ) {
    setPendingId(approval.id);
    const result =
      decision === "approve"
        ? await approveSend(approval.id, organizationId)
        : await rejectSend(approval.id, organizationId);
    setPendingId(null);

    if (result.success) {
      // Approve only succeeds when the enforcer actually sent the email.
      toast.success(
        decision === "approve" ? "Send approved — email sent" : "Send rejected"
      );
      setApprovals((prev) =>
        sortApprovals(
          prev.map((a) => (a.id === approval.id ? result.approval : a))
        )
      );
    } else {
      // A rejected approval, a lost concurrency race, or a FAILED send: surface
      // the reason and re-sync the queue so the row shows its true state
      // (e.g. FAILED with its errorMessage).
      toast.error(result.error);
      await reloadApprovals();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Approval queue</CardTitle>
        <CardDescription>
          Sends flagged by an agent's policy. Approve to release, reject to
          deny.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {approvals.length === 0 ? (
          <div className="py-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-semibold text-lg text-foreground">
              Nothing to review
            </h3>
            <p className="mt-1 text-muted-foreground text-sm">
              Flagged agent sends will show up here for approval.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Send</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage && (
                    <TableHead className="text-right">Actions</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {approvals.map((approval) => (
                  <TableRow key={approval.id}>
                    <TableCell className="max-w-xs">
                      <div className="flex items-start gap-2">
                        <Inbox className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">
                            {approval.payload.subject || "(no subject)"}
                          </p>
                          <p className="truncate text-muted-foreground text-sm">
                            {approval.payload.from} → {approval.payload.to}
                          </p>
                          {approval.payload.replyTo && (
                            <p className="truncate text-muted-foreground text-sm">
                              Reply-To: {approval.payload.replyTo}
                            </p>
                          )}
                          {approval.status === "FAILED" &&
                            approval.errorMessage && (
                              <p className="truncate text-destructive text-sm">
                                {approval.errorMessage}
                              </p>
                            )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs text-muted-foreground text-sm">
                      {approval.reason || "—"}
                    </TableCell>
                    <TableCell>{statusBadge(approval.status)}</TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        {approval.status === "PENDING" ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              disabled={pendingId === approval.id}
                              onClick={() => handleDecision(approval, "reject")}
                              size="sm"
                              variant="outline"
                            >
                              Reject
                            </Button>
                            <Button
                              disabled={pendingId === approval.id}
                              onClick={() =>
                                handleDecision(approval, "approve")
                              }
                              size="sm"
                            >
                              {pendingId === approval.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                "Approve"
                              )}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            —
                          </span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
