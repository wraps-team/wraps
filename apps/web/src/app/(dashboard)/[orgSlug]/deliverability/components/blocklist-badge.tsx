import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@wraps/ui/components/ui/tooltip";
import { Check, TriangleAlert } from "lucide-react";
import type { BlocklistCheck } from "../lib/sample-data";

export function BlocklistBadge({ check }: { check: BlocklistCheck }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          className="gap-1 font-mono text-[11px]"
          variant={check.listed ? "destructive" : "outline"}
        >
          {check.listed ? (
            <TriangleAlert aria-hidden="true" className="size-3" />
          ) : (
            <Check aria-hidden="true" className="size-3 text-success" />
          )}
          {check.name}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {check.listed
          ? `Listed on ${check.name} — checked ${check.checkedAt}`
          : `Clear on ${check.name} — checked ${check.checkedAt}`}
      </TooltipContent>
    </Tooltip>
  );
}
