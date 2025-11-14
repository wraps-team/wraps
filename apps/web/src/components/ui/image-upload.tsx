"use client";

import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  disabled?: boolean;
  orgSlug: string;
  className?: string;
}

export function ImageUpload({
  value,
  onChange,
  disabled,
  orgSlug,
  className,
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Only PNG, JPEG, and WebP images are allowed");
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("File size must be less than 5MB");
      return;
    }

    setError(null);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("orgSlug", orgSlug);
      if (value) {
        formData.append("oldLogoUrl", value);
      }

      const response = await fetch("/api/upload/organization-logo", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to upload image");
      }

      const data = await response.json();
      onChange(data.url);
      setUploadProgress(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload image");
      onChange(null);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemove = async () => {
    if (!value) return;

    setIsUploading(true);
    setError(null);

    try {
      // Only call delete API if it's a Vercel Blob URL
      if (value.includes("vercel-storage.com")) {
        const response = await fetch(
          `/api/upload/organization-logo?url=${encodeURIComponent(value)}&orgSlug=${orgSlug}`,
          {
            method: "DELETE",
          }
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to delete image");
        }
      }

      onChange(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete image");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-start gap-4">
        <div className="relative h-24 w-24 overflow-hidden rounded-lg border-2 border-muted-foreground/25 border-dashed bg-muted/50">
          {value ? (
            <Image
              alt="Organization logo"
              className="object-cover"
              fill
              src={value}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <div className="flex gap-2">
            <Button
              disabled={disabled || isUploading}
              onClick={() => fileInputRef.current?.click()}
              size="sm"
              type="button"
              variant="outline"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  {value ? "Replace" : "Upload"}
                </>
              )}
            </Button>

            {value && !isUploading && (
              <Button
                disabled={disabled}
                onClick={handleRemove}
                size="sm"
                type="button"
                variant="outline"
              >
                <X className="mr-2 h-4 w-4" />
                Remove
              </Button>
            )}
          </div>

          <p className="text-muted-foreground text-xs">
            PNG, JPEG, or WebP. Max 5MB.
          </p>

          {isUploading && uploadProgress > 0 && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}

          {error && <p className="text-destructive text-sm">{error}</p>}
        </div>
      </div>

      <input
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        disabled={disabled || isUploading}
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />
    </div>
  );
}
