"use client";

import { Alert, AlertDescription } from "@wraps/ui/components/ui/alert";
import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wraps/ui/components/ui/collapsible";
import { Label } from "@wraps/ui/components/ui/label";
import { Separator } from "@wraps/ui/components/ui/separator";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Link2,
  Loader2,
  Terminal,
  Unlink,
} from "lucide-react";
import { useState } from "react";
import {
  removeWebhookSecretAction,
  saveWebhookSecretAction,
} from "@/actions/aws-accounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ClientAccount } from "../lib/client-account";
import { getStreamingStatus } from "../lib/streaming-status";

type WebhookConfigurationProps = {
  account: ClientAccount;
  region: string;
  /** ISO time of the last SES event received, or null if none yet. */
  lastEventReceivedAt: string | null;
  /** ISO time the feed was flagged stalled, or null if it is not. */
  staleSince: string | null;
  canManage: boolean;
};

export function WebhookConfiguration({
  account,
  region,
  lastEventReceivedAt,
  staleSince,
  canManage,
}: WebhookConfigurationProps) {
  const [webhookSecret, setWebhookSecret] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const isConnected = account.webhookConnected;

  const status = getStreamingStatus({
    connected: isConnected,
    lastEventReceivedAt,
    staleSince,
  });

  const handleSave = async () => {
    if (!webhookSecret.trim()) {
      setError("Please enter a webhook secret");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const result = await saveWebhookSecretAction(
      account.id,
      webhookSecret,
      account.organizationId
    );

    setIsLoading(false);

    if (result.success) {
      setSuccess(result.message);
      setWebhookSecret("");
    } else {
      setError(result.error);
    }
  };

  const handleDisconnect = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const result = await removeWebhookSecretAction(
      account.id,
      account.organizationId
    );

    setIsLoading(false);

    if (result.success) {
      setSuccess(result.message);
    } else {
      setError(result.error);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Event streaming · {region}
        </CardTitle>
        <CardDescription>
          Delivery, bounce, complaint, open and click events from SES. They
          power the email timeline, analytics and suppression handling.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Streaming status */}
        <div className="flex items-center gap-2">
          <Badge variant={status.variant}>{status.label}</Badge>
          {status.detail && (
            <span className="text-muted-foreground text-sm">
              {status.detail}
            </span>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          Not receiving events? Run{" "}
          <code className="font-mono">wraps email doctor</code>.
        </p>

        {canManage && <Separator />}

        {/* Success/Error Messages */}
        {canManage && success && (
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-success" />
            <div className="col-start-2 grid justify-items-start gap-1 text-sm text-success [&_p]:leading-relaxed">
              {success}
            </div>
          </Alert>
        )}

        {canManage && error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Connected State */}
        {canManage && isConnected && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Disconnecting stops events from reaching Wraps. It does not remove
              this account from Wraps.
            </p>
            <Button
              disabled={isLoading}
              onClick={handleDisconnect}
              variant="ghost-destructive"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unlink className="mr-2 h-4 w-4" />
              )}
              Disconnect streaming
            </Button>
          </div>
        )}

        {canManage && !isConnected && (
          <div className="space-y-4">
            {/* CLI Command - Primary CTA */}
            <div className="rounded-lg border bg-muted/50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <Terminal className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">
                  Connect via the Wraps CLI
                </span>
              </div>
              <code className="block rounded-md border bg-background px-3 py-2 font-mono text-sm">
                wraps platform connect
              </code>
              <p className="mt-2 text-muted-foreground text-xs">
                This command automatically configures the webhook secret and
                connects your account to the Wraps platform.
              </p>
            </div>

            {/* Advanced: Manual Webhook Input */}
            <Collapsible onOpenChange={setAdvancedOpen} open={advancedOpen}>
              <CollapsibleTrigger asChild>
                <Button className="gap-1" size="sm" variant="ghost">
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
                  />
                  Advanced: set webhook secret manually
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="webhookSecret">Webhook Secret</Label>
                  <Input
                    className="font-mono text-sm"
                    id="webhookSecret"
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    placeholder="Paste a webhook secret manually"
                    type="text"
                    value={webhookSecret}
                  />
                  <p className="text-muted-foreground text-xs">
                    Only use this if you need to manually configure the webhook
                    secret instead of using the CLI.
                  </p>
                </div>
                <Button
                  disabled={isLoading || !webhookSecret}
                  onClick={handleSave}
                  size="sm"
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="mr-2 h-4 w-4" />
                  )}
                  Connect Manually
                </Button>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
