"use client";

import { ArrowRight, Blocks, LayoutDashboard, Rocket } from "lucide-react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

const SHADCN_BLOCKS_URL = "https://shadcnstore.com/blocks";

export function UpgradeToProButton() {
  return (
    <div className="fixed right-4 bottom-8 z-50 flex flex-col items-end gap-2 md:right-6 lg:right-8">
      <HoverCard closeDelay={100} openDelay={100}>
        <HoverCardTrigger asChild>
          <Button
            className="cursor-pointer bg-gradient-to-br from-slate-900 to-slate-400 px-6 py-3 font-bold text-white shadow-lg"
            onClick={() =>
              typeof window !== "undefined" &&
              window.open(SHADCN_BLOCKS_URL, "_blank")
            }
            size="lg"
            style={{ minWidth: 180 }}
          >
            Upgrade to Pro
            <Rocket className="ml-1" size={30} />
          </Button>
        </HoverCardTrigger>
        <HoverCardContent className="fade-in slide-in-from-bottom-4 relative mr-4 mb-3 w-90 animate-in rounded-xl border border-border bg-background p-3 shadow-2xl md:mr-6 lg:mr-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <a
              className="cursor-pointer"
              href={SHADCN_BLOCKS_URL}
              rel="noopener noreferrer"
              target="_blank"
            >
              <Image
                alt="shadcn"
                height={200}
                src="/hero-images-container.png"
                width={300}
              />
            </a>
            <h3 className="flex items-center gap-2 py-2 font-bold text-lg">
              <Rocket className="text-primary" size={18} />
              Unlock Premium Blocks
              <Badge
                className="rounded-full px-2 py-0.5 text-xs shadow"
                variant="destructive"
              >
                Live
              </Badge>
            </h3>
            <p className="mb-4 text-muted-foreground text-sm">
              Get access to exclusive premium blocks and dashboards for your
              next project. Elevate your UI instantly!
            </p>
            <div className="mt-2 flex w-full flex-row justify-center gap-2">
              <div className="relative w-1/2">
                <a
                  href={SHADCN_BLOCKS_URL}
                  rel="noopener noreferrer"
                  target="_blank"
                >
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
                  <Badge
                    className="rounded-full border-yellow-400 bg-yellow-400 px-2 py-0.5 text-xs text-yellow-900 shadow"
                    variant="outline"
                  >
                    Coming soon
                  </Badge>
                </span>
              </div>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}
