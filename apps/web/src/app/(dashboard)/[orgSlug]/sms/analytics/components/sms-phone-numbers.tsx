"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { AlertCircle, MessageSquareMore, Phone } from "lucide-react";
import type { ComponentProps } from "react";
import { useSMSStatus } from "../hooks/use-sms-analytics";

function formatPhoneNumber(phone: string): string {
  // Format US phone numbers nicely
  if (phone.startsWith("+1") && phone.length === 12) {
    return `+1 (${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8)}`;
  }
  return phone;
}

type BadgeVariant = ComponentProps<typeof Badge>["variant"];

function getStatusVariant(status: string): BadgeVariant {
  switch (status.toUpperCase()) {
    case "ACTIVE":
      return "success";
    case "PENDING":
    case "PENDING_REGISTRATION":
      return "warning";
    case "DELETED":
    case "DISASSOCIATED":
      return "destructive";
    default:
      return "secondary";
  }
}

function getNumberTypeBadge(type: string): { label: string } {
  switch (type.toUpperCase()) {
    case "TOLL_FREE":
      return { label: "Toll-Free" };
    case "TEN_DLC":
      return { label: "10DLC" };
    case "SHORT_CODE":
      return { label: "Short Code" };
    case "SIMULATOR":
      return { label: "Simulator" };
    default:
      return { label: type };
  }
}

export function SMSPhoneNumbers({ orgSlug }: { orgSlug: string }) {
  const { data, isLoading, error } = useSMSStatus(orgSlug);

  if (isLoading) {
    return (
      <Panel
        description="Your provisioned SMS phone numbers"
        label={
          <PanelTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Phone Numbers
          </PanelTitle>
        }
        variant="own"
      >
        <div>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
      </Panel>
    );
  }

  if (error) {
    return (
      <Panel
        label={
          <PanelTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Phone Numbers
          </PanelTitle>
        }
        variant="own"
      >
        <div>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <p className="text-sm">Failed to load phone numbers</p>
          </div>
        </div>
      </Panel>
    );
  }

  if (!data?.hasSMSInfrastructure || data.phoneNumbers.length === 0) {
    return (
      <Panel
        description="Your provisioned SMS phone numbers"
        label={
          <PanelTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Phone Numbers
          </PanelTitle>
        }
        variant="own"
      >
        <div>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Phone className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <h3 className="font-medium text-lg">No Phone Numbers</h3>
            <p className="mt-1 text-muted-foreground text-sm">
              Run <code className="rounded bg-muted px-1">wraps sms init</code>{" "}
              to provision a phone number
            </p>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      description="Your provisioned SMS phone numbers"
      label={
        <PanelTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Phone Numbers
        </PanelTitle>
      }
      variant="own"
    >
      <div>
        <div className="space-y-4">
          {data.phoneNumbers.map((phone) => {
            const typeInfo = getNumberTypeBadge(phone.numberType);
            return (
              <div
                className="flex items-center justify-between rounded-lg border p-4"
                key={phone.phoneNumberArn}
              >
                <div className="space-y-1">
                  <p className="font-mono font-semibold text-lg">
                    {formatPhoneNumber(phone.phoneNumber)}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{typeInfo.label}</Badge>
                    <Badge variant={getStatusVariant(phone.status)}>
                      {phone.status}
                    </Badge>
                    {phone.twoWayEnabled && (
                      <Badge variant="success">
                        <MessageSquareMore className="mr-1 h-3 w-3" />
                        Two-Way
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-muted-foreground text-sm">
                    ${phone.monthlyLeasingPrice}/mo
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {phone.isoCountryCode} • {phone.messageType}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Panel>
  );
}
