"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Label } from "@wraps/ui/components/ui/label";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { createOrganizationAction } from "@/actions/organizations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient, useSession } from "@/lib/auth-client";
import { generateSlug } from "@/lib/utils/slug";

type PageState =
  | "enter-code"
  | "verifying"
  | "approve"
  | "create-org"
  | "success";

function formatCode(value: string): string {
  const clean = value
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8);
  if (clean.length > 4) {
    return `${clean.slice(0, 4)}-${clean.slice(4)}`;
  }
  return clean;
}

function getRawCode(formatted: string): string {
  return formatted.replace(/-/g, "");
}

function DeviceFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending: sessionPending } = useSession();

  const prefilled = searchParams.get("user_code") || "";
  const [code, setCode] = useState(() => formatCode(prefilled));
  const [validatedCode, setValidatedCode] = useState("");
  const [state, setState] = useState<PageState>(
    prefilled ? "verifying" : "enter-code"
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Org creation state
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [autoSlug, setAutoSlug] = useState(true);
  const [createdOrgName, setCreatedOrgName] = useState("");

  // If not logged in, redirect to auth page with callback
  useEffect(() => {
    if (sessionPending) {
      return;
    }
    if (!session?.user) {
      const raw = getRawCode(code);
      const callbackUrl = raw ? `/device?user_code=${raw}` : "/device";
      router.replace(
        `/auth?mode=signup&redirect=${encodeURIComponent(callbackUrl)}`
      );
    }
  }, [session, sessionPending, router, code]);

  const verifyCode = useCallback(async (rawCode: string) => {
    try {
      const { data, error: verifyError } = await authClient.device({
        query: { user_code: rawCode },
      });

      if (verifyError) {
        setError("Invalid or expired code. Please try again.");
        setState("enter-code");
        return;
      }

      if (data?.status === "pending") {
        setValidatedCode(rawCode);
        setState("approve");
      } else {
        setError("This code has already been used or expired.");
        setState("enter-code");
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setState("enter-code");
    }
  }, []);

  // Auto-verify prefilled code
  useEffect(() => {
    if (state === "verifying" && session?.user && prefilled) {
      const raw = getRawCode(formatCode(prefilled));
      if (raw.length === 8) {
        verifyCode(raw);
      } else {
        setState("enter-code");
      }
    }
  }, [state, session, prefilled, verifyCode]);

  const handleCodeChange = (value: string) => {
    setCode(formatCode(value));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const rawCode = getRawCode(code);
    if (rawCode.length !== 8) {
      setError("Please enter a valid 8-character code.");
      return;
    }

    setIsSubmitting(true);
    await verifyCode(rawCode);
    setIsSubmitting(false);
  };

  const handleApprove = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const { error: approveError } = await authClient.device.approve({
        userCode: validatedCode,
      });

      if (approveError) {
        const errorMsg =
          approveError.error === "expired_token"
            ? "This code has expired. Please run `wraps auth login` again."
            : "Failed to approve. The code may be invalid or expired.";
        setError(errorMsg);
        setIsSubmitting(false);
        return;
      }

      // Check if user has orgs
      const { data: orgs } = await authClient.organization.list();

      if (orgs && orgs.length > 0) {
        setState("success");
      } else {
        setState("create-org");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeny = async () => {
    setIsSubmitting(true);

    try {
      await authClient.device.deny({ userCode: validatedCode });
    } catch {
      // Even if deny fails, redirect away
    }

    router.replace("/");
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await createOrganizationAction({
        name: orgName,
        slug: orgSlug || undefined,
      });

      if (result.success) {
        setCreatedOrgName(result.organization.name);
        setState("success");
      } else {
        setError(result.error);
      }
    } catch {
      setError("Failed to create organization. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOrgNameChange = (value: string) => {
    setOrgName(value);
    if (autoSlug) {
      setOrgSlug(generateSlug(value));
    }
  };

  if (sessionPending || !session?.user) {
    return null;
  }

  if (state === "verifying") {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Authorize CLI</CardTitle>
          <CardDescription>Verifying your code...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (state === "success") {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">You're all set!</CardTitle>
          <CardDescription>Return to your terminal to continue</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-muted-foreground text-center text-sm">
            Your CLI session has been authorized
            {createdOrgName ? ` for ${createdOrgName}` : ""}. You can close this
            tab.
          </p>
          <Button onClick={() => router.push("/")} variant="outline">
            Open Dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state === "create-org") {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Create Organization</CardTitle>
          <CardDescription>
            Set up your organization to get started
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleCreateOrg}>
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/15 p-3">
                <p className="text-destructive text-sm">{error}</p>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="org-name">Organization Name</Label>
              <Input
                autoFocus
                id="org-name"
                onChange={(e) => handleOrgNameChange(e.target.value)}
                placeholder="Acme Inc."
                required
                type="text"
                value={orgName}
              />
              <p className="text-muted-foreground text-xs">
                The name of your organization or company
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="org-slug">URL Slug</Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">
                  wraps.dev/
                </span>
                <Input
                  id="org-slug"
                  onChange={(e) => {
                    setOrgSlug(e.target.value);
                    setAutoSlug(false);
                  }}
                  placeholder="acme-inc"
                  type="text"
                  value={orgSlug}
                />
              </div>
            </div>
            <Button disabled={isSubmitting || !orgName} type="submit">
              {isSubmitting ? "Creating..." : "Create Organization"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (state === "approve") {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Authorize CLI</CardTitle>
          <CardDescription>
            A CLI session is requesting access to your account
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/15 p-3">
              <p className="text-destructive text-sm">{error}</p>
            </div>
          )}
          <div className="rounded-lg border bg-muted/50 p-4 text-center">
            <p className="text-muted-foreground mb-1 text-xs">
              Confirm this matches your terminal
            </p>
            <p className="font-mono text-2xl tracking-widest">
              {formatCode(validatedCode)}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              disabled={isSubmitting}
              onClick={handleApprove}
            >
              {isSubmitting ? "Approving..." : "Approve"}
            </Button>
            <Button
              disabled={isSubmitting}
              onClick={handleDeny}
              variant="outline"
            >
              Deny
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Default: enter-code state
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Authorize CLI</CardTitle>
        <CardDescription>Enter the code shown in your terminal</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="user_code">Device Code</Label>
            <Input
              autoComplete="off"
              autoFocus
              className="text-center font-mono text-lg tracking-widest"
              id="user_code"
              maxLength={9}
              onChange={(e) => handleCodeChange(e.target.value)}
              placeholder="XXXX-XXXX"
              type="text"
              value={code}
            />
            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
          <Button
            disabled={isSubmitting || getRawCode(code).length !== 8}
            type="submit"
          >
            {isSubmitting ? "Verifying..." : "Continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function DevicePage() {
  return (
    <Suspense>
      <DeviceFlow />
    </Suspense>
  );
}
