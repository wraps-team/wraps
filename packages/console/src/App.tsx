import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppSidebar } from "@/components/app-sidebar";
import { Dashboard } from "@/components/Dashboard";
import { EmailLogs } from "@/components/EmailLogs";
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

  const getBreadcrumb = () => {
    switch (location.pathname) {
      case "/":
        return "Dashboard";
      case "/emails":
        return "Email Logs";
      default:
        return "Dashboard";
    }
  };

  return (
    <SidebarProvider>
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
        <Routes>
          <Route element={<Dashboard />} path="/" />
          <Route element={<EmailLogs />} path="/emails" />
        </Routes>
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
