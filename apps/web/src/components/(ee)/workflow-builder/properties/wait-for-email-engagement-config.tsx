"use client";

import { Label } from "@wraps/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import { Input } from "@/components/ui/input";
import { amountUnitToSeconds, parseDurationToAmountUnit } from "@/lib/utils";
import type { NodeConfigProps } from "./index";

export function WaitForEmailEngagementConfig({
  config,
  onChange,
}: NodeConfigProps) {
  if (config.type !== "wait_for_email_engagement") {
    return null;
  }

  const { amount, unit } = parseDurationToAmountUnit(
    config.timeoutSeconds || 0,
    { amount: 3, unit: "days" }
  );

  const handleTimeoutChange = (newAmount: number, newUnit: string) => {
    onChange({ timeoutSeconds: amountUnitToSeconds(newAmount, newUnit) });
  };

  return (
    <>
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">
          Waits for engagement with the previous Send Email step. Routes
          contacts based on whether they opened, clicked, or if the email
          bounced.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Wait Duration</Label>
        <div className="flex gap-2">
          <Input
            className="w-20"
            min={1}
            onChange={(e) =>
              handleTimeoutChange(
                Number.parseInt(e.target.value, 10) || 1,
                unit
              )
            }
            type="number"
            value={amount}
          />
          <Select
            onValueChange={(value) => handleTimeoutChange(amount, value)}
            value={unit}
          >
            <SelectTrigger className="flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hours">Hours</SelectItem>
              <SelectItem value="days">Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-muted-foreground text-xs">
          Time to wait for engagement before following the "None" path.
        </p>
      </div>

      <div className="space-y-1 rounded-md bg-muted p-3">
        <p className="font-medium text-xs">Output Paths:</p>
        <ul className="space-y-0.5 text-muted-foreground text-xs">
          <li>
            <span className="font-medium text-success">Open</span> — Email was
            opened
          </li>
          <li>
            <span className="font-medium text-info">Click</span> — Link was
            clicked
          </li>
          <li>
            <span className="font-medium text-destructive">Bounce</span> — Email
            bounced
          </li>
          <li>
            <span className="font-medium text-warning">None</span> — No
            engagement within timeout
          </li>
        </ul>
      </div>
    </>
  );
}
