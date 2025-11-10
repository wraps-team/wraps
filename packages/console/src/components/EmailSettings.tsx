import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  RefreshCw,
  XCircle,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  ConfigurationSetDetails,
  EmailIdentityDetails,
  EmailSettings as EmailSettingsType,
} from "@/lib/aws-client";
import { getEmailSettings } from "@/lib/aws-client";
import type { DNSVerificationStatus } from "@/lib/dns-verification";
import { verifyDmarc, verifyTrackingDomain } from "@/lib/dns-verification";

/**
 * Status badge component for verification states
 */
function StatusBadge({
  status,
}: {
  status:
    | "SUCCESS"
    | "PENDING"
    | "FAILED"
    | "NOT_STARTED"
    | "TEMPORARY_FAILURE";
}) {
  const config = {
    SUCCESS: {
      icon: CheckCircle2,
      label: "Verified",
      variant: "default" as const,
      className:
        "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
    },
    PENDING: {
      icon: Clock,
      label: "Pending",
      variant: "secondary" as const,
      className:
        "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20",
    },
    FAILED: {
      icon: XCircle,
      label: "Failed",
      variant: "destructive" as const,
      className:
        "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
    },
    TEMPORARY_FAILURE: {
      icon: AlertCircle,
      label: "Temporary Failure",
      variant: "secondary" as const,
      className:
        "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
    },
    NOT_STARTED: {
      icon: Clock,
      label: "Not Started",
      variant: "outline" as const,
      className:
        "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-500/20",
    },
  };

  const { icon: Icon, label, className } = config[status];

  return (
    <Badge className={className} variant="outline">
      <Icon className="mr-1 h-3 w-3" />
      {label}
    </Badge>
  );
}

/**
 * Copy to clipboard button
 */
function CopyButton({ text }: { text: string }) {
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard", {
      description: "DNS record value copied successfully",
    });
  };

  return (
    <Button onClick={handleCopy} size="sm" variant="ghost">
      <Copy className="h-3 w-3" />
    </Button>
  );
}

/**
 * Domain identity section
 */
