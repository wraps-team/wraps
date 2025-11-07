"use client";

import { Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { type RouteConfig, routes } from "@/config/routes";

function renderRoutes(routeConfigs: RouteConfig[]) {
  return routeConfigs.map((route, index) => (
    <Route
      element={
        <Suspense fallback={<LoadingSpinner />}>{route.element}</Suspense>
      }
      key={route.path + index}
      path={route.path}
    >
      {route.children && renderRoutes(route.children)}
    </Route>
  ));
}

export function AppRouter() {
  return <Routes>{renderRoutes(routes)}</Routes>;
}
