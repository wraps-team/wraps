"use client";

import type { awsAccount } from "@wraps/db";
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
import type { InferSelectModel } from "drizzle-orm";
import {
  Archive,
  AtSign,
  CheckCircle2,
  ChevronDown,
  Database,
  Globe,
  Inbox,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  MousePointerClick,
  Phone,
  RefreshCw,
  Server,
  Settings,
  Shield,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import { useState, useTransition } from "react";
import { scanAWSAccountFeatures } from "@/actions/aws-accounts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AccountFeaturesProps = {
  account: InferSelectModel<typeof awsAccount>;
  organizationId: string;
};

type FeatureItemProps = {
  icon: React.ReactNode;
  iconBgClass: string;
  name: string;
  description: string;
  enabled: boolean;
  detail?: string;
};

function FeatureItem({
  icon,
  iconBgClass,
  name,
  description,
  enabled,
  detail,
}: FeatureItemProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md",
            iconBgClass
          )}
        >
          {icon}
        </div>
        <div>
          <p className="font-medium text-sm">{name}</p>
          <p className="text-muted-foreground text-xs">{description}</p>
          {detail && <p className="text-muted-foreground text-xs">{detail}</p>}
        </div>
      </div>
      {enabled ? (
        <Badge className="gap-1" variant="default">
          <CheckCircle2 className="h-3 w-3" />
          Enabled
        </Badge>
      ) : (
        <Badge className="gap-1" variant="secondary">
          <XCircle className="h-3 w-3" />
          Disabled
        </Badge>
      )}
    </div>
  );
}

