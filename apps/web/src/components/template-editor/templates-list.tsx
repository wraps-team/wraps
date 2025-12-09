"use client";

import type { Template } from "@wraps/db";
import { formatDistanceToNow } from "date-fns";
import {
  Cloud,
  CloudOff,
  Copy,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useDeleteTemplate,
  useDuplicateTemplate,
  usePublishTemplate,
  useTemplates,
  useUnpublishTemplate,
} from "@/hooks/use-template-queries";
import { cn } from "@/lib/utils";

type TemplatesListProps = {
  orgSlug: string;
};

const statusColors: Record<string, string> = {
  DRAFT: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  PUBLISHED: "bg-green-500/10 text-green-600 border-green-500/20",
  ARCHIVED: "bg-gray-500/10 text-gray-600 border-gray-500/20",
};

export function TemplatesList({ orgSlug }: TemplatesListProps) {
  const router = useRouter();
  const { data: templates, isLoading } = useTemplates(orgSlug);
  const deleteTemplate = useDeleteTemplate(orgSlug);
  const duplicateTemplate = useDuplicateTemplate(orgSlug);

  const handleDelete = async (templateId: string) => {
    if (confirm("Are you sure you want to delete this template?")) {
      deleteTemplate.mutate(templateId);
    }
  };

  const handleDuplicate = async (templateId: string) => {
    const result = await duplicateTemplate.mutateAsync(templateId);
    router.push(`/${orgSlug}/templates/${result.id}`);
  };

  // Publish/unpublish hooks need to be created per template
  // We'll use a wrapper component to handle this

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...new Array(6)].map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton loading items
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!templates || templates.length === 0) {
    return (
      <Card className="py-12">
        <CardContent className="text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 font-semibold text-lg">No templates yet</h3>
          <p className="mb-4 text-muted-foreground">
            Create your first email template to get started.
          </p>
          <Button asChild>
            <Link href={`/${orgSlug}/templates/new`}>
              <Plus className="mr-2 h-4 w-4" />
              Create Template
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Create button */}
      <div className="flex justify-end">
        <Button asChild>
          <Link href={`/${orgSlug}/templates/new`}>
            <Plus className="mr-2 h-4 w-4" />
            Create Template
          </Link>
        </Button>
      </div>

      {/* Templates Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <TemplateCardWithPublish
            key={template.id}
            onDelete={() => handleDelete(template.id)}
            onDuplicate={() => handleDuplicate(template.id)}
            orgSlug={orgSlug}
            template={template}
          />
        ))}
      </div>
    </div>
  );
}

// Wrapper component to handle publish/unpublish hooks per template
function TemplateCardWithPublish({
  template,
  orgSlug,
  onDelete,
  onDuplicate,
}: {
  template: Template;
  orgSlug: string;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const publishMutation = usePublishTemplate(orgSlug, template.id);
  const unpublishMutation = useUnpublishTemplate(orgSlug, template.id);

  const handlePublish = async () => {
    try {
      const result = await publishMutation.mutateAsync({});
      toast.success("Template published to AWS SES", {
        description: result.message,
      });
    } catch (error) {
      toast.error("Failed to publish template", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleUnpublish = async () => {
    try {
      const result = await unpublishMutation.mutateAsync();
      toast.success("Template unpublished", {
        description: result.message,
      });
    } catch (error) {
      toast.error("Failed to unpublish template", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  return (
    <TemplateCard
      isPublishing={publishMutation.isPending || unpublishMutation.isPending}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onPublish={handlePublish}
      onUnpublish={handleUnpublish}
      orgSlug={orgSlug}
      template={template}
    />
  );
}

type TemplateCardProps = {
  template: Template;
  orgSlug: string;
  onDelete: () => void;
  onDuplicate: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  isPublishing?: boolean;
};

function TemplateCard({
  template,
  orgSlug,
  onDelete,
  onDuplicate,
  onPublish,
  onUnpublish,
  isPublishing,
}: TemplateCardProps) {
  const hasSubject = !!template.subject;
  const isPublished = template.status === "PUBLISHED";

  return (
    <Card className="group transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base">
              <Link
                className="hover:underline"
                href={`/${orgSlug}/templates/${template.id}`}
              >
                {template.name}
              </Link>
            </CardTitle>
            {template.description && (
              <CardDescription className="line-clamp-2">
                {template.description}
              </CardDescription>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="h-8 w-8 opacity-0 group-hover:opacity-100"
                size="icon"
                variant="ghost"
              >
                {isPublishing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/${orgSlug}/templates/${template.id}`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {hasSubject ? (
                <DropdownMenuItem disabled={isPublishing} onClick={onPublish}>
                  <Cloud className="mr-2 h-4 w-4" />
                  {isPublished ? "Update on SES" : "Publish to SES"}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled>
                  <Cloud className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Add subject to publish
                  </span>
                </DropdownMenuItem>
              )}
              {isPublished && (
                <DropdownMenuItem disabled={isPublishing} onClick={onUnpublish}>
                  <CloudOff className="mr-2 h-4 w-4" />
                  Unpublish from SES
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-center justify-between text-sm">
          <Badge
            className={cn("text-xs", statusColors[template.status])}
            variant="outline"
          >
            {template.status.toLowerCase()}
          </Badge>
          <span className="text-muted-foreground text-xs">
            Updated{" "}
            {formatDistanceToNow(new Date(template.updatedAt), {
              addSuffix: true,
            })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
