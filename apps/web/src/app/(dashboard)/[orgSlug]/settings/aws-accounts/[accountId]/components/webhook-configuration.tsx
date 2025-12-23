"use client";

import type { awsAccount } from "@wraps/db";
import type { InferSelectModel } from "drizzle-orm";
import {
  AlertCircle,
  CheckCircle2,
  Link2,
  Loader2,
  Unlink,
} from "lucide-react";
import { useState } from "react";
import {
  removeWebhookSecretAction,
  saveWebhookSecretAction,
} from "@/actions/aws-accounts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type WebhookConfigurationProps = {
  account: InferSelectModel<typeof awsAccount>;
};

export function WebhookConfiguration({ account }: WebhookConfigurationProps) {
  const [webhookSecret, setWebhookSecret] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isConnected = !!account.webhookSecret;

  const handleSave = async () => {
    if (!webhookSecret.trim()) {
      setError("Please enter a webhook secret");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const result = await saveWebhookSecretAction(account.id, webhookSecret);

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

    const result = await removeWebhookSecretAction(account.id);

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
          Event Webhook
        </CardTitle>
        <CardDescription>
          Connect your AWS account to receive real-time email events (delivered,
          opened, clicked, bounced) in the Wraps dashboard.
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
                Events are being sent to Wraps
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
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-600">
              {success}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Configuration Form */}
        {isConnected ? (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Your webhook is configured and events are being sent to the Wraps
              dashboard. You can disconnect if you want to stop receiving
              events.
            </p>
            <Button
              className="text-destructive hover:bg-destructive/10"
              disabled={isLoading}
              onClick={handleDisconnect}
              variant="outline"
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unlink className="mr-2 h-4 w-4" />
              )}
              Disconnect Webhook
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="webhookSecret">Webhook Secret</Label>
              <Input
                className="font-mono text-sm"
                id="webhookSecret"
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder="Paste your webhook secret from the CLI here"
                type="text"
                value={webhookSecret}
              />
              <p className="text-muted-foreground text-xs">
                Run{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  wraps email upgrade
                </code>{" "}
                and select "Connect to Wraps Dashboard" to generate a webhook
                secret.
              </p>
            </div>
            <Button disabled={isLoading || !webhookSecret} onClick={handleSave}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Link2 className="mr-2 h-4 w-4" />
              )}
              Connect Webhook
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