export function AccountFeatures({
  account,
  organizationId,
}: AccountFeaturesProps) {
  const [isPending, startTransition] = useTransition();
  const [emailOpen, setEmailOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [scanResult, setScanResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Use scanned features from account
  const features = account.features;
  const emailFeatures = features?.email;
  const smsFeatures = features?.sms;
  const identities = emailFeatures?.identities ?? [];

  const handleScanFeatures = () => {
    startTransition(async () => {
      setScanResult(null);
      const result = await scanAWSAccountFeatures(account.id, organizationId);

      if (result.success) {
        setScanResult({
          success: true,
          message: "Features scanned successfully",
        });
        // Auto-expand sections after scan
        setEmailOpen(true);
        setSmsOpen(true);
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

  const dedicatedIpCount = emailFeatures?.dedicatedIpCount ?? 0;
  const trackedEvents = emailFeatures?.trackedEvents ?? [];
  const sesSandbox = emailFeatures?.sandbox ?? true; // Default to sandbox
  const smsPhoneNumbers = smsFeatures?.phoneNumbers ?? [];

  const emailFeatureStatus = {
    // Core (always enabled with Wraps config)
    configSet: true,
    tlsRequired: true,
    reputationMetrics: true,
    suppressionList: true,
    openClickTracking: true,
    // Optional features (from scan)
    eventTracking: trackedEvents.length > 0,
    eventHistory: !!emailFeatures?.eventHistoryEnabled,
    archiving: !!emailFeatures?.archivingEnabled,
    customTrackingDomain: !!emailFeatures?.customTrackingDomain,
    dedicatedIp: dedicatedIpCount > 0,
    inbound: !!emailFeatures?.inboundBucketName,
  };

  // OPTIONAL (SES's default when the field is omitted) wraps click links in
  // the original link's protocol, so an https:// link resolves against a
  // tracking domain with no matching certificate — the recipient gets a
  // certificate warning instead of the landing page. Absent policy means the
  // row predates the scan field, which is unknown, not broken, so say
  // nothing extra in that case.
  const trackingDomainDetail = emailFeatures?.customTrackingDomain
    ? emailFeatures.trackingHttpsPolicy &&
      emailFeatures.trackingHttpsPolicy !== "REQUIRE"
      ? `${emailFeatures.customTrackingDomain} — HTTP only — https:// links may show recipients a certificate warning`
      : emailFeatures.customTrackingDomain
    : undefined;

  // Count enabled email features (total enabled / total features)
  const emailFeaturesEnabled =
    Object.values(emailFeatureStatus).filter(Boolean).length;
  const emailFeaturesTotal = Object.keys(emailFeatureStatus).length;

  // Count enabled SMS features
  const smsFeaturesEnabled = [
    smsPhoneNumbers.length > 0,
    smsFeatures?.eventHistoryEnabled,
  ].filter(Boolean).length;
  const smsFeaturesTotal = 2;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Deployed Features</CardTitle>
            <CardDescription>
              Infrastructure deployed in your AWS account
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
          <div
            className={cn(
              "rounded-md border p-3",
              scanResult.success
                ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200"
                : "border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
            )}
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
        )}

        {/* Email Section - Collapsible */}
        <Collapsible onOpenChange={setEmailOpen} open={emailOpen}>
          <CollapsibleTrigger asChild>
            <Button
              className="flex w-full items-center justify-between p-2 hover:bg-muted/50"
              variant="ghost"
            >
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                <span className="font-semibold">Email</span>
                {sesSandbox ? (
                  <Badge className="ml-2" variant="outline">
                    Sandbox
                  </Badge>
                ) : (
                  <Badge className="ml-2" variant="default">
                    Production
                  </Badge>
                )}
                <Badge variant="secondary">
                  {emailFeaturesEnabled}/{emailFeaturesTotal} enabled
                </Badge>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  emailOpen && "rotate-180"
                )}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 pl-2">
            {/* Sending Identities */}
            {identities.length > 0 && (
              <div className="mb-4 border-b pb-4">
                <div className="mb-2 flex items-center gap-2">
                  <AtSign className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">
                    Sending Identities ({identities.length})
                  </span>
                </div>
                <div className="space-y-1 pl-6">
                  {identities.map((identity) => (
                    <div
                      className="flex items-center justify-between py-1"
                      key={identity.identity}
                    >
                      <div className="flex items-center gap-2">
                        {identity.type === "DOMAIN" ? (
                          <Globe className="h-3 w-3 text-muted-foreground" />
                        ) : (
                          <Mail className="h-3 w-3 text-muted-foreground" />
                        )}
                        <span className="font-mono text-sm">
                          {identity.identity}
                        </span>
                      </div>
                      <Badge className="text-xs" variant="outline">
                        {identity.type === "DOMAIN" ? "Domain" : "Email"}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Core Infrastructure */}
            <FeatureItem
              description="wraps-email-tracking"
              detail={emailFeatures?.configSetName || "wraps-email-tracking"}
              enabled={emailFeatureStatus.configSet}
              icon={<Settings className="h-4 w-4 text-slate-600" />}
              iconBgClass="bg-slate-100 dark:bg-slate-800"
              name="SES Configuration Set"
            />

            <FeatureItem
              description="Enforce TLS encryption for outbound emails"
              enabled={emailFeatureStatus.tlsRequired}
              icon={<Lock className="h-4 w-4 text-blue-600" />}
              iconBgClass="bg-blue-100 dark:bg-blue-900"
              name="TLS Required"
            />

            <FeatureItem
              description="Track bounce and complaint rates"
              enabled={emailFeatureStatus.reputationMetrics}
              icon={<TrendingUp className="h-4 w-4 text-green-600" />}
              iconBgClass="bg-green-100 dark:bg-green-900"
              name="Reputation Metrics"
            />

            <FeatureItem
              description="Auto-suppress bounced and complained addresses"
              enabled={emailFeatureStatus.suppressionList}
              icon={<Shield className="h-4 w-4 text-orange-600" />}
              iconBgClass="bg-orange-100 dark:bg-orange-900"
              name="Suppression List"
            />

            {/* Tracking */}
            <FeatureItem
              description="Track email opens and link clicks"
              enabled={emailFeatureStatus.openClickTracking}
              icon={<MousePointerClick className="h-4 w-4 text-indigo-600" />}
              iconBgClass="bg-indigo-100 dark:bg-indigo-900"
              name="Open & Click Tracking"
            />

            {/* Event Tracking */}
            <FeatureItem
              description="Real-time event streaming via EventBridge"
              detail={
                trackedEvents.length > 0
                  ? `${trackedEvents.length} event type${trackedEvents.length > 1 ? "s" : ""}`
                  : undefined
              }
              enabled={emailFeatureStatus.eventTracking}
              icon={<Zap className="h-4 w-4 text-yellow-600" />}
              iconBgClass="bg-yellow-100 dark:bg-yellow-900"
              name="Event Tracking"
            />

            {/* Show tracked events if any */}
            {trackedEvents.length > 0 && (
              <div className="ml-11 flex flex-wrap gap-1 pb-2">
                {trackedEvents.map((event) => (
                  <Badge
                    className="text-xs font-normal"
                    key={event}
                    variant="outline"
                  >
                    {event}
                  </Badge>
                ))}
              </div>
            )}

            <FeatureItem
              description="Store events in DynamoDB for analytics"
              enabled={emailFeatureStatus.eventHistory}
              icon={<Database className="h-4 w-4 text-purple-600" />}
              iconBgClass="bg-purple-100 dark:bg-purple-900"
              name="Event History"
            />

            {/* Archiving */}
            <FeatureItem
              description="Full email content storage via Mail Manager"
              detail={
                emailFeatures?.archiveArn ? "Archive configured" : undefined
              }
              enabled={emailFeatureStatus.archiving}
              icon={<Archive className="h-4 w-4 text-teal-600" />}
              iconBgClass="bg-teal-100 dark:bg-teal-900"
              name="Email Archiving"
            />

            {/* Custom Tracking Domain */}
            <FeatureItem
              description="Branded tracking URLs"
              detail={trackingDomainDetail}
              enabled={emailFeatureStatus.customTrackingDomain}
              icon={<Globe className="h-4 w-4 text-cyan-600" />}
              iconBgClass="bg-cyan-100 dark:bg-cyan-900"
              name="Custom Tracking Domain"
            />

            {/* Dedicated IP */}
            <FeatureItem
              description="Dedicated sending IP address"
              detail={
                dedicatedIpCount > 0
                  ? `${dedicatedIpCount} IP${dedicatedIpCount > 1 ? "s" : ""} assigned`
                  : undefined
              }
              enabled={emailFeatureStatus.dedicatedIp}
              icon={<Server className="h-4 w-4 text-rose-600" />}
              iconBgClass="bg-rose-100 dark:bg-rose-900"
              name="Dedicated IP"
            />

            {/* Inbound Email */}
            <FeatureItem
              description="Receive emails via SES Receipt Rules"
              detail={emailFeatures?.inboundBucketName}
              enabled={emailFeatureStatus.inbound}
              icon={<Inbox className="h-4 w-4 text-emerald-600" />}
              iconBgClass="bg-emerald-100 dark:bg-emerald-900"
              name="Inbound Email"
            />
          </CollapsibleContent>
        </Collapsible>

        {/* SMS Section - Collapsible */}
        <Collapsible onOpenChange={setSmsOpen} open={smsOpen}>
          <CollapsibleTrigger asChild>
            <Button
              className="flex w-full items-center justify-between p-2 hover:bg-muted/50"
              variant="ghost"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <span className="font-semibold">SMS</span>
                <Badge className="ml-2" variant="secondary">
                  {smsFeaturesEnabled}/{smsFeaturesTotal} enabled
                </Badge>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform",
                  smsOpen && "rotate-180"
                )}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 pl-2">
            {/* Phone Numbers */}
            {smsPhoneNumbers.length > 0 ? (
              <div className="mb-4 border-b pb-4">
                <div className="mb-2 flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">
                    Phone Numbers ({smsPhoneNumbers.length})
                  </span>
                </div>
                <div className="space-y-2 pl-6">
                  {smsPhoneNumbers.map((pn) => (
                    <div
                      className="flex items-center justify-between py-1"
                      key={pn.phoneNumber}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">
                          {pn.phoneNumber}
                        </span>
                        <Badge className="text-xs" variant="outline">
                          {pn.type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        {pn.capabilities.includes("SMS") && (
                          <Badge className="text-xs" variant="secondary">
                            SMS
                          </Badge>
                        )}
                        {pn.capabilities.includes("VOICE") && (
                          <Badge className="text-xs" variant="secondary">
                            Voice
                          </Badge>
                        )}
                        <Badge
                          className="text-xs"
                          variant={
                            pn.status === "ACTIVE" ? "default" : "outline"
                          }
                        >
                          {pn.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <FeatureItem
                description="AWS End User Messaging phone numbers"
                enabled={false}
                icon={<Phone className="h-4 w-4 text-teal-600" />}
                iconBgClass="bg-teal-100 dark:bg-teal-900"
                name="Phone Numbers"
              />
            )}

            <FeatureItem
              description="Store delivery events in DynamoDB"
              enabled={!!smsFeatures?.eventHistoryEnabled}
              icon={<Database className="h-4 w-4 text-purple-600" />}
              iconBgClass="bg-purple-100 dark:bg-purple-900"
              name="SMS Event History"
            />
          </CollapsibleContent>
        </Collapsible>

        {/* Help Text */}
        <div className="rounded-md bg-muted p-3">
          <p className="text-muted-foreground text-xs">
            Click &quot;Scan Features&quot; to detect deployed infrastructure.
            Use{" "}
            <code className="rounded bg-muted-foreground/20 px-1">
              wraps email init
            </code>{" "}
            or{" "}
            <code className="rounded bg-muted-foreground/20 px-1">
              wraps email upgrade
            </code>{" "}
            to deploy additional features.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
