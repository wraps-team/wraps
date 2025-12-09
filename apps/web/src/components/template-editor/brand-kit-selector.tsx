"use client";

import { ExternalLink, Palette, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBrandKits } from "@/hooks/use-brand-kit-queries";
import { cn } from "@/lib/utils";
import { useTemplateStore } from "@/stores/template-store";

type BrandKitSelectorProps = {
  orgSlug: string;
};

export function BrandKitSelector({ orgSlug }: BrandKitSelectorProps) {
  const { selectedBrandKitId } = useTemplateStore((state) => state.localState);
  const { setSelectedBrandKitId } = useTemplateStore((state) => state.actions);

  // Fetch brand kits for this organization
  const { data: brandKits, isLoading } = useBrandKits(orgSlug);

  // Get the selected brand kit or default
  const selectedBrandKit = useMemo(() => {
    if (!brandKits?.length) {
      return null;
    }
    if (selectedBrandKitId) {
      return brandKits.find((kit) => kit.id === selectedBrandKitId) ?? null;
    }
    // Return default brand kit or first one
    return brandKits.find((kit) => kit.isDefault) ?? brandKits[0];
  }, [brandKits, selectedBrandKitId]);

  // Auto-select default brand kit when loaded
  useEffect(() => {
    if (brandKits?.length && !selectedBrandKitId) {
      const defaultKit = brandKits.find((kit) => kit.isDefault);
      if (defaultKit) {
        setSelectedBrandKitId(defaultKit.id);
      } else if (brandKits[0]) {
        setSelectedBrandKitId(brandKits[0].id);
      }
    }
  }, [brandKits, selectedBrandKitId, setSelectedBrandKitId]);

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              className="h-8 gap-1.5 px-2"
              disabled={isLoading}
              size="sm"
              variant="ghost"
            >
              {selectedBrandKit ? (
                <>
                  <div
                    className="h-3 w-3 rounded-full border"
                    style={{
                      backgroundColor:
                        selectedBrandKit.primaryColor ?? "#5046e5",
                    }}
                  />
                  <span className="hidden max-w-[80px] truncate text-xs sm:inline">
                    {selectedBrandKit.name}
                  </span>
                </>
              ) : (
                <>
                  <Palette className="h-3.5 w-3.5" />
                  <span className="hidden text-xs sm:inline">Brand Kit</span>
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Brand Kit</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-56">
        <div className="px-2 py-1.5">
          <p className="font-medium text-sm">Brand Kit</p>
          <p className="text-muted-foreground text-xs">
            Apply brand styles to blocks
          </p>
        </div>
        <DropdownMenuSeparator />
        {brandKits?.map((kit) => (
          <DropdownMenuItem
            className={cn(selectedBrandKitId === kit.id && "bg-accent")}
            key={kit.id}
            onClick={() => setSelectedBrandKitId(kit.id)}
          >
            <div
              className="mr-2 h-4 w-4 rounded-full border"
              style={{ backgroundColor: kit.primaryColor ?? "#5046e5" }}
            />
            <span className="flex-1 truncate">{kit.name}</span>
            {kit.isDefault && (
              <span className="text-muted-foreground text-xs">Default</span>
            )}
          </DropdownMenuItem>
        ))}
        {(!brandKits || brandKits.length === 0) && !isLoading && (
          <div className="px-2 py-1.5">
            <p className="text-muted-foreground text-xs">
              No brand kits configured
            </p>
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            className="flex cursor-pointer items-center gap-2"
            href={`/${orgSlug}/settings?tab=brand-kits`}
          >
            <Plus className="h-4 w-4" />
            <span>New Brand Kit</span>
            <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
