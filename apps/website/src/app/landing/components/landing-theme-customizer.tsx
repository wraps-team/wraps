"use client";

import {
  Dices,
  ExternalLink,
  Moon,
  Palette,
  RotateCcw,
  Settings,
  Sun,
  Upload,
  X,
} from "lucide-react";
import React from "react";
import { ColorPicker } from "@/components/color-picker";
import { ImportModal } from "@/components/theme-customizer/import-modal";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { baseColors, radiusOptions } from "@/config/theme-customizer-constants";
import { colorThemes, tweakcnThemes } from "@/config/theme-data";
import { useCircularTransition } from "@/hooks/use-circular-transition";
import { useThemeManager } from "@/hooks/use-theme-manager";
import { cn } from "@/lib/utils";
import type { ImportedTheme } from "@/types/theme-customizer";
import "@/components/theme-customizer/circular-transition.css";

type LandingThemeCustomizerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function LandingThemeCustomizer({
  open,
  onOpenChange,
}: LandingThemeCustomizerProps) {
  const {
    applyImportedTheme,
    isDarkMode,
    resetTheme,
    applyRadius,
    setBrandColorsValues,
    applyTheme,
    applyTweakcnTheme,
    brandColorsValues,
    handleColorChange,
  } = useThemeManager();

  const { toggleTheme } = useCircularTransition();

  const [selectedTheme, setSelectedTheme] = React.useState("default");
  const [selectedTweakcnTheme, setSelectedTweakcnTheme] = React.useState("");
  const [selectedRadius, setSelectedRadius] = React.useState("0.5rem");
  const [importModalOpen, setImportModalOpen] = React.useState(false);
  const [importedTheme, setImportedTheme] =
    React.useState<ImportedTheme | null>(null);

  const handleReset = () => {
    // Reset all state variables to initial values
    setSelectedTheme("");
    setSelectedTweakcnTheme("");
    setSelectedRadius("0.5rem");
    setImportedTheme(null);
    setBrandColorsValues({});

    // Reset theme and radius to defaults
    resetTheme();
    applyRadius("0.5rem");
  };

  const handleImport = (themeData: ImportedTheme) => {
    setImportedTheme(themeData);
    // Clear other selections to indicate custom import is active
    setSelectedTheme("");
    setSelectedTweakcnTheme("");

    // Apply the imported theme
    applyImportedTheme(themeData, isDarkMode);
  };

  const handleImportClick = () => {
    setImportModalOpen(true);
  };

  const handleRandomShadcn = () => {
    // Apply a random shadcn theme
    const randomTheme =
      colorThemes[Math.floor(Math.random() * colorThemes.length)];
    setSelectedTheme(randomTheme.value);
    setSelectedTweakcnTheme("");
    setBrandColorsValues({});
    setImportedTheme(null);
    applyTheme(randomTheme.value, isDarkMode);
  };

  const handleRandomTweakcn = () => {
    // Apply a random tweakcn theme
    const randomTheme =
      tweakcnThemes[Math.floor(Math.random() * tweakcnThemes.length)];
    setSelectedTweakcnTheme(randomTheme.value);
    setSelectedTheme("");
    setBrandColorsValues({});
    setImportedTheme(null);
    applyTweakcnTheme(randomTheme.preset, isDarkMode);
  };

  const handleRadiusSelect = (radius: string) => {
    setSelectedRadius(radius);
    applyRadius(radius);
  };

  const handleLightMode = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isDarkMode === false) {
      return;
    }
    toggleTheme(event);
  };

  const handleDarkMode = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (isDarkMode === true) {
      return;
    }
    toggleTheme(event);
  };

  // Re-apply themes when theme mode changes
  React.useEffect(() => {
    if (importedTheme) {
      applyImportedTheme(importedTheme, isDarkMode);
    } else if (selectedTheme) {
      applyTheme(selectedTheme, isDarkMode);
    } else if (selectedTweakcnTheme) {
      const selectedPreset = tweakcnThemes.find(
        (t) => t.value === selectedTweakcnTheme
      )?.preset;
      if (selectedPreset) {
        applyTweakcnTheme(selectedPreset, isDarkMode);
      }
    }
  }, [
    isDarkMode,
    importedTheme,
    selectedTheme,
    selectedTweakcnTheme,
    applyImportedTheme,
    applyTheme,
    applyTweakcnTheme,
  ]);

  return (
    <>
      <Sheet modal={false} onOpenChange={onOpenChange} open={open}>
        <SheetContent
          className="pointer-events-auto flex w-[400px] flex-col gap-0 overflow-hidden p-0 [&>button]:hidden"
          onInteractOutside={(e) => {
            // Prevent the sheet from closing when dialog is open
            if (importModalOpen) {
              e.preventDefault();
            }
          }}
          side="right"
        >
          <SheetHeader className="space-y-0 p-4 pb-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2">
                <Settings className="h-4 w-4" />
              </div>
              <SheetTitle className="font-semibold text-lg">
                Theme Customizer
              </SheetTitle>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  className="h-8 w-8 cursor-pointer"
                  onClick={handleReset}
                  size="icon"
                  variant="outline"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
                <Button
                  className="h-8 w-8 cursor-pointer"
                  onClick={() => onOpenChange(false)}
                  size="icon"
                  variant="outline"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <SheetDescription className="text-muted-foreground text-sm">
              Customize the theme and colors of your landing page.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-6 overflow-y-auto p-4">
            {/* Mode Section */}
            <div className="space-y-3">
              <Label className="font-medium text-sm">Mode</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  className="mode-toggle-button relative cursor-pointer overflow-hidden"
                  onClick={handleLightMode}
                  size="sm"
                  variant={isDarkMode ? "outline" : "secondary"}
                >
                  <Sun className="mr-1 h-4 w-4 transition-transform duration-300" />
                  Light
                </Button>
                <Button
                  className="mode-toggle-button relative cursor-pointer overflow-hidden"
                  onClick={handleDarkMode}
                  size="sm"
                  variant={isDarkMode ? "secondary" : "outline"}
                >
                  <Moon className="mr-1 h-4 w-4 transition-transform duration-300" />
                  Dark
                </Button>
              </div>
            </div>

            <Separator />

            {/* Shadcn UI Theme Presets */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-medium text-sm">
                  Shadcn UI Theme Presets
                </Label>
                <Button
                  className="cursor-pointer"
                  onClick={handleRandomShadcn}
                  size="sm"
                  variant="outline"
                >
                  <Dices className="mr-1.5 h-3.5 w-3.5" />
                  Random
                </Button>
              </div>

              <Select
                onValueChange={(value) => {
                  setSelectedTheme(value);
                  setSelectedTweakcnTheme("");
                  setBrandColorsValues({});
                  setImportedTheme(null);
                  applyTheme(value, isDarkMode);
                }}
                value={selectedTheme}
              >
                <SelectTrigger className="w-full cursor-pointer">
                  <SelectValue placeholder="Choose Shadcn Theme" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <div className="p-2">
                    {colorThemes.map((theme) => (
                      <SelectItem
                        className="cursor-pointer"
                        key={theme.value}
                        value={theme.value}
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <div
                              className="h-3 w-3 rounded-full border border-border/20"
                              style={{
                                backgroundColor:
                                  theme.preset.styles.light.primary,
                              }}
                            />
                            <div
                              className="h-3 w-3 rounded-full border border-border/20"
                              style={{
                                backgroundColor:
                                  theme.preset.styles.light.secondary,
                              }}
                            />
                            <div
                              className="h-3 w-3 rounded-full border border-border/20"
                              style={{
                                backgroundColor:
                                  theme.preset.styles.light.accent,
                              }}
                            />
                            <div
                              className="h-3 w-3 rounded-full border border-border/20"
                              style={{
                                backgroundColor:
                                  theme.preset.styles.light.muted,
                              }}
                            />
                          </div>
                          <span>{theme.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </div>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Tweakcn Theme Presets */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-medium text-sm">
                  Tweakcn Theme Presets
                </Label>
                <Button
                  className="cursor-pointer"
                  onClick={handleRandomTweakcn}
                  size="sm"
                  variant="outline"
                >
                  <Dices className="mr-1.5 h-3.5 w-3.5" />
                  Random
                </Button>
              </div>

              <Select
                onValueChange={(value) => {
                  setSelectedTweakcnTheme(value);
                  setSelectedTheme("");
                  setBrandColorsValues({});
                  setImportedTheme(null);
                  const selectedPreset = tweakcnThemes.find(
                    (t) => t.value === value
                  )?.preset;
                  if (selectedPreset) {
                    applyTweakcnTheme(selectedPreset, isDarkMode);
                  }
                }}
                value={selectedTweakcnTheme}
              >
                <SelectTrigger className="w-full cursor-pointer">
                  <SelectValue placeholder="Choose Tweakcn Theme" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <div className="p-2">
                    {tweakcnThemes.map((theme) => (
                      <SelectItem
                        className="cursor-pointer"
                        key={theme.value}
                        value={theme.value}
                      >
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            <div
                              className="h-3 w-3 rounded-full border border-border/20"
                              style={{
                                backgroundColor:
                                  theme.preset.styles.light.primary,
                              }}
                            />
                            <div
                              className="h-3 w-3 rounded-full border border-border/20"
                              style={{
                                backgroundColor:
                                  theme.preset.styles.light.secondary,
                              }}
                            />
                            <div
                              className="h-3 w-3 rounded-full border border-border/20"
                              style={{
                                backgroundColor:
                                  theme.preset.styles.light.accent,
                              }}
                            />
                            <div
                              className="h-3 w-3 rounded-full border border-border/20"
                              style={{
                                backgroundColor:
                                  theme.preset.styles.light.muted,
                              }}
                            />
                          </div>
                          <span>{theme.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </div>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Radius Selection */}
            <div className="space-y-3">
              <Label className="font-medium text-sm">Radius</Label>
              <div className="grid grid-cols-5 gap-2">
                {radiusOptions.map((option) => (
                  <div
                    className={`relative cursor-pointer rounded-md border p-3 transition-colors ${
                      selectedRadius === option.value
                        ? "border-primary"
                        : "border-border hover:border-border/60"
                    }`}
                    key={option.value}
                    onClick={() => handleRadiusSelect(option.value)}
                  >
                    <div className="text-center">
                      <div className="font-medium text-xs">{option.name}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Import Theme Button */}
            <div className="space-y-3">
              <Button
                className="w-full cursor-pointer"
                onClick={handleImportClick}
                size="lg"
                variant="outline"
              >
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Import Theme
              </Button>
            </div>

            {/* Brand Colors Section */}
            <Accordion
              className="w-full rounded-lg border-b"
              collapsible
              type="single"
            >
              <AccordionItem
                className="overflow-hidden rounded-lg border border-border"
                value="brand-colors"
              >
                <AccordionTrigger className="px-4 py-3 transition-colors hover:bg-muted/50 hover:no-underline">
                  <Label className="cursor-pointer font-medium text-sm">
                    Brand Colors
                  </Label>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 border-border border-t bg-muted/20 px-4 pt-2 pb-4">
                  {baseColors.map((color) => (
                    <div
                      className="flex items-center justify-between"
                      key={color.cssVar}
                    >
                      <ColorPicker
                        cssVar={color.cssVar}
                        label={color.name}
                        onChange={handleColorChange}
                        value={brandColorsValues[color.cssVar] || ""}
                      />
                    </div>
                  ))}
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {/* Tweakcn */}
            <div className="space-y-3 rounded-lg bg-muted p-4">
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">
                  Advanced Customization
                </span>
              </div>
              <p className="text-muted-foreground text-xs">
                For advanced theme customization with real-time preview, visual
                color picker, and hundreds of prebuilt themes, visit{" "}
                <a
                  className="cursor-pointer font-medium text-primary hover:underline"
                  href="https://tweakcn.com/editor/theme"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  tweakcn.com
                </a>
              </p>
              <Button
                className="w-full cursor-pointer"
                onClick={() =>
                  window.open("https://tweakcn.com/editor/theme", "_blank")
                }
                size="sm"
                variant="outline"
              >
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Open Tweakcn
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ImportModal
        onImport={handleImport}
        onOpenChange={setImportModalOpen}
        open={importModalOpen}
      />
    </>
  );
}

// Floating trigger button for landing page
export function LandingThemeCustomizerTrigger({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Button
      className={cn(
        "-translate-y-1/2 fixed top-1/2 right-4 z-50 h-12 w-12 cursor-pointer rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
      )}
      onClick={onClick}
      size="icon"
    >
      <Settings className="h-5 w-5" />
    </Button>
  );
}
