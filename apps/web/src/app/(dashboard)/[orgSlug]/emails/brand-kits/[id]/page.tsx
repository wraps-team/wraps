"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Label } from "@wraps/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { Textarea } from "@wraps/ui/components/ui/textarea";
import { ArrowLeft, FileText, Globe, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useBrandKit,
  useCreateBrandKit,
  useExtractBrandKit,
  useExtractBrandKitFromTemplate,
  useReactEmailTemplates,
  useUpdateBrandKit,
} from "@/hooks/use-brand-kit-queries";

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

export default function BrandKitEditPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = params.orgSlug as string;
  const brandKitId = params.id as string;
  const isNew = brandKitId === "new";

  const { data: existingKit, isLoading } = useBrandKit(
    orgSlug,
    isNew ? "" : brandKitId
  );
  const createBrandKit = useCreateBrandKit(orgSlug);
  const updateBrandKit = useUpdateBrandKit(orgSlug, brandKitId);
  const extractBrandKit = useExtractBrandKit(orgSlug);
  const extractFromTemplate = useExtractBrandKitFromTemplate(orgSlug);
  const { data: reactEmailTemplates } = useReactEmailTemplates(orgSlug, isNew);

  const [formData, setFormData] = useState<BrandKitFormData>(defaultFormData);
  const [extractDomain, setExtractDomain] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Populate form when editing existing kit
  useEffect(() => {
    if (existingKit) {
      setFormData({
        name: existingKit.name,
        logoUrl: existingKit.logoUrl || "",
        primaryColor: existingKit.primaryColor,
        secondaryColor: existingKit.secondaryColor,
        backgroundColor: existingKit.backgroundColor,
        textColor: existingKit.textColor,
        fontFamily: existingKit.fontFamily,
        headingFontFamily: existingKit.headingFontFamily || "",
        buttonStyle: existingKit.buttonStyle,
        buttonRadius: existingKit.buttonRadius,
        companyName: existingKit.companyName || "",
        companyAddress: existingKit.companyAddress || "",
      });
    }
  }, [existingKit]);

  const handleExtractFromDomain = async () => {
    if (!extractDomain.trim()) {
      return;
    }

    try {
      const result = await extractBrandKit.mutateAsync(extractDomain.trim());
      const extracted = result.brandKit;

      const ensureHexColor = (
        color: string | undefined,
        fallback: string
      ): string => {
        if (!color) {
          return fallback;
        }
        const hex = color.trim().toLowerCase();
        if (/^#[0-9a-f]{6}$/.test(hex)) {
          return hex;
        }
        return fallback;
      };

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
    } catch {
      toast.error("Failed to extract brand kit");
    }
  };

  const handleExtractFromTemplate = async () => {
    if (!selectedTemplateId) {
      return;
    }

    try {
      const result = await extractFromTemplate.mutateAsync(selectedTemplateId);
      const extracted = result.brandKit;

      const ensureHexColor = (
        color: string | undefined,
        fallback: string
      ): string => {
        if (!color) {
          return fallback;
        }
        const hex = color.trim().toLowerCase();
        if (/^#[0-9a-f]{6}$/.test(hex)) {
          return hex;
        }
        return fallback;
      };

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
        headingFontFamily: extracted.headingFontFamily || "",
        buttonStyle: extracted.buttonStyle || defaultFormData.buttonStyle,
        buttonRadius: extracted.buttonRadius || defaultFormData.buttonRadius,
        companyName: extracted.companyName || "",
        companyAddress: "",
      });

      toast.success("Brand elements extracted from template!", {
        description: "Review and adjust the extracted values before saving.",
      });
      setSelectedTemplateId("");
    } catch {
      toast.error("Failed to extract brand kit from template");
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Please enter a name for the brand kit");
      return;
    }

    setIsSaving(true);
    try {
      if (isNew) {
        const result = await createBrandKit.mutateAsync(formData);
        toast.success("Brand kit created");
        router.push(`/${orgSlug}/emails/brand-kits/${result.id}`);
      } else {
        await updateBrandKit.mutateAsync(formData);
        toast.success("Brand kit updated");
      }
    } catch {
      toast.error(
        isNew ? "Failed to create brand kit" : "Failed to update brand kit"
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!isNew && isLoading) {
    return (
      <div className="px-4 lg:px-6">
        <div className="mb-6">
          <Skeleton className="mb-2 h-8 w-48" />
          <Skeleton className="h-5 w-72" />
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 lg:px-6">
      <div className="mb-6">
        <Button asChild className="mb-4" size="sm" variant="ghost">
          <Link href={`/${orgSlug}/emails/brand-kits`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Brand Kits
          </Link>
        </Button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-2xl">
              {isNew ? "Create Brand Kit" : "Edit Brand Kit"}
            </h1>
            <p className="text-muted-foreground">
              Configure your brand colors, fonts, and company information
            </p>
          </div>
          <Button
            disabled={isSaving || !formData.name.trim()}
            onClick={handleSave}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : isNew ? (
              "Create Brand Kit"
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main form */}
        <div className="space-y-6 lg:col-span-2">
          {/* Extract from Domain - Only show when creating new */}
          {isNew && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Quick Start
                </CardTitle>
                <CardDescription>
                  Extract brand colors and fonts automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Globe className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      disabled={extractBrandKit.isPending}
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
                    disabled={
                      !extractDomain.trim() || extractBrandKit.isPending
                    }
                    onClick={handleExtractFromDomain}
                    variant="secondary"
                  >
                    {extractBrandKit.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Extracting...
                      </>
                    ) : (
                      "Extract"
                    )}
                  </Button>
                </div>

                {reactEmailTemplates && reactEmailTemplates.length > 0 && (
                  <>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="bg-card px-2 text-muted-foreground">
                          or
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Select
                          onValueChange={setSelectedTemplateId}
                          value={selectedTemplateId}
                        >
                          <SelectTrigger className="w-full">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <SelectValue placeholder="Select a template" />
                          </SelectTrigger>
                          <SelectContent>
                            {reactEmailTemplates.map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        disabled={
                          !selectedTemplateId || extractFromTemplate.isPending
                        }
                        onClick={handleExtractFromTemplate}
                        variant="secondary"
                      >
                        {extractFromTemplate.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Extracting...
                          </>
                        ) : (
                          "Extract"
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
            </CardContent>
          </Card>

          {/* Colors */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Colors</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          {/* Typography */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Typography</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          {/* Button Styles */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Button Styles</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          {/* Company Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company Information</CardTitle>
              <CardDescription>
                This information will appear in email footers for CAN-SPAM
                compliance.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                    setFormData({ ...formData, companyAddress: e.target.value })
                  }
                  placeholder="123 Main St, City, State 12345"
                  rows={2}
                  value={formData.companyAddress}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview sidebar */}
        <div className="lg:col-span-1">
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle className="text-base">Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Color palette */}
              <div className="mb-4">
                <p className="mb-2 text-muted-foreground text-xs">
                  Color Palette
                </p>
                <div className="flex gap-1">
                  <div
                    className="h-12 flex-1 rounded-l-md border"
                    style={{ backgroundColor: formData.primaryColor }}
                  />
                  <div
                    className="h-12 flex-1 border-y"
                    style={{ backgroundColor: formData.secondaryColor }}
                  />
                  <div
                    className="h-12 flex-1 border-y"
                    style={{ backgroundColor: formData.backgroundColor }}
                  />
                  <div
                    className="h-12 flex-1 rounded-r-md border"
                    style={{ backgroundColor: formData.textColor }}
                  />
                </div>
              </div>

              {/* Logo preview */}
              {formData.logoUrl && (
                <div className="mb-4">
                  <p className="mb-2 text-muted-foreground text-xs">Logo</p>
                  <div className="flex h-16 items-center justify-center rounded border bg-muted/30 p-2">
                    <img
                      alt="Logo preview"
                      className="max-h-full max-w-full object-contain"
                      src={formData.logoUrl}
                    />
                  </div>
                </div>
              )}

              {/* Typography preview */}
              <div className="mb-4">
                <p className="mb-2 text-muted-foreground text-xs">Typography</p>
                <div
                  className="rounded border p-3"
                  style={{
                    backgroundColor: formData.backgroundColor,
                    color: formData.textColor,
                  }}
                >
                  <h3
                    className="mb-1 font-semibold"
                    style={{
                      fontFamily:
                        formData.headingFontFamily || formData.fontFamily,
                    }}
                  >
                    Heading Text
                  </h3>
                  <p
                    className="text-sm"
                    style={{ fontFamily: formData.fontFamily }}
                  >
                    Body text preview with your selected font.
                  </p>
                </div>
              </div>

              {/* Button preview */}
              <div>
                <p className="mb-2 text-muted-foreground text-xs">Button</p>
                {/* White label on the kit's own primary color, as the email renders it */}
                <button
                  className="w-full px-4 py-2 font-medium text-white" // baseline:allow-ratchet-white-black-web baseline:allow-ratchet-theme-tokens-web baseline:allow-ratchet-dark-mode-web
                  style={{
                    backgroundColor: formData.primaryColor,
                    borderRadius:
                      formData.buttonStyle === "pill"
                        ? "9999px"
                        : formData.buttonStyle === "square"
                          ? "0"
                          : formData.buttonRadius,
                    fontFamily: formData.fontFamily,
                  }}
                  type="button"
                >
                  Button Preview
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
