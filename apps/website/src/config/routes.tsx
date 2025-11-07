import { lazy } from "react";

// Lazy load components for better performance
const Landing = lazy(() => import("@/app/landing/page"));
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

  // Catch-all route for 404
  {
    path: "*",
    element: <NotFound />,
  },
];
