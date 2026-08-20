"use client";

import { BookOpen, Code2, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createContact } from "@/actions/contacts";
import { Button } from "@/components/ui/button";
import type { ContactStatus, EmailStatus, SmsStatus } from "@/lib/contacts";
import type { TopicWithMeta } from "@/lib/topics";
import { ContactFormDialog } from "./contact-form-dialog";
import { ImportContactsDialog } from "./import-contacts-dialog";

const codeSnippet = `import { createClient } from '@wraps.dev/platform';

const client = createClient({
  organizationId: 'org_...',
  apiKey: process.env.WRAPS_API_KEY,
});

const { data } = await client.POST('/v1/contacts/', {
  body: {
    email: 'user@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
  },
});`;

type ContactsEmptyStateProps = {
  organizationId: string;
  orgSlug: string;
  /**
   * Whether this org's plan includes topic assignment. The dialog below used
   * to be hard-coded to `false`, so a paying org was shown an upgrade prompt it
   * had already paid past (audit M13).
   */
  proFeaturesEnabled: boolean;
  topics: TopicWithMeta[];
};

export function ContactsEmptyState({
  organizationId,
  orgSlug,
  proFeaturesEnabled,
  topics,
}: ContactsEmptyStateProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const handleCreateContact = async (data: {
    email?: string;
    phone?: string;
    firstName?: string | null;
    lastName?: string | null;
    company?: string | null;
    jobTitle?: string | null;
    emailStatus?: EmailStatus;
    smsStatus?: SmsStatus;
    status?: ContactStatus;
    properties?: Record<string, unknown>;
    topicIds?: string[];
  }) => {
    if (!(data.email || data.phone)) {
      toast.error("Error", { description: "Email or phone is required" });
      return;
    }
    startTransition(async () => {
      const result = await createContact(organizationId, {
        email: data.email,
        phone: data.phone,
        firstName: data.firstName ?? undefined,
        lastName: data.lastName ?? undefined,
        company: data.company ?? undefined,
        jobTitle: data.jobTitle ?? undefined,
        emailStatus: data.emailStatus,
        smsStatus: data.smsStatus,
        status: data.status,
        properties: data.properties,
        topicIds: data.topicIds,
      });
      if (result.success) {
        toast.success("Contact created", {
          description: `${data.email ?? data.phone} has been added.`,
        });
        setCreateDialogOpen(false);
        router.refresh();
      } else {
        toast.error("Error", { description: result.error });
      }
    });
  };

  return (
    // Left-aligned, and no icon medallion above the heading. A 56px tinted
    // circle over a centred column is the stock "empty state" template; it
    // adds nothing a reader needs and the centring makes the copy, the code
    // sample and the buttons all fight for the same axis.
    <div className="flex min-h-[60vh] items-start justify-center pt-12">
      <div className="w-full max-w-lg">
        <h2 className="mb-2 font-semibold text-xl tracking-tight">
          No contacts yet
        </h2>
        <p className="mb-8 max-w-sm text-muted-foreground text-sm">
          Add contacts manually, import a CSV, or use the Platform SDK to manage
          contacts programmatically.
        </p>

        <div className="mb-6 overflow-hidden rounded-lg border bg-muted/30 text-left">
          <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2">
            <Code2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium text-muted-foreground text-xs">
              create-contact.ts
            </span>
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
            <code>{codeSnippet}</code>
          </pre>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline">
            <Link
              href="https://wraps.dev/docs/quickstart/platform"
              rel="noopener noreferrer"
              target="_blank"
            >
              <BookOpen className="mr-2 h-4 w-4" />
              Read the docs
            </Link>
          </Button>
          <Button onClick={() => setImportDialogOpen(true)} variant="outline">
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add contact
          </Button>
        </div>
      </div>

      <ContactFormDialog
        isPending={isPending}
        mode="create"
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateContact}
        open={createDialogOpen}
        orgSlug={orgSlug}
        // Real values, not `false` and `[]`: this is the dialog that creates an
        // org's very first contact, and hard-coding them meant that contact
        // could never be assigned a topic (audit M13).
        proFeaturesEnabled={proFeaturesEnabled}
        topics={topics}
      />

      <ImportContactsDialog
        onImportComplete={() => router.refresh()}
        onOpenChange={setImportDialogOpen}
        open={importDialogOpen}
        organizationId={organizationId}
        topics={topics}
      />
    </div>
  );
}
