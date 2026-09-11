"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wraps/ui/components/ui/alert-dialog";
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
import { Bot, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { killAgent, listAgents } from "@/actions/agents";
import { Button } from "@/components/ui/button";
import type { AgentWithMeta } from "@/lib/agents";

type AgentsListProps = {
  organizationId: string;
  orgSlug: string;
  userRole: string;
};

function policySummary(agent: AgentWithMeta): string {
  const { maxPerHour, maxPerDay, allowedRecipients, allowedRecipientDomains } =
    agent.policy;
  const allowlist = allowedRecipients.length + allowedRecipientDomains.length;
  const allowlistLabel =
    allowlist === 0
      ? "any recipient"
      : `${allowlist} allowlisted ${allowlist === 1 ? "target" : "targets"}`;
  return `${maxPerHour}/hr · ${maxPerDay}/day · ${allowlistLabel}`;
}

export function AgentsList({
  organizationId,
  orgSlug,
  userRole,
}: AgentsListProps) {
  const [agents, setAgents] = useState<AgentWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [killTarget, setKillTarget] = useState<AgentWithMeta | null>(null);
  const [killing, setKilling] = useState(false);

  const canManage = userRole === "owner" || userRole === "admin";

  useEffect(() => {
    let active = true;
    async function loadData() {
      setLoading(true);
      try {
        const result = await listAgents(organizationId);
        if (!active) return;
        if (result.success) {
          setAgents(result.agents);
        } else {
          toast.error(result.error);
        }
      } catch (error) {
        toast.error(
          error instanceof TypeError
            ? "Couldn't reach the server. Check your connection and try again."
            : "Failed to load agents."
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

  async function handleKill() {
    if (!killTarget) return;
    setKilling(true);
    const result = await killAgent(killTarget.id, organizationId);
    setKilling(false);

    if (result.success) {
      // The Neon kill is durable, but the enforcer sync can fail independently.
      // Be honest: only claim the kill is enforced when the sync landed.
      if (result.syncStatus === "failed") {
        toast.error(
          result.warning ??
            "Kill recorded in Wraps, but syncing the kill switch to your AWS enforcer failed. Retry the kill or check AWS."
        );
      } else {
        toast.success(`Agent "${killTarget.name}" killed`);
      }
      setAgents((prev) =>
        prev.map((a) =>
          a.id === killTarget.id ? { ...a, status: "KILLED" } : a
        )
      );
      setKillTarget(null);
    } else {
      toast.error(result.error);
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Agents</CardTitle>
              <CardDescription>
                Each agent sends through a customer-side enforcer that checks
                its policy and kill switch on every send.
              </CardDescription>
            </div>
            <Button asChild variant="outline">
              <Link href={`/${orgSlug}/emails/agents/approvals`}>
                Approval queue
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {agents.length === 0 ? (
            <div className="py-8 text-center">
              <Bot className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 font-semibold text-lg text-foreground">
                No agents yet
              </h3>
              <p className="mt-1 text-muted-foreground text-sm">
                Create one with{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  wraps email agent create
                </code>
                .
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Policy</TableHead>
                    {canManage && (
                      <TableHead className="text-right">Actions</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((agent) => (
                    <TableRow key={agent.id}>
                      <TableCell className="font-medium text-foreground">
                        {agent.name}
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground text-sm">
                        {agent.emailAddress}
                      </TableCell>
                      <TableCell>
                        {agent.status === "ACTIVE" ? (
                          <Badge variant="secondary">
                            <ShieldCheck className="mr-1 h-3 w-3" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            <ShieldAlert className="mr-1 h-3 w-3" />
                            Killed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {policySummary(agent)}
                      </TableCell>
                      {canManage && (
                        <TableCell className="text-right">
                          {agent.status === "ACTIVE" ? (
                            <Button
                              onClick={() => setKillTarget(agent)}
                              size="sm"
                              variant="destructive"
                            >
                              Kill switch
                            </Button>
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

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setKillTarget(null);
        }}
        open={killTarget !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Kill agent "{killTarget?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This flips the kill switch and syncs it to the customer-side
              enforcer, which then blocks the agent's sends. If the sync to AWS
              fails, you'll be told to retry. This cannot be undone from the
              dashboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={killing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={killing}
              onClick={(e) => {
                e.preventDefault();
                handleKill();
              }}
              variant="destructive"
            >
              {killing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Killing...
                </>
              ) : (
                "Kill agent"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
