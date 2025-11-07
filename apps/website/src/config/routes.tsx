import { lazy } from "react";

// Lazy load components for better performance
const Landing = lazy(() => import("@/app/landing/page"));
const NotFound = lazy(() => import("@/app/errors/not-found/page"));

export interface RouteConfig {
  path: string;
  element: React.ReactNode;
  children?: RouteConfig[];
}

export const routes: RouteConfig[] = [
  // Default route - Landing page
  {
    path: "/",
    element: <Landing />,
  },

  // Catch-all route for 404
  {
    path: "*",
    element: <NotFound />,
  },
];
