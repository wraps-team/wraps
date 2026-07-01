"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Progress } from "@wraps/ui/components/ui/progress";
import { Separator } from "@wraps/ui/components/ui/separator";
import { cn } from "@wraps/ui/lib/utils";
import { Layers, Network, ShieldCheck, Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DedicatedIp, IpPool } from "../lib/sample-data";
import { ipPools } from "../lib/sample-data";
import { BlocklistBadge } from "./blocklist-badge";
import { StatusBadge } from "./status-badge";
import { WarmupCurve } from "./warmup-curve";

export function IpPoolsConsole() {
  return (
    <div className="space-y-6">
      {/* Differentiator callout */}
      <div className="flex items-start gap-3 rounded-xl border border-brand/40 bg-brand/5 p-4">
        <Waypoints
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-brand"
        />
        <div>
          <p className="font-medium text-sm">
            Traffic is segmented across dedicated pools
          </p>
          <p className="max-w-3xl text-muted-foreground text-sm">
            Transactional and marketing send from separate dedicated IPs, so a
            marketing complaint spike can never poison password-reset
            deliverability. This IP-pool topology is yours to control — a managed
            provider like Resend owns the IPs and can never show you this.
          </p>
        </div>
      </div>

      {ipPools.map((pool) => (
        <PoolCard key={pool.id} pool={pool} />
      ))}

      {/* Empty-state teaser for adding a pool */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Layers className="size-5" />
          </span>
          <div className="space-y-1">
            <p className="font-medium">Add a dedicated IP pool</p>
            <p className="max-w-md text-muted-foreground text-sm">
              Isolate a new message type — e.g. a separate pool for a high-volume
              product launch — with its own warmup schedule and configuration
              set.
            </p>
          </div>
          <Button className="bg-brand text-brand-foreground hover:bg-brand/90">
            <Network className="size-4" />
            Provision IP pool
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PoolCard({ pool }: { pool: IpPool }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Network className="size-4 text-muted-foreground" />
              {pool.name} pool
            </CardTitle>
            <CardDescription>{pool.messageType}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="gap-1 font-mono text-[11px]" variant="secondary">
              <ShieldCheck className="size-3" />
              {pool.configurationSet}
            </Badge>
            <Badge className="font-mono text-[11px]" variant="outline">
              {pool.volume24h.toLocaleString()} / 24h
            </Badge>
          </div>
        </div>
        <p className="mt-1 rounded-lg bg-muted/50 p-2.5 text-muted-foreground text-xs leading-relaxed">
          {pool.description}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {pool.ips.map((ip) => (
          <IpRow ip={ip} key={ip.address} />
        ))}
      </CardContent>
    </Card>
  );
}

function IpRow({ ip }: { ip: DedicatedIp }) {
  const warming = ip.warmupDay < ip.warmupTotal;
  const capPct = Math.round((ip.sentToday / ip.dailyCap) * 100);
  const listed = ip.blocklists.some((b) => b.listed);

  return (
    <div className="rounded-xl border p-4">
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        {/* Left: identity + stats */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold text-sm">
                {ip.address}
              </span>
              <StatusBadge status={ip.status} />
            </div>
            <span className="text-muted-foreground text-xs">
              PTR <span className="font-mono">{ip.reverseDns}</span>
            </span>
          </div>

          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">Reputation</dt>
              <dd className="font-mono font-semibold tabular-nums">
                {ip.reputation}
                <span className="text-muted-foreground text-xs">/100</span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Warmup</dt>
              <dd className="font-mono font-semibold tabular-nums">
                {warming ? `Day ${ip.warmupDay}/${ip.warmupTotal}` : "Complete"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">Daily cap</dt>
              <dd className="font-mono font-semibold tabular-nums">
                {ip.dailyCap.toLocaleString()}
              </dd>
            </div>
          </dl>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Sent today vs today&apos;s cap
              </span>
              <span className="font-mono tabular-nums">
                {ip.sentToday.toLocaleString()} / {ip.dailyCap.toLocaleString()}{" "}
                ({capPct}%)
              </span>
            </div>
            <Progress
              indicatorClassName={cn(
                capPct >= 90 ? "bg-warning" : warming ? "bg-brand" : "bg-success"
              )}
              value={capPct}
            />
          </div>

          <Separator />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs">Blocklists</span>
            {ip.blocklists.map((b) => (
              <BlocklistBadge check={b} key={b.name} />
            ))}
            {listed ? (
              <Button
                className="ml-auto h-7 border-destructive/40 px-2 text-destructive text-xs hover:bg-destructive/10 hover:text-destructive"
                size="sm"
                variant="outline"
              >
                Request delisting
              </Button>
            ) : null}
          </div>
        </div>

        {/* Right: warmup curve */}
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium text-xs">Warmup curve</span>
            <span className="text-muted-foreground text-xs">
              {warming
                ? `${ip.warmupTotal - ip.warmupDay} days to full volume`
                : "At full sending volume"}
            </span>
          </div>
          <WarmupCurve currentDay={ip.warmupDay} data={ip.warmup} />
        </div>
      </div>
    </div>
  );
}
