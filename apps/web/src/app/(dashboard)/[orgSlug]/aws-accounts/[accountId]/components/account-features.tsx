"use client";

import type { awsAccount } from "@wraps/db";
import type { InferSelectModel } from "drizzle-orm";
import {
  Archive,
  CheckCircle2,
  Database,
  Loader2,
  Radio,
  RefreshCw,
  Settings2,
  XCircle,
} from "lucide-react";
import { useState, useTransition } from "react";
import { scanAWSAccountFeatures } from "@/actions/aws-accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type AccountFeaturesProps = {
  account: InferSelectModel<typeof awsAccount>;
  organizationId: string;
};

export function AccountFeatures({
  account,
  organizationId,
}: AccountFeaturesProps) {
  const [isPending, startTransition] = useTransition();
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    message: string;
    features?: {
      archivingEnabled: boolean;
      eventHistoryEnabled: boolean;
      eventTrackingEnabled: boolean;
      customTrackingDomain?: string;
    };
  } | null>(null);

  const handleScanFeatures = () => {
    startTransition(async () => {
      setScanResult(null);
      const result = await scanAWSAccountFeatures(account.id, organizationId);

      if (result.success) {
        setScanResult({
          success: true,
          message: "Features scanned successfully",
          features: result.features,
        });
      } else {
        setScanResult({
          success: false,
          message: result.error,
        });
      }

      // Clear message after 5 seconds
      setTimeout(() => setScanResult(null), 5000);
    });
  };

  // Get feature status - use scan result if available, otherwise use account data
  const features = scanResult?.features || {
    archivingEnabled: account.archivingEnabled,
    eventHistoryEnabled: account.eventHistoryEnabled,
    eventTrackingEnabled: account.eventTrackingEnabled,
    customTrackingDomain: account.customTrackingDomain ?? undefined,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Deployed Features</CardTitle>
            <CardDescription>
              Features detected in your AWS account
            </CardDescription>
          </div>
          <Button
            disabled={isPending}
            onClick={handleScanFeatures}
            size="sm"
            variant="outline"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Scan Features
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Scan Result Message */}
        {scanResult && (
          <>
            <div
              className={`rounded-md border p-3 ${
                scanResult.success
                  ? "border-green-200 bg-green-50 text-green-800"
                  : "border-red-200 bg-red-50 text-red-800"
              }`}
            >
              <div className="flex items-center gap-2">
                {scanResult.success ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                <span className="text-sm">{scanResult.message}</span>
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* Email Archiving */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Archive className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h4 className="font-medium text-sm">Email Archiving</h4>
              <p className="text-muted-foreground text-xs">
                Full email content storage via SES Mail Manager
              </p>
            </div>
          </div>
          <div>
            {features.archivingEnabled ? (
              <Badge className="gap-1" variant="default">
                <CheckCircle2 className="h-3 w-3" />
                Enabled
              </Badge>
            ) : (
              <Badge className="gap-1" variant="secondary">
                <XCircle className="h-3 w-3" />
                Not Enabled
              </Badge>
            )}
          </div>
        </div>

        <Separator />

        {/* Event History */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <Database className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h4 className="font-medium text-sm">Event History</h4>
              <p className="text-muted-foreground text-xs">
                Email event storage in DynamoDB
              </p>
            </div>
          </div>
          <div>
            {features.eventHistoryEnabled ? (
              <Badge className="gap-1" variant="default">
                <CheckCircle2 className="h-3 w-3" />
                Enabled
              </Badge>
            ) : (
              <Badge className="gap-1" variant="secondary">
                <XCircle className="h-3 w-3" />
                Not Enabled
              </Badge>
            )}
          </div>
        </div>

        <Separator />

        {/* Event Tracking */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
              <Radio className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h4 className="font-medium text-sm">Event Tracking</h4>
              <p className="text-muted-foreground text-xs">
                Real-time email events via EventBridge
              </p>
            </div>
          </div>
          <div>
            {features.eventTrackingEnabled ? (
              <Badge className="gap-1" variant="default">
                <CheckCircle2 className="h-3 w-3" />
                Enabled
              </Badge>
            ) : (
              <Badge className="gap-1" variant="secondary">
                <XCircle className="h-3 w-3" />
                Not Enabled
              </Badge>
            )}
          </div>
        </div>

        {/* Custom Tracking Domain (if configured) */}
        {features.customTrackingDomain && (
          <>
            <Separator />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                  <Settings2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h4 className="font-medium text-sm">
                    Custom Tracking Domain
                  </h4>
                  <p className="text-muted-foreground text-xs">
                    {features.customTrackingDomain}
                  </p>
                </div>
              </div>
              <Badge className="gap-1" variant="default">
                <CheckCircle2 className="h-3 w-3" />
                Configured
              </Badge>
            </div>
          </>
        )}

        <Separator />

        {/* Help Text */}
        <div className="rounded-md bg-muted p-3">
          <p className="text-muted-foreground text-xs">
            Click "Scan Features" to detect features deployed in your AWS
            account. This queries your AWS resources to identify enabled
            features like email archiving and updates the dashboard accordingly.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
