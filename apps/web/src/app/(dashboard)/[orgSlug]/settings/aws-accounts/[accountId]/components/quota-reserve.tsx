"use client";

import { Alert, AlertDescription } from "@wraps/ui/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Label } from "@wraps/ui/components/ui/label";
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { saveDailyQuotaReserveAction } from "@/actions/aws-accounts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ClientAccount } from "../lib/client-account";

type QuotaReserveProps = {
  account: ClientAccount;
  region: string;
};

export function QuotaReserve({ account, region }: QuotaReserveProps) {
  const [reserveInput, setReserveInput] = useState(
    account.dailyQuotaReserve != null ? String(account.dailyQuotaReserve) : ""
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const trimmed = reserveInput.trim();
    const reserve = trimmed === "" ? null : Number(trimmed);

    if (reserve !== null && (!Number.isInteger(reserve) || reserve < 0)) {
      setIsLoading(false);
      setError("Enter a whole, non-negative number of emails per day.");
      return;
    }

    const result = await saveDailyQuotaReserveAction(
      account.id,
      reserve,
      account.organizationId
    );

    setIsLoading(false);

    if (result.success) {
      setSuccess(result.message);
    } else {
      setError(result.error);
    }
  };

  return (
    <Card id="quota-reserve">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Daily quota reserve · {region}
        </CardTitle>
        <CardDescription>
          Broadcasts will never use this many emails of your daily SES quota,
          keeping them available for transactional sending. A broadcast that
          runs out of headroom pauses and resumes on its own as quota frees up.
          Only an audience too large to ever fit in a day is blocked outright.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {success && (
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-success" />
            <div className="col-start-2 grid justify-items-start gap-1 text-sm text-success [&_p]:leading-relaxed">
              {success}
            </div>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="dailyQuotaReserve">Emails per day</Label>
          <Input
            id="dailyQuotaReserve"
            inputMode="numeric"
            min={0}
            onChange={(e) => setReserveInput(e.target.value)}
            placeholder="No reserve (broadcasts can use full quota)"
            type="number"
            value={reserveInput}
          />
          <p className="text-muted-foreground text-xs">
            Leave empty to disable. Example: if you use 40,000 emails/day for
            transactional traffic, set this to 40,000 to keep it protected.
          </p>
        </div>

        <Button disabled={isLoading} onClick={handleSave} size="sm">
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="mr-2 h-4 w-4" />
          )}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
