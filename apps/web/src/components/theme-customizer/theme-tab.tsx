"use client";

import { Dices, ExternalLink, Moon, Palette, Sun, Upload } from "lucide-react";
import type React from "react";
import { ColorPicker } from "@/components/color-picker";
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
import { baseColors, radiusOptions } from "@/config/theme-customizer-constants";
import { colorThemes, tweakcnThemes } from "@/config/theme-data";
import { useCircularTransition } from "@/hooks/use-circular-transition";
import { useThemeManager } from "@/hooks/use-theme-manager";
import type { ImportedTheme } from "@/types/theme-customizer";
import "./circular-transition.css";

type ThemeTabProps = {
  selectedTheme: string;
  setSelectedTheme: (theme: string) => void;
  selectedTweakcnTheme: string;
  setSelectedTweakcnTheme: (theme: string) => void;
  selectedRadius: string;
  setSelectedRadius: (radius: string) => void;
  setImportedTheme: (theme: ImportedTheme | null) => void;
  onImportClick: () => void;
};

export function ThemeTab({
  selectedTheme,
  setSelectedTheme,
  selectedTweakcnTheme,
  setSelectedTweakcnTheme,
  selectedRadius,
  setSelectedRadius,
  setImportedTheme,
  onImportClick,
}: ThemeTabProps) {
  const {
    isDarkMode,
    brandColorsValues,
    setBrandColorsValues,
    applyTheme,
    applyTweakcnTheme,
    applyRadius,
    handleColorChange,
  } = useThemeManager();

  const { toggleTheme } = useCircularTransition();

  const handleRandomShadcn = () => {
    // Apply a random shadcn theme
    const randomTheme =
      colorThemes[Math.floor(Math.random() * colorThemes.length)];
    setSelectedTheme(randomTheme.value);
    setSelectedTweakcnTheme(""); // Clear tweakcn selection
    setBrandColorsValues({}); // Clear brand colors state
    setImportedTheme(null); // Clear imported theme
    applyTheme(randomTheme.value, isDarkMode);
  };

  const handleRandomTweakcn = () => {
    // Apply a random tweakcn theme
    const randomTheme =
      tweakcnThemes[Math.floor(Math.random() * tweakcnThemes.length)];
    setSelectedTweakcnTheme(randomTheme.value);
    setSelectedTheme(""); // Clear shadcn selection
    setBrandColorsValues({}); // Clear brand colors state
    setImportedTheme(null); // Clear imported theme
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

  return (
    <div className="space-y-6 p-4">
      {/* Shadcn UI Theme Presets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="font-medium text-sm">Shadcn UI Theme Presets</Label>
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
            setSelectedTweakcnTheme(""); // Clear tweakcn selection
            setBrandColorsValues({}); // Clear brand colors state
            setImportedTheme(null); // Clear imported theme
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
                          backgroundColor: theme.preset.styles.light.primary,
                        }}
                      />
                      <div
                        className="h-3 w-3 rounded-full border border-border/20"
                        style={{
                          backgroundColor: theme.preset.styles.light.secondary,
                        }}
                      />
                      <div
                        className="h-3 w-3 rounded-full border border-border/20"
                        style={{
                          backgroundColor: theme.preset.styles.light.accent,
                        }}
                      />
                      <div
                        className="h-3 w-3 rounded-full border border-border/20"
                        style={{
                          backgroundColor: theme.preset.styles.light.muted,
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
          <Label className="font-medium text-sm">Tweakcn Theme Presets</Label>
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
            setSelectedTheme(""); // Clear shadcn selection
            setBrandColorsValues({}); // Clear brand colors state
            setImportedTheme(null); // Clear imported theme
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
                          backgroundColor: theme.preset.styles.light.primary,
                        }}
                      />
                      <div
                        className="h-3 w-3 rounded-full border border-border/20"
                        style={{
                          backgroundColor: theme.preset.styles.light.secondary,
                        }}
                      />
                      <div
                        className="h-3 w-3 rounded-full border border-border/20"
                        style={{
                          backgroundColor: theme.preset.styles.light.accent,
                        }}
                      />
                      <div
                        className="h-3 w-3 rounded-full border border-border/20"
                        style={{
                          backgroundColor: theme.preset.styles.light.muted,
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

      {/* Mode Section */}
      <div className="space-y-3">
        <Label className="font-medium text-sm">Mode</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="cursor-pointer"
            onClick={handleLightMode}
            size="sm"
            variant={isDarkMode ? "outline" : "secondary"}
          >
            <Sun className="mr-1 h-4 w-4" />
            Light
          </Button>
          <Button
            className="cursor-pointer"
            onClick={handleDarkMode}
            size="sm"
            variant={isDarkMode ? "secondary" : "outline"}
          >
            <Moon className="mr-1 h-4 w-4" />
            Dark
          </Button>
        </div>
      </div>

      <Separator />

      {/* Import Theme Button */}
      <div className="space-y-3">
        <Button
          className="w-full cursor-pointer"
          onClick={onImportClick}
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
          <span className="font-medium text-sm">Advanced Customization</span>
        </div>
        <p className="text-muted-foreground text-xs">
          For advanced theme customization with real-time preview, visual color
          picker, and hundreds of prebuilt themes, visit{" "}
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
            typeof window !== "undefined" &&
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
  );
}
