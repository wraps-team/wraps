import * as React from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AggregateDashboard } from "@/components/AggregateDashboard";
import { AppSidebar } from "@/components/app-sidebar";
import { EmailDetail } from "@/components/EmailDetail";
import { EmailLogs } from "@/components/EmailLogs";
import { EmailMetrics } from "@/components/EmailMetrics";
import { EmailSettings } from "@/components/EmailSettings";
import { ThemeProvider } from "@/components/theme-provider";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

function AppContent() {
  const location = useLocation();

  // Extract and store auth token from URL params on mount
  React.useEffect(() => {
    let token = sessionStorage.getItem("wraps-auth-token");

    if (!token) {
      const params = new URLSearchParams(window.location.search);
      token = params.get("token");

      if (token) {
        sessionStorage.setItem("wraps-auth-token", token);
      }
    }
  }, []);

  // Clear sidebar cookie on mount to ensure it starts expanded
  React.useEffect(() => {
    document.cookie = "sidebar_state=; path=/; max-age=0";
  }, []);

  const getBreadcrumb = () => {
    // Handle dynamic email detail route
    if (
      location.pathname.startsWith("/email/") &&
      location.pathname !== "/email/metrics" &&
      location.pathname !== "/email/settings"
    ) {
      return "Email Details";
    }

    switch (location.pathname) {
      case "/":
        return "Dashboard";
      case "/email":
        return "Emails";
      case "/email/metrics":
        return "Email Metrics";
      case "/email/settings":
        return "Email Settings";
      default:
        return "Dashboard";
    }
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 flex shrink-0 items-center gap-2 border-b bg-background p-4">
          <SidebarTrigger className="-ml-1" />
          <Separator
            className="mr-2 data-[orientation=vertical]:h-4"
            orientation="vertical"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>{getBreadcrumb()}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-6">
          <Routes>
            <Route element={<AggregateDashboard />} path="/" />
            <Route element={<EmailLogs />} path="/email" />
            <Route element={<EmailDetail />} path="/email/:id" />
            <Route element={<EmailMetrics />} path="/email/metrics" />
            <Route element={<EmailSettings />} path="/email/settings" />
          </Routes>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default function Page() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="console-ui-theme">
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </ThemeProvider>
  );
}
