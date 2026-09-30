"use client";

import { Alert, AlertDescription } from "@wraps/ui/components/ui/alert";
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

type WebhookConfigurationProps = {
  account: ClientAccount;
};

export function WebhookConfiguration({ account }: WebhookConfigurationProps) {
  const [webhookSecret, setWebhookSecret] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const isConnected = account.webhookConnected;

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
          Platform Connection
        </CardTitle>
        <CardDescription>
          Connect your AWS account to the Wraps platform to stream real-time
          email events to your dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 font-medium text-green-800 text-xs">
                <CheckCircle2 className="h-3 w-3" />
                Connected
              </span>
              <span className="text-muted-foreground text-sm">
                Real-time events streaming to Wraps dashboard
              </span>
            </>
          ) : (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 font-medium text-gray-800 text-xs">
              Not Connected
            </span>
          )}
        </div>

        <Separator />

        {/* Success/Error Messages */}
        {success && (
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-success" />
            <div className="col-start-2 grid justify-items-start gap-1 text-sm text-success [&_p]:leading-relaxed">
              {success}
            </div>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Connected State */}
        {isConnected ? (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Your account is connected and events are streaming to the Wraps
              dashboard. You can disconnect if you want to stop receiving
              events.
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
              Disconnect
            </Button>
          </div>
        ) : (
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
                  Advanced
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
