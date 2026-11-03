"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Template, TemplateVersion } from "@wraps/db";

// Extended version type with user info
export type TemplateVersionWithUser = TemplateVersion & {
  createdByUser?: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
};

// Query Keys
export const templateKeys = {
  all: ["templates"] as const,
  lists: () => [...templateKeys.all, "list"] as const,
  list: (orgSlug: string, filters?: string) =>
    [...templateKeys.lists(), orgSlug, { filters }] as const,
  details: () => [...templateKeys.all, "detail"] as const,
  detail: (orgSlug: string, id: string) =>
    [...templateKeys.details(), orgSlug, id] as const,
  versions: (orgSlug: string, id: string) =>
    [...templateKeys.detail(orgSlug, id), "versions"] as const,
  conversation: (orgSlug: string, id: string) =>
    [...templateKeys.detail(orgSlug, id), "conversation"] as const,
};

// Fetch single template
export function useTemplate(orgSlug: string, templateId: string) {
  return useQuery({
    queryKey: templateKeys.detail(orgSlug, templateId),
    queryFn: async () => {
      const response = await fetch(
        `/api/${orgSlug}/emails/templates/${templateId}`
      );
      if (!response.ok) {
        throw new Error("Failed to load template");
      }
      return response.json() as Promise<Template>;
    },
  });
}

// List all templates for org
export function useTemplates(orgSlug: string, filters?: { status?: string }) {
  return useQuery({
    queryKey: templateKeys.list(orgSlug, JSON.stringify(filters)),
    queryFn: async () => {
      const params = new URLSearchParams(filters as Record<string, string>);
      const response = await fetch(
        `/api/${orgSlug}/emails/templates?${params}`
      );
      if (!response.ok) {
        throw new Error("Failed to load templates");
      }
      return response.json() as Promise<Template[]>;
    },
  });
}

// Update template mutation with optimistic updates
export function useUpdateTemplate(orgSlug: string, templateId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name?: string;
      description?: string;
      subject?: string;
      previewText?: string;
      emailType?: "marketing" | "transactional";
      status?: "DRAFT" | "PUBLISHED" | "ARCHIVED";
      compiledText?: string;
      brandKitId?: string | null;
    }) => {
      const response = await fetch(
        `/api/${orgSlug}/emails/templates/${templateId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      if (!response.ok) {
        throw new Error("Failed to update template");
      }
      return response.json() as Promise<Template>;
    },

    // Optimistic update
    onMutate: async (newData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: templateKeys.detail(orgSlug, templateId),
      });

      // Snapshot previous value
      const previousTemplate = queryClient.getQueryData(
        templateKeys.detail(orgSlug, templateId)
      );

      // Optimistically update
      queryClient.setQueryData(
        templateKeys.detail(orgSlug, templateId),
        (old: Template | undefined) =>
          old
            ? {
                ...old,
                ...newData,
                updatedAt: new Date().toISOString(),
              }
            : old
      );

      return { previousTemplate };
    },

    // Rollback on error
    onError: (_err, _newData, context) => {
      queryClient.setQueryData(
        templateKeys.detail(orgSlug, templateId),
        context?.previousTemplate
      );
    },

    // Refetch on success or error
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: templateKeys.detail(orgSlug, templateId),
      });
    },
  });
}

// Create template
export function useCreateTemplate(orgSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      subject?: string;
      channel?: "email" | "sms";
      source?: string;
      compiledHtml?: string;
      previewText?: string;
      emailType?: "marketing" | "transactional";
    }) => {
      const response = await fetch(`/api/${orgSlug}/emails/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to create template");
      }
      return response.json() as Promise<Template>;
    },

    onSuccess: () => {
      // Invalidate templates list
      queryClient.invalidateQueries({
        queryKey: templateKeys.lists(),
      });
    },
  });
}

// Delete template
export function useDeleteTemplate(orgSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      const response = await fetch(
        `/api/${orgSlug}/emails/templates/${templateId}`,
        {
          method: "DELETE",
        }
      );
      if (!response.ok) {
        // A 409 names the broadcasts and workflows that still use it.
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to delete template");
      }
      return response.json();
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: templateKeys.lists(),
      });
    },
  });
}

// Duplicate template
export function useDuplicateTemplate(orgSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      const response = await fetch(
        `/api/${orgSlug}/emails/templates/${templateId}/duplicate`,
        {
          method: "POST",
        }
      );
      if (!response.ok) {
        throw new Error("Failed to duplicate template");
      }
      return response.json() as Promise<Template>;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: templateKeys.lists(),
      });
    },
  });
}

// === Version Hooks ===

// List all versions for a template
export function useTemplateVersions(orgSlug: string, templateId: string) {
  return useQuery({
    queryKey: templateKeys.versions(orgSlug, templateId),
    queryFn: async () => {
      const response = await fetch(
        `/api/${orgSlug}/emails/templates/${templateId}/versions`
      );
      if (!response.ok) {
        throw new Error("Failed to load versions");
      }
      return response.json() as Promise<TemplateVersionWithUser[]>;
    },
  });
}

// Create manual version snapshot
export function useCreateVersion(orgSlug: string, templateId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { changeNote?: string }) => {
      const response = await fetch(
        `/api/${orgSlug}/emails/templates/${templateId}/versions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );
      if (!response.ok) {
        throw new Error("Failed to create version");
      }
      return response.json() as Promise<TemplateVersion>;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: templateKeys.versions(orgSlug, templateId),
      });
      // Also invalidate template detail to refresh versions list in template response
      queryClient.invalidateQueries({
        queryKey: templateKeys.detail(orgSlug, templateId),
      });
    },
  });
}

// Restore to a specific version
export function useRestoreVersion(orgSlug: string, templateId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (versionId: string) => {
      const response = await fetch(
        `/api/${orgSlug}/emails/templates/${templateId}/versions/${versionId}`,
        {
          method: "POST",
        }
      );
      if (!response.ok) {
        throw new Error("Failed to restore version");
      }
      return response.json() as Promise<{
        success: boolean;
        template: Template;
        restoredFromVersion: number;
      }>;
    },

    onSuccess: () => {
      // Invalidate both template and versions
      queryClient.invalidateQueries({
        queryKey: templateKeys.detail(orgSlug, templateId),
      });
      queryClient.invalidateQueries({
        queryKey: templateKeys.versions(orgSlug, templateId),
      });
    },
  });
}

// === Publishing Hooks ===

// Publish template to AWS SES
export function usePublishTemplate(orgSlug: string, templateId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data?: { brandKitId?: string }) => {
      const response = await fetch(
        `/api/${orgSlug}/emails/templates/${templateId}/publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: data ? JSON.stringify(data) : undefined,
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to publish template");
      }
      return response.json() as Promise<{
        success: boolean;
        sesTemplateName: string;
        publishedAt: string;
        message: string;
      }>;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: templateKeys.detail(orgSlug, templateId),
      });
      queryClient.invalidateQueries({
        queryKey: templateKeys.lists(),
      });
    },
  });
}

// Unpublish template from AWS SES
export function useUnpublishTemplate(orgSlug: string, templateId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/${orgSlug}/emails/templates/${templateId}/publish`,
        {
          method: "DELETE",
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to unpublish template");
      }
      return response.json() as Promise<{
        success: boolean;
        message: string;
      }>;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: templateKeys.detail(orgSlug, templateId),
      });
      queryClient.invalidateQueries({
        queryKey: templateKeys.lists(),
      });
    },
  });
}
