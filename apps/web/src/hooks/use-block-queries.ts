"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { JSONContent } from "@tiptap/core";
import type { ReusableBlock } from "@wraps/db";

export const blockKeys = {
  all: ["blocks"] as const,
  lists: () => [...blockKeys.all, "list"] as const,
  list: (orgSlug: string, filters?: string) =>
    [...blockKeys.lists(), orgSlug, { filters }] as const,
};

export function useBlocks(orgSlug: string, category?: string) {
  return useQuery({
    queryKey: blockKeys.list(orgSlug, category || "all"),
    queryFn: async () => {
      const params = category ? `?category=${category}` : "";
      const response = await fetch(`/api/${orgSlug}/blocks${params}`);
      if (!response.ok) {
        throw new Error("Failed to load blocks");
      }
      return response.json() as Promise<ReusableBlock[]>;
    },
  });
}

export function useCreateBlock(orgSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      content: JSONContent;
      category?: string;
      description?: string;
    }) => {
      const response = await fetch(`/api/${orgSlug}/blocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error("Failed to create block");
      }
      return response.json() as Promise<ReusableBlock>;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blockKeys.lists() });
    },
  });
}

export function useDeleteBlock(orgSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (blockId: string) => {
      const response = await fetch(`/api/${orgSlug}/blocks/${blockId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete block");
      }
      return response.json();
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: blockKeys.lists() });
    },
  });
}

export function useTrackBlockUsage(orgSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (blockId: string) => {
      const response = await fetch(`/api/${orgSlug}/blocks/${blockId}/use`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to track usage");
      }
      return response.json();
    },

    onSuccess: () => {
      // Update usage count in cache
      queryClient.invalidateQueries({ queryKey: blockKeys.lists() });
    },
  });
}
