"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@wraps/ui/components/ui/input-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@wraps/ui/components/ui/tooltip";
import { Check, Copy, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  bulkCreateContactsFromEmails,
  checkExistingContacts,
} from "@/actions/contacts-bulk";

type EmailFieldsProps = {
  to: string[];
  from: string;
  organizationId?: string;
};

export function EmailFields({ to, from, organizationId }: EmailFieldsProps) {
  const [copiedTo, setCopiedTo] = useState(false);
  const [copiedFrom, setCopiedFrom] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [existingContacts, setExistingContacts] = useState<
    Record<string, string>
  >({});
  const [hasCheckedContacts, setHasCheckedContacts] = useState(false);

  const copyToClipboard = async (
    text: string,
    setCopied: (value: boolean) => void
  ) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Check if recipients already exist as contacts
  const checkContacts = async () => {
    if (!organizationId || hasCheckedContacts) {
      return;
    }
    const result = await checkExistingContacts(organizationId, to);
    if (result.success) {
      setExistingContacts(result.existing);
    }
    setHasCheckedContacts(true);
  };

  // Check contacts on mount
  if (organizationId && !hasCheckedContacts) {
    checkContacts();
  }

  const toEmail = to.length > 0 ? to[0] : "";
  const hasMultipleRecipients = to.length > 1;

  // Check if the primary recipient is already a contact
  const _primaryRecipientIsContact = toEmail
    ? existingContacts[toEmail.toLowerCase()]
    : false;

  // Count how many recipients are not yet contacts
  const newRecipientCount = to.filter(
    (email) => !existingContacts[email.toLowerCase()]
  ).length;

  const handleCreateContact = () => {
    if (!organizationId) {
      return;
    }

    // Get emails that are not already contacts
    const emailsToCreate = to.filter(
      (email) => !existingContacts[email.toLowerCase()]
    );

    if (emailsToCreate.length === 0) {
      toast.info("All recipients are already contacts");
      return;
    }

    startTransition(async () => {
      const result = await bulkCreateContactsFromEmails(
        organizationId,
        emailsToCreate
      );

      if (result.success) {
        const messages: string[] = [];
        if (result.created > 0) {
          messages.push(
            `Created ${result.created} contact${result.created === 1 ? "" : "s"}`
          );
        }
        if (result.skipped > 0) {
          messages.push(`${result.skipped} already existed`);
        }

        toast.success("Contacts created", {
          description: messages.join(", "),
        });

        // Update local state to reflect new contacts
        const newExisting = { ...existingContacts };
        for (const email of emailsToCreate) {
          newExisting[email.toLowerCase()] = "created";
        }
        setExistingContacts(newExisting);
      } else {
        toast.error("Error", { description: result.error });
      }
    });
  };

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {/* To Field */}
      <div className="flex flex-col gap-1.5">
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>To:</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            className="font-mono text-sm"
            disabled
            id="to-email"
            placeholder="(no recipients)"
            readOnly
            value={toEmail}
          />
          {hasMultipleRecipients && (
            <InputGroupAddon align="inline-end">
              <Badge variant="secondary">+{to.length - 1}</Badge>
            </InputGroupAddon>
          )}
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label="Copy recipient email"
              disabled={!toEmail}
              onClick={() => copyToClipboard(toEmail, setCopiedTo)}
              size="icon-xs"
              title="Copy"
            >
              {copiedTo ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </InputGroupButton>
          </InputGroupAddon>
          {organizationId && toEmail && (
            <InputGroupAddon align="inline-end">
              <Tooltip>
                <TooltipTrigger asChild>
                  <InputGroupButton
                    aria-label={
                      newRecipientCount === 0
                        ? "All recipients are contacts"
                        : `Create ${newRecipientCount} contact${newRecipientCount === 1 ? "" : "s"}`
                    }
                    disabled={isPending || newRecipientCount === 0}
                    onClick={handleCreateContact}
                    size="icon-xs"
                    title={
                      newRecipientCount === 0
                        ? "Already a contact"
                        : "Create contact"
                    }
                  >
                    {isPending ? (
                      <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : newRecipientCount === 0 ? (
                      <Check className="size-3.5 text-success" />
                    ) : (
                      <UserPlus className="size-3.5" />
                    )}
                  </InputGroupButton>
                </TooltipTrigger>
                <TooltipContent>
                  {newRecipientCount === 0
                    ? "All recipients are contacts"
                    : hasMultipleRecipients
                      ? `Add ${newRecipientCount} recipient${newRecipientCount === 1 ? "" : "s"} to contacts`
                      : "Add to contacts"}
                </TooltipContent>
              </Tooltip>
            </InputGroupAddon>
          )}
        </InputGroup>
      </div>

      {/* From Field */}
      <div className="flex flex-col gap-1.5">
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>From:</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            className="font-mono text-sm"
            disabled
            id="from-email"
            readOnly
            value={from}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label="Copy sender email"
              onClick={() => copyToClipboard(from, setCopiedFrom)}
              size="icon-xs"
              title="Copy"
            >
              {copiedFrom ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
    </div>
  );
}
