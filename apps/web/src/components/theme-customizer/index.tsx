"use client";

import { Layout, Palette, RotateCcw, Settings, X } from "lucide-react";
import React from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tweakcnThemes } from "@/config/theme-data";
import { useSidebarConfig } from "@/contexts/sidebar-context";
import { useThemeManager } from "@/hooks/use-theme-manager";
import { cn } from "@/lib/utils";
import type { ImportedTheme } from "@/types/theme-customizer";
import { ImportModal } from "./import-modal";
import { LayoutTab } from "./layout-tab";
import { ThemeTab } from "./theme-tab";

interface ThemeCustomizerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ThemeCustomizer({ open, onOpenChange }: ThemeCustomizerProps) {
  const {
    applyImportedTheme,
    isDarkMode,
    resetTheme,
    applyRadius,
    setBrandColorsValues,
    applyTheme,
    applyTweakcnTheme,
  } = useThemeManager();
  const { config: sidebarConfig, updateConfig: updateSidebarConfig } =
    useSidebarConfig();

  const [activeTab, setActiveTab] = React.useState("theme");
  const [selectedTheme, setSelectedTheme] = React.useState("default");
  const [selectedTweakcnTheme, setSelectedTweakcnTheme] = React.useState("");
  const [selectedRadius, setSelectedRadius] = React.useState("0.5rem");
  const [importModalOpen, setImportModalOpen] = React.useState(false);
  const [importedTheme, setImportedTheme] =
    React.useState<ImportedTheme | null>(null);

  const handleReset = () => {
    // Complete reset to application defaults

    // 1. Reset all state variables to initial values
    setSelectedTheme("default");
    setSelectedTweakcnTheme("");
    setSelectedRadius("0.5rem");
    setImportedTheme(null); // Clear imported theme
    setBrandColorsValues({}); // Clear brand colors state

    // 2. Completely remove all custom CSS variables
    resetTheme();

    // 3. Reset the radius to default
    applyRadius("0.5rem");

    // 4. Reset sidebar to defaults
    updateSidebarConfig({
      variant: "inset",
      collapsible: "offcanvas",
      side: "left",
    });
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
          side={sidebarConfig.side === "left" ? "right" : "left"}
        >
          <SheetHeader className="space-y-0 p-4 pb-2">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary/10 p-2">
                <Settings className="h-4 w-4" />
              </div>
              <SheetTitle className="font-semibold text-lg">
                Customizer
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
            <SheetDescription className="sr-only text-muted-foreground text-sm">
              Customize the them and layout of your dashboard.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            <Tabs
              className="flex h-full flex-col"
              onValueChange={setActiveTab}
              value={activeTab}
            >
              <div className="py-2">
                <TabsList className="grid h-12 w-full grid-cols-2 rounded-none p-1.5">
                  <TabsTrigger
                    className="cursor-pointer data-[state=active]:bg-background"
                    value="theme"
                  >
                    <Palette className="mr-1 h-4 w-4" /> Theme
                  </TabsTrigger>
                  <TabsTrigger
                    className="cursor-pointer data-[state=active]:bg-background"
                    value="layout"
                  >
                    <Layout className="mr-1 h-4 w-4" /> Layout
                  </TabsTrigger>
                </TabsList>
                {/* <TabsList className="grid w-full grid-cols-2 rounded-none h-12 p-1.5">
                  <TabsTrigger value="theme" className="cursor-pointer data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Palette className="h-4 w-4 mr-1" /> Theme</TabsTrigger>
                  <TabsTrigger value="layout" className="cursor-pointer data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"><Layout className="h-4 w-4 mr-1" /> Layout</TabsTrigger>
                </TabsList> */}
              </div>

              <TabsContent className="mt-0 flex-1" value="theme">
                <ThemeTab
                  onImportClick={handleImportClick}
                  selectedRadius={selectedRadius}
                  selectedTheme={selectedTheme}
                  selectedTweakcnTheme={selectedTweakcnTheme}
                  setImportedTheme={setImportedTheme}
                  setSelectedRadius={setSelectedRadius}
                  setSelectedTheme={setSelectedTheme}
                  setSelectedTweakcnTheme={setSelectedTweakcnTheme}
                />
              </TabsContent>

              <TabsContent className="mt-0 flex-1" value="layout">
                <LayoutTab />
              </TabsContent>
            </Tabs>
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

// Floating trigger button - positioned dynamically based on sidebar side
export function ThemeCustomizerTrigger({ onClick }: { onClick: () => void }) {
  const { config: sidebarConfig } = useSidebarConfig();

  return (
    <Button
      className={cn(
        "-translate-y-1/2 fixed top-1/2 z-50 h-12 w-12 cursor-pointer rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90",
        sidebarConfig.side === "left" ? "right-4" : "left-4"
      )}
      onClick={onClick}
      size="icon"
    >
      <Settings className="h-5 w-5" />
    </Button>
  );
}