function DomainIdentitySection({
  identity,
}: {
  identity?: EmailIdentityDetails;
}) {
  if (!identity) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sending Domain</CardTitle>
          <CardDescription>No domain identity configured</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sending Domain</CardTitle>
        <CardDescription>Domain used for sending emails</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">{identity.identityName}</p>
            <p className="text-muted-foreground text-sm">Domain Identity</p>
          </div>
          <StatusBadge status={identity.verificationStatus} />
        </div>

        {!identity.verifiedForSendingStatus && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Verification Required</AlertTitle>
            <AlertDescription>
              Complete DNS verification to start sending emails from this
              domain.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * DKIM configuration section
 */
function DkimSection({ identity }: { identity?: EmailIdentityDetails }) {
  const dkim = identity?.dkimAttributes;
  const isVerified = dkim?.status === "SUCCESS";
  const [isOpen, setIsOpen] = React.useState(!isVerified);

  if (!dkim) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">DKIM Authentication</p>
            <p className="text-muted-foreground text-sm">Not configured</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">DKIM Authentication</p>
          <p className="text-muted-foreground text-sm">
            {dkim.signingEnabled ? "Enabled" : "Disabled"}
            {dkim.signingKeyLength && ` · ${dkim.signingKeyLength}`}
          </p>
        </div>
        <StatusBadge status={dkim.status} />
      </div>

      {dkim.tokens && dkim.tokens.length > 0 && (
        <Collapsible onOpenChange={setIsOpen} open={isOpen}>
          <CollapsibleTrigger asChild>
            <Button
              className="h-auto w-full justify-between p-0"
              size="sm"
              variant="ghost"
            >
              <p className="font-medium text-sm">DNS Records (CNAME)</p>
              {isOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {dkim.tokens.map((token) => (
              <div className="rounded-md border bg-muted/50 p-3" key={token}>
                <div className="mb-1 flex items-center justify-between">
                  <p className="font-mono text-xs">
                    {token}._domainkey.{identity.identityName}
                  </p>
                  <CopyButton
                    text={`${token}._domainkey.${identity.identityName}`}
                  />
                </div>
                <p className="font-mono text-muted-foreground text-xs">
                  CNAME → {token}.dkim.amazonses.com
                </p>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

/**
 * Mail-From domain section
 */
function MailFromSection({ identity }: { identity?: EmailIdentityDetails }) {
  const mailFrom = identity?.mailFromAttributes;
  const isVerified = mailFrom?.mailFromDomainStatus === "SUCCESS";
  const [isOpen, setIsOpen] = React.useState(!isVerified);

  return (
    <div className="space-y-4">
      {mailFrom?.mailFromDomain ? (
        <>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Mail-From Domain</p>
              <p className="text-muted-foreground text-sm">
                {mailFrom.mailFromDomain}
                {mailFrom.behaviorOnMxFailure &&
                  ` · ${mailFrom.behaviorOnMxFailure === "USE_DEFAULT_VALUE" ? "Fallback enabled" : "Reject on failure"}`}
              </p>
            </div>
            {mailFrom.mailFromDomainStatus && (
              <StatusBadge status={mailFrom.mailFromDomainStatus} />
            )}
          </div>

          <Collapsible onOpenChange={setIsOpen} open={isOpen}>
            <CollapsibleTrigger asChild>
              <Button
                className="h-auto w-full justify-between p-0"
                size="sm"
                variant="ghost"
              >
                <p className="font-medium text-sm">DNS Record (MX)</p>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="rounded-md border bg-muted/50 p-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-xs">
                      MX {mailFrom.mailFromDomain}
                    </p>
                    <CopyButton
                      text={`10 feedback-smtp.${identity?.identityName.split(".")[0]}.amazonses.com`}
                    />
                  </div>
                  <p className="font-mono text-muted-foreground text-xs">
                    Priority 10 → feedback-smtp.
                    {identity?.identityName.split(".")[0]}.amazonses.com
                  </p>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      ) : (
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Mail-From Domain</p>
            <p className="text-muted-foreground text-sm">
              Using default amazonses.com domain
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * DMARC policy information
 */
function DmarcSection({ identity }: { identity?: EmailIdentityDetails }) {
  const [verificationStatus, setVerificationStatus] =
    React.useState<DNSVerificationStatus | null>(null);
  const [isVerifying, setIsVerifying] = React.useState(false);

  // Default collapsed if verified, expanded otherwise
  const [isOpen, setIsOpen] = React.useState(!verificationStatus?.verified);

  // Auto-verify on mount
  React.useEffect(() => {
    if (identity?.identityName) {
      verifyDmarc(identity.identityName).then(setVerificationStatus);
    }
  }, [identity?.identityName]);

  // Update isOpen when verification status changes
  React.useEffect(() => {
    if (verificationStatus) {
      setIsOpen(!verificationStatus.verified);
    }
  }, [verificationStatus]);

  const handleVerify = async () => {
    if (!identity?.identityName) return;

    setIsVerifying(true);
    try {
      const status = await verifyDmarc(identity.identityName);
      setVerificationStatus(status);

      if (status.verified) {
        toast.success("DMARC record verified", {
          description: "DNS TXT record found and configured correctly",
        });
      } else {
        console.error("DMARC verification failed:", status.error);
        toast.error("Verification failed", {
          description: status.error || "DMARC record not found",
        });
      }
    } catch (error) {
      console.error("DMARC verification error:", error);
      toast.error("Verification error", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">DMARC Policy</p>
          <p className="text-muted-foreground text-sm">
            {verificationStatus?.verified
              ? "Configured"
              : "Recommended for better deliverability"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {verificationStatus?.verified && (
            <Badge
              className="border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400"
              variant="outline"
            >
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Verified by Wraps
            </Badge>
          )}
          <Button
            className="h-8 w-8 p-0"
            disabled={isVerifying}
            onClick={handleVerify}
            size="sm"
            variant="ghost"
          >
            <RefreshCw
              className={`h-4 w-4 ${isVerifying ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      <Collapsible onOpenChange={setIsOpen} open={isOpen}>
        <CollapsibleTrigger asChild>
          <Button
            className="h-auto w-full justify-between p-0"
            size="sm"
            variant="ghost"
          >
            <p className="font-medium text-sm">DNS Record (TXT)</p>
            {isOpen ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <div className="rounded-md border bg-muted/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-mono text-xs">
                _dmarc.{identity?.identityName || "yourdomain.com"}
              </p>
              <CopyButton
                text={`_dmarc.${identity?.identityName || "yourdomain.com"}`}
              />
            </div>
            <div className="flex items-start justify-between gap-2">
              <p className="font-mono text-muted-foreground text-xs">
                v=DMARC1; p=quarantine; rua=mailto:dmarc@
                {identity?.identityName || "yourdomain.com"}
              </p>
              <CopyButton
                text={`v=DMARC1; p=quarantine; rua=mailto:dmarc@${identity?.identityName || "yourdomain.com"}`}
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/**
 * Tracking domain section
 */
function TrackingDomainSection({
  configSet,
  region,
}: {
  configSet?: ConfigurationSetDetails;
  region?: string;
}) {
  const tracking = configSet?.trackingOptions;
  const [verificationStatus, setVerificationStatus] =
    React.useState<DNSVerificationStatus | null>(null);
  const [isVerifying, setIsVerifying] = React.useState(false);

  // Default collapsed if verified, expanded otherwise
  const [isOpen, setIsOpen] = React.useState(!verificationStatus?.verified);

  // Auto-verify on mount
  React.useEffect(() => {
    if (tracking?.customRedirectDomain && region) {
      const expectedTarget = `r.${region}.awstrack.me`;
      verifyTrackingDomain(tracking.customRedirectDomain, expectedTarget).then(
        setVerificationStatus
      );
    }
  }, [tracking?.customRedirectDomain, region]);

  // Update isOpen when verification status changes
  React.useEffect(() => {
    if (verificationStatus) {
      setIsOpen(!verificationStatus.verified);
    }
  }, [verificationStatus]);

  const handleVerify = async () => {
    if (!(tracking?.customRedirectDomain && region)) return;

    setIsVerifying(true);
    try {
      const expectedTarget = `r.${region}.awstrack.me`;
      const status = await verifyTrackingDomain(
        tracking.customRedirectDomain,
        expectedTarget
      );
      setVerificationStatus(status);

      if (status.verified) {
        toast.success("Tracking domain verified", {
          description: "DNS records are configured correctly",
        });
      } else {
        console.error("Tracking domain verification failed:", status.error);
        toast.error("Verification failed", {
          description: status.error || "DNS records not found",
        });
      }
    } catch (error) {
      console.error("Tracking domain verification error:", error);
      toast.error("Verification error", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tracking Domain</CardTitle>
        <CardDescription>
          Custom domain for open and click tracking links
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tracking?.customRedirectDomain ? (
          <>
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="font-medium">{tracking.customRedirectDomain}</p>
                <p className="text-muted-foreground text-sm">
                  Custom Tracking Domain
                </p>
              </div>
              <div className="flex items-center gap-2">
                {verificationStatus?.verified && (
                  <Badge
                    className="border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-400"
                    variant="outline"
                  >
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Verified by Wraps
                  </Badge>
                )}
                <Badge variant="outline">
                  {tracking.httpsPolicy === "REQUIRE"
                    ? "HTTPS Only"
                    : "HTTPS Optional"}
                </Badge>
                <Button
                  className="h-8 w-8 p-0"
                  disabled={isVerifying}
                  onClick={handleVerify}
                  size="sm"
                  variant="ghost"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${isVerifying ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>
            </div>

            <Collapsible onOpenChange={setIsOpen} open={isOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  className="h-auto w-full justify-between p-0"
                  size="sm"
                  variant="ghost"
                >
                  <p className="font-medium text-sm">
                    Required DNS Record (CNAME)
                  </p>
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <div className="rounded-md border bg-muted/50 p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-xs">
                      {tracking.customRedirectDomain}
                    </p>
                    <CopyButton text={tracking.customRedirectDomain} />
                  </div>
                  <div className="mt-1 flex items-start justify-between gap-2">
                    <p className="font-mono text-muted-foreground text-xs">
                      CNAME → r.{configSet?.name || "region"}.awstrack.me
                    </p>
                    <CopyButton
                      text={`r.${configSet?.name || "region"}.awstrack.me`}
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            No custom tracking domain configured. Using default awstrack.me
            domain.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Configuration set settings section
 */
function ConfigurationSetSection({
  configSet,
  onRefresh,
}: {
  configSet?: ConfigurationSetDetails;
  onRefresh?: () => Promise<void>;
}) {
  const [sendingDialogOpen, setSendingDialogOpen] = React.useState(false);
  const [reputationDialogOpen, setReputationDialogOpen] = React.useState(false);
  const [isUpdating, setIsUpdating] = React.useState(false);

  if (!configSet) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Configuration Set</CardTitle>
          <CardDescription>No configuration set found</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const handleToggleSending = async () => {
    setIsUpdating(true);
    try {
      const token = sessionStorage.getItem("wraps-auth-token");
      const newState = !configSet.sendingOptions?.sendingEnabled;

      const response = await fetch(
        `/api/settings/config-set/sending?token=${token}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ enabled: newState }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update: ${response.statusText}`);
      }

      setSendingDialogOpen(false);
      toast.success(
        newState ? "Email sending enabled" : "Email sending disabled"
      );

      // Refresh settings
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      console.error("Failed to toggle sending:", error);
      toast.error("Failed to update setting", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleReputation = async () => {
    setIsUpdating(true);
    try {
      const token = sessionStorage.getItem("wraps-auth-token");
      const newState = !configSet.reputationOptions?.reputationMetricsEnabled;

      const response = await fetch(
        `/api/settings/config-set/reputation?token=${token}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ enabled: newState }),
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to update: ${response.statusText}`);
      }

      setReputationDialogOpen(false);
      toast.success(
        newState ? "Reputation metrics enabled" : "Reputation metrics disabled"
      );

      // Refresh settings
      if (onRefresh) {
        await onRefresh();
      }
    } catch (error) {
      console.error("Failed to toggle reputation:", error);
      toast.error("Failed to update setting", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration Set</CardTitle>
        <CardDescription>
          Email sending and tracking configuration
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="font-medium">{configSet.name}</p>
          <p className="text-muted-foreground text-sm">
            Configuration Set Name
          </p>
        </div>

        <Separator />

        {/* Sending Enabled */}
        {configSet.sendingOptions && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex-1 space-y-0.5">
                <p className="font-medium text-sm">Email Sending</p>
                <p className="text-muted-foreground text-sm">
                  {configSet.sendingOptions.sendingEnabled
                    ? "Emails can be sent"
                    : "Email sending is disabled"}
                </p>
              </div>
              <Button
                onClick={() => setSendingDialogOpen(true)}
                size="sm"
                variant={
                  configSet.sendingOptions.sendingEnabled
                    ? "destructive"
                    : "default"
                }
              >
                {configSet.sendingOptions.sendingEnabled ? "Disable" : "Enable"}
              </Button>
            </div>

            <AlertDialog
              onOpenChange={setSendingDialogOpen}
              open={sendingDialogOpen}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {configSet.sendingOptions.sendingEnabled
                      ? "Disable email sending?"
                      : "Enable email sending?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {configSet.sendingOptions.sendingEnabled
                      ? "All outgoing emails will be blocked until you re-enable sending. Emails in the queue will not be sent."
                      : "This will allow emails to be sent through this configuration set. Make sure your domain is verified before enabling."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isUpdating}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={isUpdating}
                    onClick={handleToggleSending}
                  >
                    {isUpdating
                      ? "Updating..."
                      : configSet.sendingOptions.sendingEnabled
                        ? "Disable sending"
                        : "Enable sending"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}

        {/* Reputation Metrics */}
        {configSet.reputationOptions && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex-1 space-y-0.5">
                <p className="font-medium text-sm">Reputation Metrics</p>
                <p className="text-muted-foreground text-sm">
                  {configSet.reputationOptions.reputationMetricsEnabled
                    ? "Tracking bounce and complaint rates"
                    : "Reputation tracking disabled"}
                </p>
              </div>
              <Button
                onClick={() => setReputationDialogOpen(true)}
                size="sm"
                variant="outline"
              >
                {configSet.reputationOptions.reputationMetricsEnabled
                  ? "Disable"
                  : "Enable"}
              </Button>
            </div>

            <AlertDialog
              onOpenChange={setReputationDialogOpen}
              open={reputationDialogOpen}
            >
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {configSet.reputationOptions.reputationMetricsEnabled
                      ? "Disable reputation metrics?"
                      : "Enable reputation metrics?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {configSet.reputationOptions.reputationMetricsEnabled
                      ? "You will stop collecting bounce and complaint rate data. Historical data will be preserved but no new metrics will be tracked."
                      : "This will start tracking bounce and complaint rates for your sending domain. This helps monitor your email reputation and deliverability."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isUpdating}>
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={isUpdating}
                    onClick={handleToggleReputation}
                  >
                    {isUpdating
                      ? "Updating..."
                      : configSet.reputationOptions.reputationMetricsEnabled
                        ? "Disable metrics"
                        : "Enable metrics"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}

        {/* TLS Policy */}
        {configSet.deliveryOptions?.tlsPolicy && (
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="font-medium text-sm">TLS Encryption</p>
              <p className="text-muted-foreground text-sm">
                {configSet.deliveryOptions.tlsPolicy === "REQUIRE"
                  ? "Required for all connections"
                  : "Optional (opportunistic)"}
              </p>
            </div>
            <Badge variant="outline">
              {configSet.deliveryOptions.tlsPolicy === "REQUIRE"
                ? "Required"
                : "Optional"}
            </Badge>
          </div>
        )}

        {/* Suppression List */}
        {configSet.suppressionOptions && (
          <div className="space-y-2">
            <div className="space-y-0.5">
              <p className="font-medium text-sm">Suppression List</p>
              <p className="text-muted-foreground text-sm">
                Automatically suppress emails to addresses that bounced or
                complained
              </p>
            </div>
            {configSet.suppressionOptions.suppressedReasons &&
            configSet.suppressionOptions.suppressedReasons.length > 0 ? (
              <div className="flex gap-2">
                {configSet.suppressionOptions.suppressedReasons.map(
                  (reason) => (
                    <Badge key={reason} variant="secondary">
                      {reason}
                    </Badge>
                  )
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Not configured</p>
            )}
          </div>
        )}

        {/* Dedicated IP Pool */}
        {configSet.deliveryOptions?.sendingPoolName && (
          <div>
            <p className="font-medium text-sm">IP Pool</p>
            <p className="text-muted-foreground text-sm">
              {configSet.deliveryOptions.sendingPoolName}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Main Email Settings component
 */
export function EmailSettings() {
  const [settings, setSettings] = React.useState<EmailSettingsType | null>(
    null
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const fetchSettings = React.useCallback(async () => {
    try {
      setLoading(true);
      const data = await getEmailSettings();
      setSettings(data);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch email settings:", err);
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  if (loading) {
    return (
      <>
        <div>
          <h1 className="font-semibold text-3xl tracking-tight">
            Email Settings
          </h1>
          <p className="mt-2 text-muted-foreground">
            Configure your email settings and preferences
          </p>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {/* Sending Domain Skeleton - spans 2 rows */}
          <Card className="md:row-span-2">
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="mt-2 h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Identity */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-px w-full" />
              {/* DKIM */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-px w-full" />
              {/* Mail-From */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-px w-full" />
              {/* DMARC */}
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-44" />
              </div>
            </CardContent>
          </Card>

          {/* Configuration Set Skeleton */}
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="mt-2 h-4 w-64" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>

          {/* Tracking Domain Skeleton */}
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="mt-2 h-4 w-64" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <div>
          <h1 className="font-semibold text-3xl tracking-tight">
            Email Settings
          </h1>
          <p className="mt-2 text-muted-foreground">
            Configure your email settings and preferences
          </p>
        </div>

        <Alert className="mt-6" variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Settings</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <>
      <div>
        <h1 className="font-semibold text-3xl tracking-tight">
          Email Settings
        </h1>
        <p className="mt-2 text-muted-foreground">
          Configure your email settings and preferences
        </p>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* Sending Domain - Combined Card */}
        <Card className="md:row-span-2">
          <CardHeader>
            <CardTitle>Sending Domain</CardTitle>
            <CardDescription>
              Email domain configuration and authentication
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Domain Identity Status */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="font-medium">
                    {settings?.identity?.identityName}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Domain Identity
                  </p>
                </div>
                <StatusBadge
                  status={
                    settings?.identity?.verificationStatus || "NOT_STARTED"
                  }
                />
              </div>
            </div>

            <Separator />

            {/* DKIM Section */}
            <DkimSection identity={settings?.identity} />

            <Separator />

            {/* Mail-From Section */}
            <MailFromSection identity={settings?.identity} />

            <Separator />

            {/* DMARC Section */}
            <DmarcSection identity={settings?.identity} />
          </CardContent>
        </Card>

        {/* Configuration Set */}
        <ConfigurationSetSection
          configSet={settings?.configurationSet}
          onRefresh={fetchSettings}
        />

        {/* Tracking Domain */}
        <TrackingDomainSection
          configSet={settings?.configurationSet}
          region={settings?.region}
        />
      </div>
    </>
  );
}
