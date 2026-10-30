"use client";

import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import { X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";

/**
 * A compact default panel in the sidebar. The close control sits in the
 * panel's actions slot, top right, where the card's close button was.
 */
export function SidebarNotification() {
  const [isVisible, setIsVisible] = React.useState(true);

  if (!isVisible) {
    return null;
  }

  return (
    <Panel
      actions={
        <Button
          className="h-6 w-6"
          onClick={() => setIsVisible(false)}
          size="sm"
          variant="ghost"
        >
          <X className="h-3 w-3" />
          <span className="sr-only">Close notification</span>
        </Button>
      }
      className="mb-3"
      label={
        <PanelTitle level={3}>
          <a
            className="text-primary hover:underline"
            href="https://wraps.dev"
            rel="noopener noreferrer"
            target="_blank"
          >
            Wraps
          </a>{" "}
          Updates
        </PanelTitle>
      }
    >
      <div className="flex items-start gap-3">
        <Logo className="mt-0.5" size={24} />
        <p className="text-muted-foreground text-sm leading-relaxed">
          {/* Link to docs */}
          <a
            className="text-primary underline"
            href="https://wraps.dev/docs"
            rel="noopener noreferrer"
            target="_blank"
          >
            Docs
          </a>{" "}
          to get started.
        </p>
      </div>
    </Panel>
  );
}
