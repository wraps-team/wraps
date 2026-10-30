"use client";

import type { Template } from "@wraps/db";
import { Badge } from "@wraps/ui/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@wraps/ui/components/ui/dropdown-menu";
import { Label } from "@wraps/ui/components/ui/label";
import { Textarea } from "@wraps/ui/components/ui/textarea";
import { ArrowLeft, ChevronDown, Loader2, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  usePublishTemplate,
  useUpdateTemplate,
} from "@/hooks/use-template-queries";
import { cn } from "@/lib/utils";

const VARIABLES = [
  { label: "First Name", value: "{{contact.firstName}}" },
  { label: "Last Name", value: "{{contact.lastName}}" },
  { label: "Email", value: "{{contact.email}}" },
  { label: "Phone", value: "{{contact.phone}}" },
  { label: "Company", value: "{{company.name}}" },
] as const;

const SMS_SEGMENT_LENGTH = 160;
const SMS_SEGMENT_LENGTH_UNICODE = 70;

// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ASCII range check for SMS encoding detection
const NON_ASCII_REGEX = /[^\u0000-\u007F]/;

function getSegmentInfo(text: string) {
  // Check for non-GSM characters (simplified unicode detection)
  const isUnicode = NON_ASCII_REGEX.test(text);
  const segmentLength = isUnicode
    ? SMS_SEGMENT_LENGTH_UNICODE
    : SMS_SEGMENT_LENGTH;
  const segments =
    text.length === 0 ? 0 : Math.ceil(text.length / segmentLength);
  return { segments, segmentLength, isUnicode, length: text.length };
}

type SmsTemplateEditorProps = {
  template: Template;
  orgSlug: string;
  className?: string;
};

export function SmsTemplateEditor({
  template: templateData,
  orgSlug,
  className,
}: SmsTemplateEditorProps) {
  const [body, setBody] = useState(templateData.compiledText ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateMutation = useUpdateTemplate(orgSlug, templateData.id);
  const publishMutation = usePublishTemplate(orgSlug, templateData.id);

  const segmentInfo = getSegmentInfo(body);

  // Auto-save with debounce
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Don't save if body hasn't changed from template data
    if (body === (templateData.compiledText ?? "")) {
      return;
    }

    saveTimeoutRef.current = setTimeout(() => {
      updateMutation.mutate({ compiledText: body });
    }, 1000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
    // updateMutation.mutate is stable (TanStack Query) and templateData.compiledText
    // only changes on route navigation which unmounts the component anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, templateData.compiledText, updateMutation.mutate]);

  const insertVariable = useCallback((variable: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setBody((prev) => prev.slice(0, start) + variable + prev.slice(end));

    // Restore cursor position after variable
    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = start + variable.length;
      textarea.setSelectionRange(newPos, newPos);
    });
  }, []);

  const handlePublish = useCallback(async () => {
    try {
      // Save first
      await updateMutation.mutateAsync({ compiledText: body });
      // Then publish
      await publishMutation.mutateAsync({});
      toast.success("SMS template published");
    } catch (error) {
      toast.error("Failed to publish", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }, [body, updateMutation, publishMutation]);

  return (
    <div
      className={cn(
        "flex h-[calc(100dvh-var(--header-height)-1rem)] flex-col md:h-[calc(100dvh-var(--header-height)-1.5rem)]",
        className
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href={`/${orgSlug}/emails/templates`}>
            <Button aria-label="Back to templates" size="icon" variant="ghost">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <h1 className="font-semibold text-lg">{templateData.name}</h1>
            <Badge variant="outline">SMS</Badge>
            <Badge
              variant={
                templateData.status === "PUBLISHED" ? "default" : "secondary"
              }
            >
              {templateData.status}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {updateMutation.isPending && (
            <span className="flex items-center gap-1 text-muted-foreground text-xs">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving...
            </span>
          )}
          <Button
            disabled={publishMutation.isPending || !body.trim()}
            onClick={handlePublish}
            size="sm"
          >
            {publishMutation.isPending ? "Publishing..." : "Publish"}
          </Button>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor */}
        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-xl space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="sms-body">Message</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      Insert Variable
                      <ChevronDown className="ml-1 h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {VARIABLES.map((v) => (
                      <DropdownMenuItem
                        key={v.value}
                        onClick={() => insertVariable(v.value)}
                      >
                        <span className="flex-1">{v.label}</span>
                        <span className="ml-2 font-mono text-muted-foreground text-xs">
                          {v.value}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Textarea
                className="min-h-[200px] resize-y font-mono text-sm"
                id="sms-body"
                onChange={(e) => setBody(e.target.value)}
                placeholder="Hi {{contact.firstName}}, your order has been confirmed!"
                ref={textareaRef}
                value={body}
              />
              <div className="flex items-center justify-between text-xs">
                <span
                  className={cn(
                    "text-muted-foreground",
                    segmentInfo.length > SMS_SEGMENT_LENGTH && "text-warning"
                  )}
                >
                  {segmentInfo.length} / {segmentInfo.segmentLength} characters
                  {segmentInfo.segments > 1 && (
                    <span className="ml-1">
                      ({segmentInfo.segments} segments)
                    </span>
                  )}
                </span>
                {segmentInfo.isUnicode && (
                  <span className="text-warning">
                    Unicode detected (70 char/segment)
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="w-80 border-l bg-muted/30 p-6">
          <Label className="mb-3 block">Preview</Label>
          <div className="rounded-2xl bg-success p-3">
            <div className="rounded-xl bg-card p-3 text-sm">
              {body || (
                <span className="text-muted-foreground italic">
                  Your message will appear here...
                </span>
              )}
            </div>
          </div>
          <p className="mt-3 text-muted-foreground text-xs">
            Variables like {"{{contact.firstName}}"} will be replaced with
            actual values when the message is sent.
          </p>
        </div>
      </div>
    </div>
  );
}
