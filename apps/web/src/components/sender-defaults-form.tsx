"use client";

import { useForm } from "@tanstack/react-form";
import { Alert, AlertDescription } from "@wraps/ui/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Label } from "@wraps/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import { Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getSMSPhoneNumbers,
  getVerifiedDomains,
  type PhoneNumber,
  type VerifiedIdentity,
} from "@/actions/aws-accounts";
import {
  type SenderDefaults,
  updateSenderDefaultsAction,
} from "@/actions/organizations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastAwsActionError } from "@/lib/aws-permission-toast";

type AwsAccount = {
  id: string;
  name: string;
  region: string;
  smsEnabled: boolean;
};

type SenderDefaultsFormProps = {
  awsAccounts: AwsAccount[];
  defaults: SenderDefaults | null;
  organizationId: string;
  orgSlug: string;
  userRole: string;
};

export function SenderDefaultsForm({
  awsAccounts,
  defaults,
  organizationId,
  orgSlug,
  userRole,
}: SenderDefaultsFormProps) {
  // Check if user has permission to edit
  const canEdit = userRole === "owner" || userRole === "admin";

  // Parse initial from email into prefix and domain
  const parseFromEmail = (email: string | null) => {
    if (email?.includes("@")) {
      const [prefix, domain] = email.split("@");
      return { prefix: prefix || "", domain: domain || "" };
    }
    return { prefix: "", domain: "" };
  };

  const initialFrom = parseFromEmail(defaults?.defaultFrom ?? null);

  // Auto-select AWS account if org has only one and no default is set
  const initialAwsAccountId =
    defaults?.defaultAwsAccountId ||
    (awsAccounts.length === 1 ? awsAccounts[0].id : "");

  const form = useForm({
    defaultValues: {
      awsAccountId: initialAwsAccountId,
      fromPrefix: initialFrom.prefix,
      fromDomain: initialFrom.domain,
      fromName: defaults?.defaultFromName || "",
      replyTo: defaults?.defaultReplyTo || "",
      senderId: defaults?.defaultSenderId || "",
    },
    onSubmit: async ({ value }) => {
      try {
        const fromAddress =
          value.fromPrefix && value.fromDomain
            ? `${value.fromPrefix}@${value.fromDomain}`
            : null;

        const result = await updateSenderDefaultsAction(orgSlug, {
          defaultAwsAccountId: value.awsAccountId || null,
          defaultFrom: fromAddress,
          defaultFromName: value.fromName || null,
          defaultReplyTo: value.replyTo || null,
          defaultSenderId: value.senderId || null,
        });

        if (result.success) {
          toast.success("Sender defaults saved");
        } else {
          toast.error(result.error || "Failed to save settings");
        }
      } catch {
        toast.error("Failed to save settings");
      }
    },
  });

  // Verified domains state
  const [verifiedDomains, setVerifiedDomains] = useState<VerifiedIdentity[]>(
    []
  );
  const [domainsLoading, setDomainsLoading] = useState(false);

  // SMS phone numbers state
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [phoneNumbersLoading, setPhoneNumbersLoading] = useState(false);

  // Track current awsAccountId separately for effects (to avoid re-renders)
  const [currentAwsAccountId, setCurrentAwsAccountId] =
    useState(initialAwsAccountId);
  const [currentFromDomain, setCurrentFromDomain] = useState(
    initialFrom.domain
  );

  // Filter to only show domains (not email addresses)
  const domainOptions = verifiedDomains.filter((d) => d.type === "DOMAIN");

  // Check if SMS is enabled for the selected account
  const selectedAccount = awsAccounts.find((a) => a.id === currentAwsAccountId);
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
            (d) => d.identity === currentFromDomain
          );
          if (!currentDomainValid && result.identities.length > 0) {
            const firstDomain = result.identities.find(
              (d) => d.type === "DOMAIN"
            );
            if (firstDomain) {
              form.setFieldValue("fromDomain", firstDomain.identity);
              setCurrentFromDomain(firstDomain.identity);
            }
          }
        } else {
          toastAwsActionError(
            result.errorCode,
            "Failed to load verified domains",
            orgSlug
          );
        }
      } catch {
        toast.error("Failed to load verified domains");
      } finally {
        setDomainsLoading(false);
      }
    },
    [organizationId, currentFromDomain, form, orgSlug]
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
          const currentValue =
            form.getFieldValue("senderId") || defaults?.defaultSenderId || "";
          const currentValid = result.phoneNumbers.some(
            (pn) => pn.phoneNumber === currentValue
          );
          if (!currentValid && result.phoneNumbers.length > 0) {
            form.setFieldValue("senderId", result.phoneNumbers[0].phoneNumber);
          }
        } else {
          toastAwsActionError(
            result.errorCode,
            "Failed to load phone numbers",
            orgSlug
          );
        }
      } catch {
        toast.error("Failed to load phone numbers");
      } finally {
        setPhoneNumbersLoading(false);
      }
    },
    [organizationId, awsAccounts, form, defaults?.defaultSenderId, orgSlug]
  );

  // Load domains and phone numbers on mount and when account changes
  useEffect(() => {
    if (currentAwsAccountId) {
      fetchDomainsForAccount(currentAwsAccountId);
      fetchPhoneNumbersForAccount(currentAwsAccountId);
    }
  }, [
    currentAwsAccountId,
    fetchDomainsForAccount,
    fetchPhoneNumbersForAccount,
  ]);

  return (
    <div className="space-y-6">
      {!canEdit && (
        <Alert>
          <AlertDescription>
            You do not have permission to edit sender defaults. Only owners and
            admins can make changes.
          </AlertDescription>
        </Alert>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          e.stopPropagation();
          form.handleSubmit();
        }}
      >
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Default AWS Account</CardTitle>
              <CardDescription>
                Select the default AWS account to use for sending emails and
                SMS. New workflows and broadcasts will use this account unless
                otherwise specified.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {awsAccounts.length > 0 ? (
                <form.Field name="awsAccountId">
                  {(field) => (
                    <div className="space-y-2">
                      <Label>AWS Account</Label>
                      <Select
                        disabled={!canEdit}
                        onValueChange={(value) => {
                          field.handleChange(value);
                          setCurrentAwsAccountId(value);
                        }}
                        value={field.state.value}
                      >
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
                    </div>
                  )}
                </form.Field>
              ) : (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <p className="mb-2 text-muted-foreground">
                    No AWS accounts connected
                  </p>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/${orgSlug}/settings/aws-accounts`}>
                      Connect AWS Account
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Email Defaults</CardTitle>
              <CardDescription>
                Set default sender information for emails. These values will be
                used when creating new workflows and broadcasts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* From Name */}
              <form.Field name="fromName">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>From Name</Label>
                    <Input
                      disabled={!canEdit}
                      id={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Your Company"
                      value={field.state.value}
                    />
                    <p className="text-muted-foreground text-xs">
                      The display name recipients will see
                    </p>
                  </div>
                )}
              </form.Field>

              {/* From Email */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>From Email</Label>
                  <Button
                    aria-label="Refresh domains"
                    className="h-6 w-6"
                    disabled={
                      domainsLoading || !currentAwsAccountId || !canEdit
                    }
                    onClick={() =>
                      fetchDomainsForAccount(currentAwsAccountId, true)
                    }
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
                {currentAwsAccountId ? (
                  domainOptions.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <form.Field name="fromPrefix">
                        {(field) => (
                          <Input
                            className="flex-1"
                            disabled={!canEdit}
                            id={field.name}
                            onBlur={field.handleBlur}
                            onChange={(e) => field.handleChange(e.target.value)}
                            placeholder="hello"
                            value={field.state.value}
                          />
                        )}
                      </form.Field>
                      <span className="text-muted-foreground">@</span>
                      <form.Field name="fromDomain">
                        {(field) => (
                          <Select
                            disabled={!canEdit}
                            onValueChange={field.handleChange}
                            value={field.state.value}
                          >
                            <SelectTrigger className="w-[180px]">
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
                        )}
                      </form.Field>
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
              <form.Field name="replyTo">
                {(field) => (
                  <div className="space-y-2">
                    <Label htmlFor={field.name}>Reply-To Email</Label>
                    <Input
                      disabled={!canEdit}
                      id={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="replies@yourcompany.com"
                      type="email"
                      value={field.state.value}
                    />
                    <p className="text-muted-foreground text-xs">
                      Where replies will be sent
                    </p>
                  </div>
                )}
              </form.Field>
            </CardContent>
          </Card>

          {/* SMS Defaults - Only show if SMS is available */}
          {awsAccounts.some((a) => a.smsEnabled) && (
            <Card>
              <CardHeader>
                <CardTitle>SMS Defaults</CardTitle>
                <CardDescription>
                  Set default sender information for SMS messages.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {currentAwsAccountId ? (
                  smsEnabled ? (
                    phoneNumbers.length > 0 ? (
                      <form.Field name="senderId">
                        {(field) => (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <Label>Sender Phone Number</Label>
                              <Button
                                aria-label="Refresh phone numbers"
                                className="h-6 w-6"
                                disabled={phoneNumbersLoading || !canEdit}
                                onClick={() =>
                                  fetchPhoneNumbersForAccount(
                                    currentAwsAccountId
                                  )
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
                            <Select
                              disabled={!canEdit}
                              onValueChange={field.handleChange}
                              value={field.state.value}
                            >
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
                        )}
                      </form.Field>
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
              </CardContent>
            </Card>
          )}

          {canEdit && (
            <div className="flex space-x-2">
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button
                    className="cursor-pointer"
                    disabled={isSubmitting}
                    type="submit"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Defaults"
                    )}
                  </Button>
                )}
              </form.Subscribe>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
