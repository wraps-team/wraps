"use client";

import * as React from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  ThemeCustomizer,
  ThemeCustomizerTrigger,
} from "@/components/theme-customizer";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { UpgradeToProButton } from "@/components/upgrade-to-pro-button";
import { useSidebarConfig } from "@/hooks/use-sidebar-config";

type BaseLayoutProps = {
  children: React.ReactNode;
  title?: string;
  description?: string;
};

export function BaseLayout({ children, title, description }: BaseLayoutProps) {
  const [themeCustomizerOpen, setThemeCustomizerOpen] = React.useState(false);
  const { config } = useSidebarConfig();

  return (
    <SidebarProvider
      className={config.collapsible === "none" ? "sidebar-none-mode" : ""}
      style={
        {
          "--sidebar-width": "16rem",
          "--sidebar-width-icon": "3rem",
          "--header-height": "calc(var(--spacing) * 14)",
        } as React.CSSProperties
      }
    >
      {config.side === "left" ? (
        <>
          <AppSidebar
            collapsible={config.collapsible}
            side={config.side}
            variant={config.variant}
          />
          <SidebarInset>
            <SiteHeader />
            <div className="flex flex-1 flex-col">
              <div className="@container/main flex flex-1 flex-col gap-2">
                <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
                  {title && (
                    <div className="px-4 lg:px-6">
                      <div className="flex flex-col gap-2">
                        <h1 className="font-bold text-2xl tracking-tight">
                          {title}
                        </h1>
                        {description && (
                          <p className="text-muted-foreground">{description}</p>
                        )}
                      </div>
                    </div>
                  )}
                  {children}
                </div>
              </div>
            </div>
            <SiteFooter />
          </SidebarInset>
        </>
      ) : (
        <>
          <SidebarInset>
            <SiteHeader />
            <div className="flex flex-1 flex-col">
              <div className="@container/main flex flex-1 flex-col gap-2">
                <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
                  {title && (
                    <div className="px-4 lg:px-6">
                      <div className="flex flex-col gap-2">
                        <h1 className="font-bold text-2xl tracking-tight">
                          {title}
                        </h1>
                        {description && (
                          <p className="text-muted-foreground">{description}</p>
                        )}
                      </div>
                    </div>
                  )}
                  {children}
                </div>
              </div>
            </div>
            <SiteFooter />
          </SidebarInset>
          <AppSidebar
            collapsible={config.collapsible}
            side={config.side}
            variant={config.variant}
          />
        </>
      )}

      {/* Theme Customizer */}
      <ThemeCustomizerTrigger onClick={() => setThemeCustomizerOpen(true)} />
      <ThemeCustomizer
        onOpenChange={setThemeCustomizerOpen}
        open={themeCustomizerOpen}
      />
      <UpgradeToProButton />
    </SidebarProvider>
  );
}
