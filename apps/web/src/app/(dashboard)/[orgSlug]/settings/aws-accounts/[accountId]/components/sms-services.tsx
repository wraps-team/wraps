"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import Link from "next/link";
import type { ClientAccount } from "../lib/client-account";

type SmsServicesProps = {
  orgSlug: string;
  region: string;
  features: ClientAccount["features"];
};

/** What the last scan observed about SMS in this region. */
export function SmsServices({ orgSlug, region, features }: SmsServicesProps) {
  const sms = features?.sms;
  const activeNumbers = (sms?.phoneNumbers ?? []).filter(
    (pn) => pn.status === "ACTIVE"
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>SMS · {region}</CardTitle>
        <CardDescription>
          What the last scan found in your AWS account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="space-y-3 text-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
            <dt className="text-muted-foreground sm:w-40 sm:shrink-0">
              Phone numbers
            </dt>
            <dd className="min-w-0">
              {activeNumbers} active
              {" · "}
              <Link className="underline" href={`/${orgSlug}/sms`}>
                View in SMS
              </Link>
            </dd>
          </div>
          {sms?.eventHistoryEnabled !== undefined && (
            <div className="flex flex-col gap-1 sm:flex-row sm:gap-4">
              <dt className="text-muted-foreground sm:w-40 sm:shrink-0">
                Event history
              </dt>
              <dd className="min-w-0">
                {sms.eventHistoryEnabled ? (
                  "On"
                ) : (
                  <span className="text-muted-foreground">Off</span>
                )}
              </dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
