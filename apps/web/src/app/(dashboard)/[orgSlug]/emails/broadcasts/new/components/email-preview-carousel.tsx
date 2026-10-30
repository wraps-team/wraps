"use client";

import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Mail } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { RecipientFilter } from "@/actions/batch";
import { getSampleContacts, getTemplateContent } from "@/actions/batch";
import { Button } from "@/components/ui/button";
import type { SampleContact } from "@/lib/batch";

type EmailPreviewCarouselProps = {
  organizationId: string;
  templateId: string;
  recipientFilter: RecipientFilter;
  variableMappings: Array<{
    variableName: string;
    source:
      | { type: "static"; value: string }
      | { type: "contact"; field: string };
  }>;
};

export function EmailPreviewCarousel({
  organizationId,
  templateId,
  recipientFilter,
  variableMappings,
}: EmailPreviewCarouselProps) {
  const [contacts, setContacts] = useState<SampleContact[]>([]);
  const [compiledHtml, setCompiledHtml] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [htmlContent, setHtmlContent] = useState<string>("");

  // Fetch contacts and template content on mount
  useEffect(() => {
    async function fetchData() {
      setLoading(true);

      const [contactsResult, templateResult] = await Promise.all([
        getSampleContacts(organizationId, "email", recipientFilter, 5),
        getTemplateContent(organizationId, templateId),
      ]);

      if (contactsResult.success) {
        setContacts(contactsResult.contacts);
      }
      if (templateResult.success) {
        setCompiledHtml(templateResult.compiledHtml);
      }

      setLoading(false);
    }

    if (templateId) {
      fetchData();
    }
  }, [organizationId, templateId, recipientFilter]);

  // Build test data from contact and variable mappings
  const testData = useMemo(() => {
    if (contacts.length === 0) {
      return {};
    }

    const contact = contacts[currentIndex];
    if (!contact) {
      return {};
    }

    const data: Record<string, string> = {
      // Default contact fields
      "contact.email": contact.email ?? "",
      "contact.firstName": contact.firstName ?? "",
      "contact.lastName": contact.lastName ?? "",
      "contact.company": contact.company ?? "",
      // Shorter aliases
      firstName: contact.firstName ?? "",
      lastName: contact.lastName ?? "",
      email: contact.email ?? "",
      company: contact.company ?? "",
    };

    // Apply variable mappings
    for (const mapping of variableMappings) {
      if (mapping.source.type === "static") {
        data[mapping.variableName] = mapping.source.value;
      } else if (mapping.source.type === "contact") {
        const field = mapping.source.field;
        const contactValue =
          field === "firstName"
            ? contact.firstName
            : field === "lastName"
              ? contact.lastName
              : field === "email"
                ? contact.email
                : field === "company"
                  ? contact.company
                  : null;
        data[mapping.variableName] = contactValue ?? "";
      }
    }

    return data;
  }, [contacts, currentIndex, variableMappings]);

  // Render HTML when template or test data changes
  useEffect(() => {
    let cancelled = false;

    // For code-pushed templates, the stored compiledHtml still has raw
    // `{{var}}` and `{{#if}}/{{else}}/{{/if}}` placeholders so SES can
    // substitute per-recipient at send time. Run Handlebars over it with
    // the current contact's data so the preview matches what they'll see.
    //
    // The Handlebars module is ~120KB, so we lazy-import it instead of
    // pulling it into every visitor's broadcast page bundle.
    if (!compiledHtml) {
      return;
    }

    import("@/lib/handlebars")
      .then(({ nestKeys, renderForPreview }) => {
        if (!cancelled) {
          setHtmlContent(renderForPreview(compiledHtml, nestKeys(testData)));
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Fall back to raw compiled html so the preview pane isn't
          // blank if the dynamic import somehow fails.
          setHtmlContent(compiledHtml);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [testData, compiledHtml]);

  const currentContact = contacts[currentIndex];

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : contacts.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev < contacts.length - 1 ? prev + 1 : 0));
  };

  if (!templateId) {
    return null;
  }

  if (loading) {
    return (
      <Panel
        label={
          <PanelTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email Preview
          </PanelTitle>
        }
      >
        <Skeleton className="h-[300px] w-full" />
      </Panel>
    );
  }

  if (contacts.length === 0) {
    return (
      <Panel
        label={
          <PanelTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email Preview
          </PanelTitle>
        }
      >
        <p className="text-muted-foreground text-sm">
          No contacts found to preview.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      actions={
        <div className="flex items-center gap-1">
          <Button
            aria-label="Previous"
            disabled={contacts.length <= 1}
            onClick={handlePrev}
            size="icon"
            variant="ghost"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            aria-label="Next"
            disabled={contacts.length <= 1}
            onClick={handleNext}
            size="icon"
            variant="ghost"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      }
      description={
        currentContact && (
          <p>
            Previewing as:{" "}
            <span className="font-medium text-foreground">
              {[currentContact.firstName, currentContact.lastName]
                .filter(Boolean)
                .join(" ") || "Unknown"}
            </span>{" "}
            <span className="text-muted-foreground">
              &lt;{currentContact.email}&gt;
            </span>
          </p>
        )
      }
      label={
        <PanelTitle className="flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Email Preview ({currentIndex + 1} of {contacts.length})
        </PanelTitle>
      }
    >
      <div className="overflow-hidden border bg-card">
        {/* Fully sandboxed: this preview renders real contact data, and the
              renderer substitutes values verbatim to match SES, so the markup
              is not trusted. Nothing here reads contentWindow, so the frame
              has no reason to hold the app's origin. */}
        <iframe
          className="h-[400px] w-full border-0"
          sandbox=""
          srcDoc={htmlContent}
          title="Email Preview"
        />
      </div>
    </Panel>
  );
}
