"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type EventTimelineProps = {
  children: React.ReactNode;
  eventCount: number;
};

export function EventTimeline({ children, eventCount }: EventTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Email Events
              <span className="font-normal text-base text-muted-foreground">
                ({eventCount})
              </span>
            </CardTitle>
            <CardDescription>
              Lifecycle of this email from send to delivery
            </CardDescription>
          </div>
          <Button
            className="gap-2"
            onClick={() => setIsExpanded(!isExpanded)}
            size="sm"
            variant="ghost"
          >
            {isExpanded ? (
              <>
                <ChevronDown className="h-4 w-4" />
                Collapse
              </>
            ) : (
              <>
                <ChevronRight className="h-4 w-4" />
                View Details
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="slide-in-from-top-2 animate-in duration-200">
          <div className="space-y-4">{children}</div>
        </CardContent>
      )}
    </Card>
  );
}
