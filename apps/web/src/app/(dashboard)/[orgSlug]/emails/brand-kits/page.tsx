"use client";

import type { BrandKit } from "@wraps/db";
import { Badge } from "@wraps/ui/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@wraps/ui/components/ui/dropdown-menu";
import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import {
  Check,
  MoreHorizontal,
  Palette,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  useBrandKits,
  useDeleteBrandKit,
  useSetDefaultBrandKit,
} from "@/hooks/use-brand-kit-queries";

export default function BrandKitsPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params.orgSlug as string;

  const { data: brandKits, isLoading } = useBrandKits(orgSlug);
  const deleteBrandKit = useDeleteBrandKit(orgSlug);
  const setDefaultBrandKit = useSetDefaultBrandKit(orgSlug);

  const handleDelete = async (kit: BrandKit) => {
    const confirmed = window.confirm(
      kit.isDefault
        ? `Delete "${kit.name}"? Another brand kit will become the default.`
        : `Delete "${kit.name}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteBrandKit.mutateAsync(kit.id);
      toast.success("Brand kit deleted");
    } catch {
      toast.error("Failed to delete brand kit");
    }
  };

  const handleSetDefault = async (kit: BrandKit) => {
    try {
      await setDefaultBrandKit.mutateAsync(kit.id);
      toast.success("Default brand kit updated");
    } catch {
      toast.error("Failed to set default");
    }
  };

  if (isLoading) {
    return (
      <div className="px-4 lg:px-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Skeleton className="mb-2 h-8 w-48" />
            <Skeleton className="h-5 w-72" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...new Array(3)].map((_, i) => (
            <Panel
              description={<Skeleton className="h-4 w-1/2" />}
              // biome-ignore lint/suspicious/noArrayIndexKey: Static skeleton
              key={i}
              label={<Skeleton className="h-5 w-3/4" />}
            >
              <Skeleton className="h-12 w-full" />
            </Panel>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-semibold text-2xl">Brand Kits</h1>
          <p className="text-muted-foreground">
            Manage your brand colors, fonts, and styling for emails
          </p>
        </div>
        <Button asChild>
          <Link href={`/${orgSlug}/emails/brand-kits/new`}>
            <Plus className="mr-2 h-4 w-4" />
            New Brand Kit
          </Link>
        </Button>
      </div>

      {!brandKits || brandKits.length === 0 ? (
        <Panel label={<PanelTitle>Brand kits</PanelTitle>}>
          <div className="py-8 text-center">
            <Palette className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 font-semibold text-lg">No brand kits yet</h3>
            <p className="mb-4 text-muted-foreground">
              Create your first brand kit to maintain consistent styling across
              your emails.
            </p>
            <Button asChild>
              <Link href={`/${orgSlug}/emails/brand-kits/new`}>
                <Plus className="mr-2 h-4 w-4" />
                Create Brand Kit
              </Link>
            </Button>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {brandKits.map((kit) => (
            <Panel
              actions={
                <div className="opacity-0 transition-opacity group-hover:opacity-100">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label="More actions"
                        className="h-8 w-8"
                        onClick={(e) => e.stopPropagation()}
                        size="icon"
                        variant="ghost"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(
                            `/${orgSlug}/emails/brand-kits/${kit.id}`
                          );
                        }}
                      >
                        Edit
                      </DropdownMenuItem>
                      {!kit.isDefault && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSetDefault(kit);
                          }}
                        >
                          <Check className="mr-2 h-4 w-4" />
                          Set as Default
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(kit);
                        }}
                        variant="destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              }
              className="group cursor-pointer"
              description={kit.companyName || "No company name"}
              key={kit.id}
              label={
                <PanelTitle className="flex items-center gap-2">
                  {kit.name}
                  {kit.isDefault && (
                    <Badge className="gap-1" variant="secondary">
                      <Star className="h-3 w-3" />
                      Default
                    </Badge>
                  )}
                </PanelTitle>
              }
              onClick={() =>
                router.push(`/${orgSlug}/emails/brand-kits/${kit.id}`)
              }
            >
              {/* Color palette preview */}
              <div className="mb-3 flex gap-1">
                <div
                  className="h-10 flex-1 rounded-l-md border"
                  style={{ backgroundColor: kit.primaryColor }}
                  title="Primary"
                />
                <div
                  className="h-10 flex-1 border-y"
                  style={{ backgroundColor: kit.secondaryColor }}
                  title="Secondary"
                />
                <div
                  className="h-10 flex-1 border-y"
                  style={{ backgroundColor: kit.backgroundColor }}
                  title="Background"
                />
                <div
                  className="h-10 flex-1 rounded-r-md border"
                  style={{ backgroundColor: kit.textColor }}
                  title="Text"
                />
              </div>

              {/* Logo preview */}
              {kit.logoUrl && (
                <div className="mb-3 flex h-12 items-center justify-center rounded border bg-muted/30 p-2">
                  <img
                    alt={`${kit.name} logo`}
                    className="max-h-full max-w-full object-contain"
                    src={kit.logoUrl}
                  />
                </div>
              )}

              {/* Meta info */}
              <div className="flex items-center justify-between text-muted-foreground text-xs">
                <span style={{ fontFamily: kit.fontFamily }}>
                  {kit.fontFamily.split(",")[0].replace(/['"]/g, "")}
                </span>
                <span>
                  Updated{" "}
                  {formatDistanceToNow(new Date(kit.updatedAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
