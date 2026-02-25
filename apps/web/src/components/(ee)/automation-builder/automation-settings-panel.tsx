"use client";

import type { Workflow } from "@wraps/db";
import { Loader2, RefreshCw, Settings, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { updateAutomation } from "@/actions/automations";
import {
  getSMSPhoneNumbers,
  getVerifiedDomains,
  type PhoneNumber,
  type VerifiedIdentity,
} from "@/actions/aws-accounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useWorkflowStore } from "./use-automation-store";

type AwsAccount = {
  id: string;
  name: string;
  region: string;
  smsEnabled?: boolean;
};

type OrgDefaults = {
  defaultAwsAccountId: string | null;
  defaultFrom: string | null;
  defaultFromName: string | null;
  defaultReplyTo: string | null;
  defaultSenderId: string | null;
} | null;

type WorkflowSettingsPanelProps = {
  workflow: Workflow;
  organizationId: string;
  orgSlug: string;
  awsAccounts: AwsAccount[];
  orgDefaults: OrgDefaults;
  onClose: () => void;
};

export function WorkflowSettingsPanel({
  workflow,
  organizationId,
  orgSlug,
  awsAccounts,
  orgDefaults,
  onClose,
}: WorkflowSettingsPanelProps) {
  const workflowState = useWorkflowStore((state) => state.workflow);
  const updateWorkflowAfterSave = useWorkflowStore(
    (state) => state.updateWorkflowAfterSave
  );

  // Local state for form values
  // Fallback chain: workflow store -> workflow -> org defaults -> empty
  const [awsAccountId, setAwsAccountId] = useState(
    workflowState?.awsAccountId ||
      workflow.awsAccountId ||
      orgDefaults?.defaultAwsAccountId ||
      ""
  );
  const [fromPrefix, setFromPrefix] = useState("");
  const [fromDomain, setFromDomain] = useState("");
  const [fromName, setFromName] = useState(
    workflowState?.defaultFromName ||
      workflow.defaultFromName ||
      orgDefaults?.defaultFromName ||
      ""
  );
  const [replyTo, setReplyTo] = useState(
    workflowState?.defaultReplyTo ||
      workflow.defaultReplyTo ||
      orgDefaults?.defaultReplyTo ||
      ""
  );
  const [senderId, setSenderId] = useState(
    workflowState?.defaultSenderId ||
      workflow.defaultSenderId ||
      orgDefaults?.defaultSenderId ||
      ""
  );

  // Parse existing from email into prefix and domain
  useEffect(() => {
    const defaultFrom =
      workflowState?.defaultFrom ||
      workflow.defaultFrom ||
      orgDefaults?.defaultFrom ||
      "";
    if (defaultFrom?.includes("@")) {
      const [prefix, domain] = defaultFrom.split("@");
      setFromPrefix(prefix || "");
      setFromDomain(domain || "");
    }
  }, [
    workflowState?.defaultFrom,
    workflow.defaultFrom,
    orgDefaults?.defaultFrom,
  ]);

  // Verified domains state
  const [verifiedDomains, setVerifiedDomains] = useState<VerifiedIdentity[]>(
    []
  );
  const [domainsLoading, setDomainsLoading] = useState(false);

  // SMS phone numbers state
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [phoneNumbersLoading, setPhoneNumbersLoading] = useState(false);

  // Saving state
  const [isSaving, setIsSaving] = useState(false);

  // Filter to only show domains (not email addresses)
  const domainOptions = verifiedDomains.filter((d) => d.type === "DOMAIN");

  // Check if SMS is enabled for the selected account
  const selectedAccount = awsAccounts.find((a) => a.id === awsAccountId);
  const smsEnabled = selectedAccount?.smsEnabled ?? false;

  // Fetch verified domains when AWS account changes
  const fetchDomainsForAccount = useCallback(
    async (accountId: string, forceRefresh = false) => {
      if (!accountId) {
        setVerifiedDomains([]);
        return;
      }

      setDomainsLoading(true);
      try {
        const result = await getVerifiedDomains(
          accountId,
          organizationId,
          forceRefresh
        );

        if (result.success) {
          setVerifiedDomains(result.identities);
          // Auto-select first domain if current is not in the list
          const currentDomainValid = result.identities.some(
            (d) => d.identity === fromDomain
          );
          if (!currentDomainValid && result.identities.length > 0) {
            const firstDomain = result.identities.find(
              (d) => d.type === "DOMAIN"
            );
            if (firstDomain) {
              setFromDomain(firstDomain.identity);
            }
          }
        } else if (result.errorCode === "PERMISSION_DENIED") {
          toast.error("Permission Update Required", {
            description:
              "Your IAM role needs updated permissions. Run: wraps platform update-role",
            duration: Number.POSITIVE_INFINITY,
          });
        } else {
          toast.error("Failed to load verified domains");
        }
      } catch {
        toast.error("Failed to load verified domains");
      } finally {
        setDomainsLoading(false);
      }
    },
    [organizationId, fromDomain]
  );

  // Fetch phone numbers for account
  const fetchPhoneNumbersForAccount = useCallback(
    async (accountId: string) => {
      if (!accountId) {
        setPhoneNumbers([]);
        return;
      }

      // Check if the account has SMS enabled
      const account = awsAccounts.find((a) => a.id === accountId);
      if (!account?.smsEnabled) {
        setPhoneNumbers([]);
        return;
      }

      setPhoneNumbersLoading(true);
      try {
        const result = await getSMSPhoneNumbers(accountId, organizationId);
        if (result.success) {
          setPhoneNumbers(result.phoneNumbers);
          // Auto-select first phone number if current is not in the list
          const currentValid = result.phoneNumbers.some(
            (pn) => pn.phoneNumber === senderId
          );
          if (!currentValid && result.phoneNumbers.length > 0) {
            setSenderId(result.phoneNumbers[0].phoneNumber);
          }
        } else {
          toast.error("Failed to load phone numbers");
        }
      } catch {
        toast.error("Failed to load phone numbers");
      } finally {
        setPhoneNumbersLoading(false);
      }
    },
    [organizationId, awsAccounts, senderId]
  );

  // Load domains and phone numbers on mount and when account changes
  useEffect(() => {
    if (awsAccountId) {
      fetchDomainsForAccount(awsAccountId);
      fetchPhoneNumbersForAccount(awsAccountId);
    }
  }, [awsAccountId, fetchDomainsForAccount, fetchPhoneNumbersForAccount]);

  // Auto-select AWS account if org has only one
  useEffect(() => {
    if (!awsAccountId && awsAccounts.length === 1) {
      setAwsAccountId(awsAccounts[0].id);
    }
  }, [awsAccountId, awsAccounts]);

  // Build full from email address
  const getFromAddress = useCallback(() => {
    if (!(fromPrefix && fromDomain)) {
      return null;
    }
    return `${fromPrefix}@${fromDomain}`;
  }, [fromPrefix, fromDomain]);

  // Save settings
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await updateAutomation(workflow.id, organizationId, {
        awsAccountId: awsAccountId || null,
        defaultFrom: getFromAddress(),
        defaultFromName: fromName || null,
        defaultReplyTo: replyTo || null,
        defaultSenderId: senderId || null,
      });

      if (result.success) {
        updateWorkflowAfterSave(result.automation);
        toast.success("Automation settings saved");
      } else {
        toast.error(result.error || "Failed to save settings");
      }
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex w-80 flex-col border-l bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          <span className="font-medium">Workflow Settings</span>
        </div>
        <Button onClick={onClose} size="icon" variant="ghost">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          {/* AWS Account */}
          <div className="space-y-2">
            <Label>
              AWS Account <span className="text-destructive">*</span>
            </Label>
            {awsAccounts.length > 0 ? (
              <Select onValueChange={setAwsAccountId} value={awsAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select AWS account" />
                </SelectTrigger>
                <SelectContent>
                  {awsAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} ({account.region})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center">
                <p className="text-muted-foreground text-sm">
                  No AWS accounts connected
                </p>
                <Button asChild className="mt-2" size="sm" variant="outline">
                  <Link href={`/${orgSlug}/settings/aws-accounts`}>
                    Connect AWS Account
                  </Link>
                </Button>
              </div>
            )}
            <p className="text-muted-foreground text-xs">
              Required for sending emails and SMS
            </p>
          </div>

          <Separator />

          {/* Email Defaults Section */}
          <div className="space-y-4">
            <h3 className="font-medium text-sm">Email Defaults</h3>

            {/* From Name */}
            <div className="space-y-2">
              <Label htmlFor="fromName">From Name</Label>
              <Input
                id="fromName"
                onChange={(e) => setFromName(e.target.value)}
                placeholder="Your Company"
                value={fromName}
              />
            </div>

            {/* From Email */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="fromPrefix">From Email</Label>
                <Button
                  className="h-6 w-6"
                  disabled={domainsLoading || !awsAccountId}
                  onClick={() => fetchDomainsForAccount(awsAccountId, true)}
                  size="icon"
                  title="Refresh domains"
                  type="button"
                  variant="ghost"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${domainsLoading ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>
              {awsAccountId ? (
                domainOptions.length > 0 ? (
                  <div className="flex items-center gap-2">
                    <Input
                      className="flex-1"
                      id="fromPrefix"
                      onChange={(e) => setFromPrefix(e.target.value)}
                      placeholder="hello"
                      value={fromPrefix}
                    />
                    <span className="text-muted-foreground">@</span>
                    <Select onValueChange={setFromDomain} value={fromDomain}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Domain" />
                      </SelectTrigger>
                      <SelectContent>
                        {domainOptions.map((domain) => (
                          <SelectItem
                            key={domain.identity}
                            value={domain.identity}
                          >
                            {domain.identity}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed p-3 text-center">
                    <p className="text-muted-foreground text-xs">
                      {domainsLoading
                        ? "Loading domains..."
                        : "No verified domains found"}
                    </p>
                  </div>
                )
              ) : (
                <p className="text-muted-foreground text-sm">
                  Select an AWS account first
                </p>
              )}
            </div>

            {/* Reply To */}
            <div className="space-y-2">
              <Label htmlFor="replyTo">Reply-To Email</Label>
              <Input
                id="replyTo"
                onChange={(e) => setReplyTo(e.target.value)}
                placeholder="replies@yourcompany.com"
                type="email"
                value={replyTo}
              />
              <p className="text-muted-foreground text-xs">
                Where replies will be sent
              </p>
            </div>
          </div>

          {/* SMS Defaults Section - Only show if any account has SMS enabled */}
          {awsAccounts.some((a) => a.smsEnabled) && (
            <>
              <Separator />

              <div className="space-y-4">
                <h3 className="font-medium text-sm">SMS Defaults</h3>

                {awsAccountId ? (
                  smsEnabled ? (
                    phoneNumbers.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Sender Phone Number</Label>
                          <Button
                            className="h-6 w-6"
                            disabled={phoneNumbersLoading}
                            onClick={() =>
                              fetchPhoneNumbersForAccount(awsAccountId)
                            }
                            size="icon"
                            title="Refresh phone numbers"
                            type="button"
                            variant="ghost"
                          >
                            <RefreshCw
                              className={`h-3.5 w-3.5 ${phoneNumbersLoading ? "animate-spin" : ""}`}
                            />
                          </Button>
                        </div>
                        <Select onValueChange={setSenderId} value={senderId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select phone number" />
                          </SelectTrigger>
                          <SelectContent>
                            {phoneNumbers.map((pn) => (
                              <SelectItem
                                key={pn.phoneNumber}
                                value={pn.phoneNumber}
                              >
                                {pn.phoneNumber} ({pn.isoCountryCode})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-muted-foreground text-xs">
                          Phone number for sending SMS messages
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed p-3 text-center">
                        <p className="text-muted-foreground text-xs">
                          {phoneNumbersLoading
                            ? "Loading phone numbers..."
                            : "No phone numbers found in this account"}
                        </p>
                      </div>
                    )
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      SMS is not enabled for the selected AWS account.
                    </p>
                  )
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Select an AWS account first
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t p-4">
        <Button
          className="w-full"
          disabled={isSaving}
          onClick={handleSave}
          size="sm"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Settings"
          )}
        </Button>
      </div>
    </div>
  );
}
