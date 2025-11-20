import { lazy } from "react";

// Lazy load components for better performance
const Landing = lazy(() => import("@/app/landing/page"));
const SimpleLanding = lazy(() => import("@/app/simple-landing/page"));
const Calculator = lazy(() => import("@/app/calculator/page"));
const Docs = lazy(() => import("@/app/docs/page"));
const QuickstartDocs = lazy(() => import("@/app/docs/quickstart/page"));
const SDKReferenceDocs = lazy(() => import("@/app/docs/sdk-reference/page"));
const CLIReferenceDocs = lazy(() => import("@/app/docs/cli-reference/page"));
const Privacy = lazy(() => import("@/app/privacy/page"));
const Terms = lazy(() => import("@/app/terms/page"));
const NotFound = lazy(() => import("@/app/not-found/page"));

export type RouteConfig = {
  path: string;
  element: React.ReactNode;
  children?: RouteConfig[];
};

export const routes: RouteConfig[] = [
  // Default route - Landing page
  {
    path: "/",
    element: <Landing />,
  },

  // Simple landing page with new marketing components
  {
    path: "/simple",
    element: <SimpleLanding />,
  },

  // Cost Calculator
  {
    path: "/calculator",
    element: <Calculator />,
  },

  // Documentation
  {
    path: "/docs",
    element: <Docs />,
  },
  {
    path: "/docs/quickstart",
    element: <QuickstartDocs />,
  },
  {
    path: "/docs/sdk-reference",
    element: <SDKReferenceDocs />,
  },
  {
    path: "/docs/cli-reference",
    element: <CLIReferenceDocs />,
  },

  // Legal pages
  {
    path: "/privacy",
    element: <Privacy />,
  },
  {
    path: "/terms",
    element: <Terms />,
  },

  // Catch-all route for 404
  {
    path: "*",
    element: <NotFound />,
  },
];
