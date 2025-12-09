"use client";

import type { BrandKit } from "@wraps/db";
import {
  Check,
  Globe,
  Loader2,
  MoreHorizontal,
  Palette,
  Plus,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type OrganizationSettingsBrandKitsProps = {
  organization: {
    id: string;
    name: string;
    slug: string | null;
    logo: string | null;
  };
  userRole: "owner" | "admin" | "member";
};

type BrandKitFormData = {
  name: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  fontFamily: string;
  headingFontFamily: string;
  buttonStyle: string;
  buttonRadius: string;
  companyName: string;
  companyAddress: string;
};

const defaultFormData: BrandKitFormData = {
  name: "",
  logoUrl: "",
  primaryColor: "#5046e5",
  secondaryColor: "#6366f1",
  backgroundColor: "#ffffff",
  textColor: "#1f2937",
  fontFamily: "system-ui, sans-serif",
  headingFontFamily: "",
  buttonStyle: "rounded",
  buttonRadius: "4px",
  companyName: "",
  companyAddress: "",
};

const FONT_OPTIONS = [
  { value: "system-ui, sans-serif", label: "System Default" },
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "Helvetica, sans-serif", label: "Helvetica" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "'Times New Roman', serif", label: "Times New Roman" },
  { value: "'Courier New', monospace", label: "Courier New" },
  { value: "Verdana, sans-serif", label: "Verdana" },
];

const BUTTON_STYLE_OPTIONS = [
  { value: "rounded", label: "Rounded" },
  { value: "square", label: "Square" },
  { value: "pill", label: "Pill" },
];

