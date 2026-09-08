"use client";

import { useState, useTransition } from "react";
import { registerMarketplaceContact } from "@/actions/marketplace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RegisterForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <p className="font-medium text-foreground text-sm">
          You&apos;re registered.
        </p>
        <p className="mt-1 text-muted-foreground text-sm">
          We have your details and AWS is confirming the subscription. If you
          have not heard from us within one business day, email{" "}
          <a href="mailto:support@wraps.dev">support@wraps.dev</a> and we will
          pick it up.
        </p>
      </div>
    );
  }

  return (
    <form
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await registerMarketplaceContact(formData);
          if (result.ok) {
            setDone(true);
          } else {
            setError(result.error);
          }
        });
      }}
      className="space-y-3"
    >
      <div className="space-y-2">
        <label className="font-medium text-foreground text-sm" htmlFor="email">
          Work email
        </label>
        <Input
          autoComplete="email"
          id="email"
          name="email"
          placeholder="you@company.com"
          required
          type="email"
        />
        <p className="text-muted-foreground text-xs">
          We use this to reach you about your subscription. Nothing else.
        </p>
      </div>

      {error ? (
        <p aria-live="polite" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <Button className="w-full" disabled={pending} type="submit">
        {pending ? "Registering..." : "Continue"}
      </Button>
    </form>
  );
}
