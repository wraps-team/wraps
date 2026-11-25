"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@wraps/ui/components/ui/hover-card";
import { ArrowRight, Blocks, LayoutDashboard, Rocket } from "lucide-react";
import { assetUrl } from "@/lib/utils";

const WRAPS_URL = "https://wraps.dev";

export function UpgradeToProButton() {
  return (
    <div className="fixed right-4 bottom-8 z-50 flex flex-col items-end gap-2 md:right-6 lg:right-8">
      <HoverCard closeDelay={100} openDelay={100}>
        <HoverCardTrigger asChild>
          <Button
            className="min-w-45 cursor-pointer"
            onClick={() => window.open(WRAPS_URL, "_blank")}
            size="lg"
            variant="brand"
          >
            Upgrade to Pro
            <Rocket className="ml-1" size={30} />
          </Button>
        </HoverCardTrigger>
        <HoverCardContent className="relative mr-4 mb-3 w-90 p-3 md:mr-6 lg:mr-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <a
              className="cursor-pointer"
              href={WRAPS_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              <img
                alt="Dashboard Preview"
                className="rounded-lg border shadow-lg"
                height={300}
                src={assetUrl("hero-images-container.png")}
                width={400}
              />
            </a>
            <h3 className="flex items-center gap-2 py-2 font-bold text-lg">
              <Rocket className="text-primary" size={18} />
              Unlock Premium Blocks
              <Badge variant="destructive">Live</Badge>
            </h3>
            <p className="mb-4 text-muted-foreground text-sm">
              Get access to exclusive premium blocks and dashboards for your
              next project. Elevate your UI instantly!
            </p>
            <div className="mt-2 flex w-full flex-row justify-center gap-2">
              <div className="relative w-1/2">
                <a href={WRAPS_URL} rel="noopener noreferrer" target="_blank">
                  <Button
                    className="flex w-full cursor-pointer items-center justify-center"
                    variant="default"
                  >
                    <Blocks size={16} />
                    Pro Blocks
                    <ArrowRight size={16} />
                  </Button>
                </a>
              </div>
              <div className="relative w-1/2">
                <Button
                  className="flex w-full items-center justify-center"
                  disabled
                  variant="default"
                >
                  <LayoutDashboard size={16} />
                  Pro Dashboards
                </Button>
                <span className="-top-5 -right-1 absolute">
                  <Badge variant="warning">Coming soon</Badge>
                </span>
              </div>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}