export function OrganizationSettingsBrandKits({
  organization,
  userRole,
}: OrganizationSettingsBrandKitsProps) {
  const [brandKits, setBrandKits] = useState<BrandKit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingKit, setEditingKit] = useState<BrandKit | null>(null);
  const [formData, setFormData] = useState<BrandKitFormData>(defaultFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [extractDomain, setExtractDomain] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);

  const canEdit = userRole === "owner" || userRole === "admin";

  const fetchBrandKits = useCallback(async () => {
    if (!organization.slug) {
      return;
    }

    try {
      const response = await fetch(`/api/${organization.slug}/brand-kits`);
      if (response.ok) {
        const data = await response.json();
        setBrandKits(data);
      }
    } catch (error) {
      console.error("Error fetching brand kits:", error);
      toast.error("Failed to load brand kits");
    } finally {
      setIsLoading(false);
    }
  }, [organization.slug]);

  useEffect(() => {
    fetchBrandKits();
  }, [fetchBrandKits]);

  const handleOpenCreate = () => {
    setEditingKit(null);
    setFormData(defaultFormData);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (kit: BrandKit) => {
    setEditingKit(kit);
    setFormData({
      name: kit.name,
      logoUrl: kit.logoUrl || "",
      primaryColor: kit.primaryColor,
      secondaryColor: kit.secondaryColor,
      backgroundColor: kit.backgroundColor,
      textColor: kit.textColor,
      fontFamily: kit.fontFamily,
      headingFontFamily: kit.headingFontFamily || "",
      buttonStyle: kit.buttonStyle,
      buttonRadius: kit.buttonRadius,
      companyName: kit.companyName || "",
      companyAddress: kit.companyAddress || "",
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!organization.slug) {
      return;
    }

    setIsSaving(true);
    try {
      const url = editingKit
        ? `/api/${organization.slug}/brand-kits/${editingKit.id}`
        : `/api/${organization.slug}/brand-kits`;

      const response = await fetch(url, {
        method: editingKit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        toast.success(editingKit ? "Brand kit updated" : "Brand kit created");
        setIsDialogOpen(false);
        fetchBrandKits();
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to save brand kit");
      }
    } catch (error) {
      console.error("Error saving brand kit:", error);
      toast.error("Failed to save brand kit");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSetDefault = async (kit: BrandKit) => {
    if (!organization.slug) {
      return;
    }

    try {
      const response = await fetch(
        `/api/${organization.slug}/brand-kits/${kit.id}/default`,
        { method: "POST" }
      );

      if (response.ok) {
        toast.success("Default brand kit updated");
        fetchBrandKits();
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to set default");
      }
    } catch (error) {
      console.error("Error setting default:", error);
      toast.error("Failed to set default");
    }
  };

  const handleDelete = async (kit: BrandKit) => {
    if (!organization.slug) {
      return;
    }

    // Confirm deletion
    const confirmed = window.confirm(
      kit.isDefault
        ? `Delete "${kit.name}"? Another brand kit will become the default.`
        : `Delete "${kit.name}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(
        `/api/${organization.slug}/brand-kits/${kit.id}`,
        { method: "DELETE" }
      );

      if (response.ok) {
        toast.success("Brand kit deleted");
        fetchBrandKits();
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to delete brand kit");
      }
    } catch (error) {
      console.error("Error deleting brand kit:", error);
      toast.error("Failed to delete brand kit");
    }
  };

  const handleExtractFromDomain = async () => {
    if (!(organization.slug && extractDomain.trim())) {
      return;
    }

    setIsExtracting(true);
    try {
      const response = await fetch(
        `/api/${organization.slug}/brand-kits/extract`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: extractDomain.trim() }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const extracted = data.brandKit;

        // Ensure colors are valid hex format for color picker (#rrggbb)
        const ensureHexColor = (color: string, fallback: string): string => {
          if (!color) {
            return fallback;
          }
          const hex = color.trim().toLowerCase();
          // Must be exactly #rrggbb format for color picker
          if (/^#[0-9a-f]{6}$/.test(hex)) {
            return hex;
          }
          return fallback;
        };

        // Populate form with extracted data
        setFormData({
          name: extracted.name || "",
          logoUrl: extracted.logoUrl || "",
          primaryColor: ensureHexColor(
            extracted.primaryColor,
            defaultFormData.primaryColor
          ),
          secondaryColor: ensureHexColor(
            extracted.secondaryColor,
            defaultFormData.secondaryColor
          ),
          backgroundColor: ensureHexColor(
            extracted.backgroundColor,
            defaultFormData.backgroundColor
          ),
          textColor: ensureHexColor(
            extracted.textColor,
            defaultFormData.textColor
          ),
          fontFamily: extracted.fontFamily || defaultFormData.fontFamily,
          headingFontFamily: "",
          buttonStyle: defaultFormData.buttonStyle,
          buttonRadius: defaultFormData.buttonRadius,
          companyName: extracted.companyName || "",
          companyAddress: "",
        });

        toast.success("Brand elements extracted!", {
          description: "Review and adjust the extracted values before saving.",
        });
        setExtractDomain("");
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to extract brand kit");
      }
    } catch (error) {
      console.error("Error extracting brand kit:", error);
      toast.error("Failed to extract brand kit");
    } finally {
      setIsExtracting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!canEdit && (
        <Alert>
          <AlertDescription>
            You do not have permission to edit brand kits. Only owners and
            admins can make changes.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Brand Kits</CardTitle>
              <CardDescription>
                Manage your organization's brand kits for consistent email
                styling.
              </CardDescription>
            </div>
            {canEdit && (
              <Button onClick={handleOpenCreate} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                New Brand Kit
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {brandKits.length === 0 ? (
            <div className="py-8 text-center">
              <Palette className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 font-medium">No brand kits yet</h3>
              <p className="mb-4 text-muted-foreground text-sm">
                Create your first brand kit to maintain consistent styling
                across your emails.
              </p>
              {canEdit && (
                <Button onClick={handleOpenCreate} size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Brand Kit
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {brandKits.map((kit) => (
                <div
                  className="flex items-center justify-between rounded-lg border p-4"
                  key={kit.id}
                >
                  <div className="flex items-center gap-4">
                    {/* Color Preview */}
                    <div className="flex gap-1">
                      <div
                        className="h-8 w-8 rounded-l border"
                        style={{ backgroundColor: kit.primaryColor }}
                        title="Primary Color"
                      />
                      <div
                        className="h-8 w-8 border-y"
                        style={{ backgroundColor: kit.secondaryColor }}
                        title="Secondary Color"
                      />
                      <div
                        className="h-8 w-8 rounded-r border"
                        style={{ backgroundColor: kit.backgroundColor }}
                        title="Background Color"
                      />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{kit.name}</h4>
                        {kit.isDefault && (
                          <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary text-xs">
                            <Star className="h-3 w-3" />
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground text-sm">
                        {kit.companyName || "No company name set"}
                      </p>
                    </div>
                  </div>

                  {canEdit && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleOpenEdit(kit)}>
                          Edit
                        </DropdownMenuItem>
                        {!kit.isDefault && (
                          <DropdownMenuItem
                            onClick={() => handleSetDefault(kit)}
                          >
                            <Check className="mr-2 h-4 w-4" />
                            Set as Default
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(kit)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog onOpenChange={setIsDialogOpen} open={isDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingKit ? "Edit Brand Kit" : "Create Brand Kit"}
            </DialogTitle>
            <DialogDescription>
              Configure your brand colors, fonts, and company information.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Extract from Domain - Only show when creating new */}
            {!editingKit && (
              <>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h4 className="font-medium">Quick Start</h4>
                  </div>
                  <p className="mb-3 text-muted-foreground text-sm">
                    Enter your website URL to automatically extract brand
                    colors, logo, and company name.
                  </p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Globe className="-translate-y-1/2 absolute top-1/2 left-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="pl-9"
                        disabled={isExtracting}
                        onChange={(e) => setExtractDomain(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleExtractFromDomain();
                          }
                        }}
                        placeholder="example.com"
                        value={extractDomain}
                      />
                    </div>
                    <Button
                      disabled={!extractDomain.trim() || isExtracting}
                      onClick={handleExtractFromDomain}
                      type="button"
                      variant="secondary"
                    >
                      {isExtracting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Extracting...
                        </>
                      ) : (
                        "Extract"
                      )}
                    </Button>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or configure manually
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* Basic Info */}
            <div className="space-y-4">
              <h4 className="font-medium">Basic Information</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Brand Kit Name"
                    value={formData.name}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="logoUrl">Logo URL</Label>
                  <Input
                    id="logoUrl"
                    onChange={(e) =>
                      setFormData({ ...formData, logoUrl: e.target.value })
                    }
                    placeholder="https://..."
                    value={formData.logoUrl}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Colors */}
            <div className="space-y-4">
              <h4 className="font-medium">Colors</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="primaryColor">Primary Color</Label>
                  <div className="flex gap-2">
                    <Input
                      className="h-10 w-14 p-1"
                      id="primaryColor"
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          primaryColor: e.target.value,
                        })
                      }
                      type="color"
                      value={formData.primaryColor}
                    />
                    <Input
                      className="flex-1"
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          primaryColor: e.target.value,
                        })
                      }
                      placeholder="#5046e5"
                      value={formData.primaryColor}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="secondaryColor">Secondary Color</Label>
                  <div className="flex gap-2">
                    <Input
                      className="h-10 w-14 p-1"
                      id="secondaryColor"
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          secondaryColor: e.target.value,
                        })
                      }
                      type="color"
                      value={formData.secondaryColor}
                    />
                    <Input
                      className="flex-1"
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          secondaryColor: e.target.value,
                        })
                      }
                      placeholder="#6366f1"
                      value={formData.secondaryColor}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="backgroundColor">Background Color</Label>
                  <div className="flex gap-2">
                    <Input
                      className="h-10 w-14 p-1"
                      id="backgroundColor"
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          backgroundColor: e.target.value,
                        })
                      }
                      type="color"
                      value={formData.backgroundColor}
                    />
                    <Input
                      className="flex-1"
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          backgroundColor: e.target.value,
                        })
                      }
                      placeholder="#ffffff"
                      value={formData.backgroundColor}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="textColor">Text Color</Label>
                  <div className="flex gap-2">
                    <Input
                      className="h-10 w-14 p-1"
                      id="textColor"
                      onChange={(e) =>
                        setFormData({ ...formData, textColor: e.target.value })
                      }
                      type="color"
                      value={formData.textColor}
                    />
                    <Input
                      className="flex-1"
                      onChange={(e) =>
                        setFormData({ ...formData, textColor: e.target.value })
                      }
                      placeholder="#1f2937"
                      value={formData.textColor}
                    />
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Typography */}
            <div className="space-y-4">
              <h4 className="font-medium">Typography</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fontFamily">Body Font</Label>
                  <Select
                    onValueChange={(value) =>
                      setFormData({ ...formData, fontFamily: value })
                    }
                    value={formData.fontFamily}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select font" />
                    </SelectTrigger>
                    <SelectContent>
                      {FONT_OPTIONS.map((font) => (
                        <SelectItem key={font.value} value={font.value}>
                          {font.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="headingFontFamily">Heading Font</Label>
                  <Select
                    onValueChange={(value) =>
                      setFormData({
                        ...formData,
                        headingFontFamily: value === "same" ? "" : value,
                      })
                    }
                    value={formData.headingFontFamily || "same"}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select font" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="same">Same as body</SelectItem>
                      {FONT_OPTIONS.map((font) => (
                        <SelectItem key={font.value} value={font.value}>
                          {font.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* Button Styles */}
            <div className="space-y-4">
              <h4 className="font-medium">Button Styles</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="buttonStyle">Button Style</Label>
                  <Select
                    onValueChange={(value) =>
                      setFormData({ ...formData, buttonStyle: value })
                    }
                    value={formData.buttonStyle}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select style" />
                    </SelectTrigger>
                    <SelectContent>
                      {BUTTON_STYLE_OPTIONS.map((style) => (
                        <SelectItem key={style.value} value={style.value}>
                          {style.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="buttonRadius">Button Radius</Label>
                  <Input
                    id="buttonRadius"
                    onChange={(e) =>
                      setFormData({ ...formData, buttonRadius: e.target.value })
                    }
                    placeholder="4px"
                    value={formData.buttonRadius}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Company Info */}
            <div className="space-y-4">
              <h4 className="font-medium">Company Information</h4>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    onChange={(e) =>
                      setFormData({ ...formData, companyName: e.target.value })
                    }
                    placeholder="Acme Inc."
                    value={formData.companyName}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyAddress">Company Address</Label>
                  <Textarea
                    id="companyAddress"
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        companyAddress: e.target.value,
                      })
                    }
                    placeholder="123 Main St, City, State 12345"
                    rows={2}
                    value={formData.companyAddress}
                  />
                  <p className="text-muted-foreground text-xs">
                    This will appear in email footers for CAN-SPAM compliance.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={isSaving}
              onClick={() => setIsDialogOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={isSaving || !formData.name.trim()}
              onClick={handleSave}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : editingKit ? (
                "Save Changes"
              ) : (
                "Create Brand Kit"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
