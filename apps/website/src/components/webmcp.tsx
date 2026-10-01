"use client";

import { useEffect } from "react";
import { type WebMcpTool, webMcpTools } from "@/lib/webmcp-tools";

type ModelContext = {
  registerTool: (
    tool: WebMcpTool,
    options?: { signal?: AbortSignal }
  ) => Promise<unknown>;
};

declare global {
  // biome-ignore lint/style/useConsistentTypeDefinitions: interface augmentation required for Document merging
  interface Document {
    modelContext?: ModelContext;
  }
}

export function WebMCP() {
  useEffect(() => {
    const modelContext = document.modelContext;
    if (!modelContext) {
      return;
    }

    const controller = new AbortController();

    for (const tool of webMcpTools()) {
      // registerTool rejects with NotAllowedError when a Permissions-Policy
      // header or an iframe allow attribute disables the `tools` permission.
      // An unhandled rejection there would surface as a console error on every
      // such page, so each registration swallows its own failure.
      modelContext
        .registerTool(tool, { signal: controller.signal })
        .catch(() => {
          // Registration refused by policy — the page works without it.
        });
    }

    return () => controller.abort();
  }, []);

  return null;
}
