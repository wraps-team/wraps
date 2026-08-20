"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wraps/ui/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@wraps/ui/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wraps/ui/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@wraps/ui/components/ui/tabs";
import { ChevronRight, Code2, Pencil, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { getTopicSubscribers } from "@/actions/topics";
import { Button } from "@/components/ui/button";
import { CodeTabs } from "@/components/ui/shadcn-io/code-tabs";
import type { TopicWithMeta } from "@/lib/topics";
import {
  captureTopicSubscribersFilterChanged,
  captureTopicSubscribersPageChanged,
} from "./lib/analytics";

type Subscriber = {
  contactId: string;
  email: string;
  status: string;
  subscribedAt: Date | null;
  unsubscribedAt: Date | null;
};

/**
 * The drawer used to hard-code `subscribed`, so a topic whose sign-ups were all
 * waiting on a double opt-in confirmation rendered "No subscribers yet" over a
 * cohort that existed and could be chased.
 */
const STATUS_TABS = [
  { value: "subscribed", label: "Subscribed" },
  { value: "pending", label: "Pending" },
  { value: "unsubscribed", label: "Unsubscribed" },
] as const;

type SubscriberStatus = (typeof STATUS_TABS)[number]["value"];

function formatDate(value: Date | null): string {
  return value ? new Date(value).toLocaleDateString() : "—";
}

// A pending row's `subscribedAt` is when they asked, not when they joined.
const DATE_HEADER: Record<SubscriberStatus, string> = {
  subscribed: "Subscribed",
  pending: "Requested",
  unsubscribed: "Unsubscribed",
};

const EMPTY_COPY: Record<SubscriberStatus, string> = {
  subscribed: "Nobody is subscribed to this topic yet",
  pending: "Nobody is waiting to confirm",
  unsubscribed: "Nobody has unsubscribed from this topic",
};

type TopicSubscribersSheetProps = {
  canEdit: boolean;
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
  open: boolean;
  organizationId: string;
  topic: TopicWithMeta | null;
};

export function TopicSubscribersSheet({
  canEdit,
  onClose,
  onDelete,
  onEdit,
  open,
  organizationId,
  topic,
}: TopicSubscribersSheetProps) {
  const [isPending, startTransition] = useTransition();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<SubscriberStatus>("subscribed");
  const pageSize = 20;

  // Stable reference for dependency arrays
  const topicId = topic?.id ?? null;

  // Reset state when topic changes or sheet opens with new topic
  useEffect(() => {
    if (open && topicId) {
      // Reset pagination and clear stale data
      setPage(1);
      setStatus("subscribed");
      setSubscribers([]);
      setTotal(0);
    }
  }, [open, topicId]);

  // Load subscribers when sheet opens, the cohort changes, or the page changes
  useEffect(() => {
    if (open && topic) {
      startTransition(async () => {
        const result = await getTopicSubscribers(topic.id, organizationId, {
          page,
          pageSize,
          status,
        });
        if (result.success) {
          setSubscribers(result.subscribers);
          setTotal(result.total);
        }
      });
    }
  }, [open, organizationId, page, status, topic]);

  if (!topic) {
    return null;
  }

  const totalPages = Math.ceil(total / pageSize) || 1;

  return (
    <Sheet onOpenChange={(isOpen) => !isOpen && onClose()} open={open}>
      <SheetContent className="flex flex-col overflow-hidden sm:max-w-lg">
        <SheetHeader className="px-4">
          <SheetTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {topic.name}
          </SheetTitle>
          <SheetDescription>
            {topic.subscriberCount.toLocaleString()} subscribed ·{" "}
            {topic.sendableCount.toLocaleString()} can be emailed
            {topic.pendingCount > 0
              ? ` · ${topic.pendingCount.toLocaleString()} pending confirmation`
              : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-4">
          {/* Topic Info */}
          <div className="flex items-center gap-2">
            <Badge variant="outline">/{topic.slug}</Badge>
            <Badge variant={topic.public ? "secondary" : "outline"}>
              {topic.public ? "Public" : "Private"}
            </Badge>
            {topic.doubleOptIn && <Badge>Double Opt-In</Badge>}
          </div>

          {topic.description && (
            <p className="text-muted-foreground text-sm">{topic.description}</p>
          )}

          {/* Quick Start */}
          <QuickStartSnippets slug={topic.slug} />

          {/* Subscribers List */}
          <Tabs
            onValueChange={(value) => {
              captureTopicSubscribersFilterChanged({
                from: status,
                to: value,
              });
              setStatus(value as SubscriberStatus);
              setPage(1);
            }}
            value={status}
          >
            <TabsList>
              {STATUS_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                  {tab.value === "pending" && topic.pendingCount > 0
                    ? ` (${topic.pendingCount.toLocaleString()})`
                    : ""}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>{DATE_HEADER[status]}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending ? (
                  <TableRow>
                    <TableCell className="text-center" colSpan={2}>
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : subscribers.length > 0 ? (
                  subscribers.map((subscriber) => (
                    <TableRow key={subscriber.contactId}>
                      <TableCell className="font-medium">
                        {subscriber.email}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(
                          status === "unsubscribed"
                            ? subscriber.unsubscribedAt
                            : subscriber.subscribedAt
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      className="text-center text-muted-foreground"
                      colSpan={2}
                    >
                      {EMPTY_COPY[status]}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {total > pageSize && (
            <div className="flex items-center justify-between">
              <Button
                disabled={page <= 1 || isPending}
                onClick={() => {
                  captureTopicSubscribersPageChanged({
                    direction: "previous",
                    page: page - 1,
                  });
                  setPage((p) => p - 1);
                }}
                size="sm"
                variant="outline"
              >
                Previous
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {page} of {totalPages}
              </span>
              <Button
                disabled={page >= totalPages || isPending}
                onClick={() => {
                  captureTopicSubscribersPageChanged({
                    direction: "next",
                    page: page + 1,
                  });
                  setPage((p) => p + 1);
                }}
                size="sm"
                variant="outline"
              >
                Next
              </Button>
            </div>
          )}
        </div>

        {/* Actions Footer */}
        {canEdit && (
          <div className="flex items-center gap-2 border-t px-4 py-3">
            <Button className="flex-1" onClick={onEdit} variant="outline">
              <Pencil className="mr-2 h-4 w-4" />
              Edit Topic
            </Button>
            <Button
              aria-label="Delete topic"
              onClick={onDelete}
              size="icon"
              variant="ghost"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// Snippets are copy-pasted and run, so they must target this deployment.
// Module scope: build-time inlined, so it is a constant and stays out of
// the useMemo dependency list.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.wraps.dev";

function QuickStartSnippets({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);

  const codes = useMemo(
    () => ({
      typescript: {
        "@wraps.dev/client": `import { createPlatformClient } from "@wraps.dev/client";

// baseUrl defaults to https://api.wraps.dev — pin it to this deployment
const client = createPlatformClient({
  apiKey: "wraps_...",
  baseUrl: "${API_URL}",
});

// Subscribe a contact to this topic
await client.POST("/v1/contacts/", {
  body: {
    email: "user@example.com",
    topicSlugs: ["${slug}"],
  },
});`,
      },
      curl: {
        cURL: `curl -X POST ${API_URL}/v1/contacts/ \\
  -H "Authorization: Bearer wraps_..." \\
  -H "Content-Type: application/json" \\
  -d '{"email":"user@example.com","topicSlugs":["${slug}"]}'`,
      },
    }),
    [slug]
  );

  return (
    <Collapsible onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger asChild>
        <Button className="gap-1.5" size="sm" variant="ghost">
          <Code2 className="h-4 w-4" />
          Quick start
          <ChevronRight
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-2">
        <CodeTabs codes={codes.typescript} lang="typescript" />
        <CodeTabs codes={codes.curl} lang="bash" />
      </CollapsibleContent>
    </Collapsible>
  );
}
