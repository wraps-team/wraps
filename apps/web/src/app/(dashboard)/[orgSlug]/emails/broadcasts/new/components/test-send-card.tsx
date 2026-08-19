"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { CheckCircle2, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  type SendBroadcastTestInput,
  sendBroadcastTest,
} from "@/actions/broadcast-test-send";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TestSendCardProps = {
  organizationId: string;
  /** Everything needed to render and send exactly what the broadcast will. */
  payload: Omit<SendBroadcastTestInput, "to">;
  /** Prefilled recipient — the signed-in user, who can always receive it. */
  defaultTo: string;
  /** Blocks the button when the composed broadcast isn't sendable yet. */
  disabledReason?: string;
};

export function TestSendCard({
  organizationId,
  payload,
  defaultTo,
  disabledReason,
}: TestSendCardProps) {
  const [to, setTo] = useState(defaultTo);
  const [isPending, startTransition] = useTransition();
  const [lastSentTo, setLastSentTo] = useState<string | null>(null);

  const handleSend = () => {
    startTransition(async () => {
      const result = await sendBroadcastTest(organizationId, {
        ...payload,
        to: to.trim(),
      });

      if (result.success) {
        setLastSentTo(to.trim());
        toast.success(`Test sent to ${to.trim()}`, {
          description: [
            result.renderedAs
              ? `Rendered with ${result.renderedAs}'s contact data.`
              : null,
            ...result.caveats,
          ]
            .filter(Boolean)
            .join(" "),
          duration: 10_000,
        });
      } else {
        toast.error("Test send failed", {
          description: result.error,
          duration: 15_000,
        });
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Send a test first</CardTitle>
        <CardDescription>
          Sends one copy of this broadcast to a single address, rendered with a
          real contact's data. Nothing is recorded — it does not appear in
          broadcast history and does not affect any counts.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="Test send recipient"
            className="flex-1"
            onChange={(e) => setTo(e.target.value)}
            placeholder="you@example.com"
            type="email"
            value={to}
          />
          <Button
            disabled={isPending || !to.trim() || Boolean(disabledReason)}
            onClick={handleSend}
            type="button"
            variant="outline"
          >
            <Send className="mr-2 h-4 w-4" />
            {isPending ? "Sending test..." : "Send test"}
          </Button>
        </div>
        {disabledReason ? (
          <p className="text-muted-foreground text-xs">{disabledReason}</p>
        ) : null}
        {lastSentTo && !isPending ? (
          <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            Last test sent to {lastSentTo}. Check that it arrived and reads
            correctly before sending to the full list.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
