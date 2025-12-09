"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BrandKit } from "@wraps/db";

// Query Keys
export const brandKitKeys = {
  all: ["brand-kits"] as const,
  lists: () => [...brandKitKeys.all, "list"] as const,
  list: (orgSlug: string) => [...brandKitKeys.lists(), orgSlug] as const,
  details: () => [...brandKitKeys.all, "detail"] as const,
  detail: (orgSlug: string, id: string) =>
    [...brandKitKeys.details(), orgSlug, id] as const,
  default: (orgSlug: string) =>
    [...brandKitKeys.all, "default", orgSlug] as const,
};

// Fetch all brand kits for org
export function useBrandKits(orgSlug: string) {
  return useQuery({
    queryKey: brandKitKeys.list(orgSlug),
    queryFn: async () => {
      const response = await fetch(`/api/${orgSlug}/brand-kits`);
      if (!response.ok) {
        throw new Error("Failed to load brand kits");
      }
      return response.json() as Promise<BrandKit[]>;
    },
  });
}

// Fetch single brand kit
export function useBrandKit(orgSlug: string, brandKitId: string) {
  return useQuery({
    queryKey: brandKitKeys.detail(orgSlug, brandKitId),
    queryFn: async () => {
      const response = await fetch(`/api/${orgSlug}/brand-kits/${brandKitId}`);
      if (!response.ok) {
        throw new Error("Failed to load brand kit");
      }
      return response.json() as Promise<BrandKit>;
    },
    enabled: !!brandKitId,
  });
}

// Fetch default brand kit for org
export function useDefaultBrandKit(orgSlug: string) {
  const { data: brandKits, ...rest } = useBrandKits(orgSlug);

  return {
    ...rest,
    data: brandKits?.find((kit) => kit.isDefault) ?? brandKits?.[0] ?? null,
  };
}

// Create brand kit mutation
export function useCreateBrandKit(orgSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<BrandKit>) => {
      const response = await fetch(`/api/${orgSlug}/brand-kits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error("Failed to create brand kit");
      }
      return response.json() as Promise<BrandKit>;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: brandKitKeys.lists(),
      });
    },
  });
}

// Update brand kit mutation
export function useUpdateBrandKit(orgSlug: string, brandKitId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: Partial<BrandKit>) => {
      const response = await fetch(`/api/${orgSlug}/brand-kits/${brandKitId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error("Failed to update brand kit");
      }
      return response.json() as Promise<BrandKit>;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: brandKitKeys.detail(orgSlug, brandKitId),
      });
      queryClient.invalidateQueries({
        queryKey: brandKitKeys.lists(),
      });
    },
  });
}

// Delete brand kit mutation
export function useDeleteBrandKit(orgSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (brandKitId: string) => {
      const response = await fetch(`/api/${orgSlug}/brand-kits/${brandKitId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete brand kit");
      }
      return response.json();
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: brandKitKeys.lists(),
      });
    },
  });
}

// Set brand kit as default mutation
export function useSetDefaultBrandKit(orgSlug: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (brandKitId: string) => {
      const response = await fetch(
        `/api/${orgSlug}/brand-kits/${brandKitId}/default`,
        {
          method: "POST",
        }
      );
      if (!response.ok) {
        throw new Error("Failed to set default brand kit");
      }
      return response.json() as Promise<BrandKit>;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: brandKitKeys.lists(),
      });
    },
  });
}

// Extract brand kit from domain mutation
export function useExtractBrandKit(orgSlug: string) {
  return useMutation({
    mutationFn: async (domain: string) => {
      const response = await fetch(`/api/${orgSlug}/brand-kits/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to extract brand kit");
      }
      return response.json() as Promise<{
        success: boolean;
        brandKit: Partial<BrandKit>;
      }>;
    },
  });
}
