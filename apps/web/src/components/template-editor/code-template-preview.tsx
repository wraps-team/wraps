"use client";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@wraps/ui/components/ui/toggle-group";
import { Monitor, Smartphone, Tablet } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type DeviceType = "desktop" | "tablet" | "mobile";

const deviceWidths: Record<DeviceType, number> = {
  desktop: 600,
  tablet: 480,
  mobile: 375,
};

type CodeTemplatePreviewProps = {
  html: string;
};

export function CodeTemplatePreview({ html }: CodeTemplatePreviewProps) {
  const [device, setDevice] = useState<DeviceType>("desktop");
  const [iframeHeight, setIframeHeight] = useState(600);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const adjustIframeHeight = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow?.document?.body) {
      return;
    }
    const contentHeight = iframe.contentWindow.document.body.scrollHeight;
    setIframeHeight(Math.max(contentHeight + 32, 400));
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!(iframe && html)) {
      return;
    }

    let resizeObserver: ResizeObserver | undefined;

    const handleLoad = () => {
      adjustIframeHeight();
      const body = iframe.contentWindow?.document?.body;
      if (body) {
        resizeObserver = new ResizeObserver(() => adjustIframeHeight());
        resizeObserver.observe(body);
      }
    };

    iframe.addEventListener("load", handleLoad);

    return () => {
      iframe.removeEventListener("load", handleLoad);
      resizeObserver?.disconnect();
    };
  }, [html, adjustIframeHeight]);

  return (
    <div className="flex h-full flex-col">
      {/* Preview Header */}
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Monitor className="h-4 w-4" />
          <span className="hidden sm:inline">{deviceWidths[device]}px</span>
        </div>

        <ToggleGroup
          onValueChange={(value) => value && setDevice(value as DeviceType)}
          size="sm"
          type="single"
          value={device}
          variant="outline"
        >
          <ToggleGroupItem
            aria-label="Desktop"
            className="h-8 w-8"
            value="desktop"
          >
            <Monitor className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            aria-label="Tablet"
            className="h-8 w-8"
            value="tablet"
          >
            <Tablet className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            aria-label="Mobile"
            className="h-8 w-8"
            value="mobile"
          >
            <Smartphone className="h-3.5 w-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Preview Content */}
      <div className="flex-1 overflow-auto bg-muted/50">
        <div className="flex min-h-full flex-col items-center py-6">
          {html ? (
            <>
              <div
                className="rounded-lg bg-card shadow-2xl ring-1 ring-border"
                style={{
                  width: deviceWidths[device],
                  maxWidth: "100%",
                }}
              >
                <iframe
                  className="w-full border-0 transition-[height] duration-200"
                  ref={iframeRef}
                  sandbox="allow-same-origin"
                  srcDoc={html}
                  style={{
                    height: iframeHeight,
                    minHeight: 400,
                  }}
                  title="Email preview"
                />
              </div>

              <div className="mt-4 text-center">
                <span className="text-muted-foreground text-xs">
                  {device === "desktop" && "Desktop (600px)"}
                  {device === "tablet" && "Tablet (480px)"}
                  {device === "mobile" && "Mobile (375px)"}
                </span>
              </div>
            </>
          ) : (
            <div
              className="flex items-center justify-center rounded-lg bg-card shadow-2xl ring-1 ring-border"
              style={{
                width: deviceWidths[device],
                maxWidth: "100%",
                height: 400,
              }}
            >
              <p className="text-muted-foreground text-sm">
                No preview available — use the AI assistant to generate a
                template
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
