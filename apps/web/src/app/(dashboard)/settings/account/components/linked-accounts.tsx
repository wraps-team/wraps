"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

type LinkedAccount = {
  id: string;
  providerId: string;
  accountId: string;
  userId: string;
  scopes: string[];
  createdAt: Date;
  updatedAt: Date;
};

export function LinkedAccounts() {
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLinkingGoogle, setIsLinkingGoogle] = useState(false);
  const [isUnlinkingGoogle, setIsUnlinkingGoogle] = useState(false);
  const [isLinkingGitHub, setIsLinkingGitHub] = useState(false);
  const [isUnlinkingGitHub, setIsUnlinkingGitHub] = useState(false);

  // Fetch linked accounts
  useEffect(() => {
    async function fetchAccounts() {
      try {
        const result = await authClient.listAccounts();
        if (result.data) {
          setAccounts(result.data as LinkedAccount[]);
        }
      } catch (error) {
        console.error("Failed to fetch linked accounts:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchAccounts();
  }, []);

  const hasGoogleLinked = accounts.some(
    (account) => account.providerId === "google"
  );
  const hasGitHubLinked = accounts.some(
    (account) => account.providerId === "github"
  );
  const hasCredentialAccount = accounts.some(
    (account) => account.providerId === "credential"
  );

  const handleLinkGoogle = async () => {
    setIsLinkingGoogle(true);
    try {
      await authClient.linkSocial({
        provider: "google",
        callbackURL: "/settings/account",
      });
    } catch (error: any) {
      console.error("Failed to link Google account:", error);
      toast.error(error.message || "Failed to link Google account");
      setIsLinkingGoogle(false);
    }
  };

  const handleUnlinkGoogle = async () => {
    // Prevent unlinking if it's the only account
    if (accounts.length === 1) {
      toast.error(
        "Cannot unlink your only login method. Add another login method first."
      );
      return;
    }

    setIsUnlinkingGoogle(true);
    try {
      const result = await authClient.unlinkAccount({
        providerId: "google",
      });

      if (result.error) {
        toast.error(result.error.message || "Failed to unlink Google account");
        return;
      }

      // Remove Google from local state
      setAccounts(
        accounts.filter((account) => account.providerId !== "google")
      );
      toast.success("Google account unlinked successfully");
    } catch (error: any) {
      console.error("Failed to unlink Google account:", error);
      toast.error(error.message || "Failed to unlink Google account");
    } finally {
      setIsUnlinkingGoogle(false);
    }
  };

  const handleLinkGitHub = async () => {
    setIsLinkingGitHub(true);
    try {
      await authClient.linkSocial({
        provider: "github",
        callbackURL: "/settings/account",
      });
    } catch (error: any) {
      console.error("Failed to link GitHub account:", error);
      toast.error(error.message || "Failed to link GitHub account");
      setIsLinkingGitHub(false);
    }
  };

  const handleUnlinkGitHub = async () => {
    // Prevent unlinking if it's the only account
    if (accounts.length === 1) {
      toast.error(
        "Cannot unlink your only login method. Add another login method first."
      );
      return;
    }

    setIsUnlinkingGitHub(true);
    try {
      const result = await authClient.unlinkAccount({
        providerId: "github",
      });

      if (result.error) {
        toast.error(result.error.message || "Failed to unlink GitHub account");
        return;
      }

      // Remove GitHub from local state
      setAccounts(
        accounts.filter((account) => account.providerId !== "github")
      );
      toast.success("GitHub account unlinked successfully");
    } catch (error: any) {
      console.error("Failed to unlink GitHub account:", error);
      toast.error(error.message || "Failed to unlink GitHub account");
    } finally {
      setIsUnlinkingGitHub(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Linked Accounts</CardTitle>
          <CardDescription>
            Connect your account with third-party providers for easier sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked Accounts</CardTitle>
        <CardDescription>
          Connect your account with third-party providers for easier sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Google */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <svg
              className="h-6 w-6"
              viewBox="0 0 24 24"
            >
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            <div>
              <p className="font-medium">Google</p>
              <p className="text-muted-foreground text-sm">
                {hasGoogleLinked
                  ? "Connected"
                  : "Sign in with your Google account"}
              </p>
            </div>
          </div>
          {hasGoogleLinked ? (
            <Button
              disabled={isUnlinkingGoogle || accounts.length === 1}
              loading={isUnlinkingGoogle}
              onClick={handleUnlinkGoogle}
              size="sm"
              variant="outline"
            >
              Disconnect
            </Button>
          ) : (
            <Button
              loading={isLinkingGoogle}
              onClick={handleLinkGoogle}
              size="sm"
              variant="outline"
            >
              Connect
            </Button>
          )}
        </div>

        {/* GitHub */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <svg
              className="h-6 w-6"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <div>
              <p className="font-medium">GitHub</p>
              <p className="text-muted-foreground text-sm">
                {hasGitHubLinked
                  ? "Connected"
                  : "Sign in with your GitHub account"}
              </p>
            </div>
          </div>
          {hasGitHubLinked ? (
            <Button
              disabled={isUnlinkingGitHub || accounts.length === 1}
              loading={isUnlinkingGitHub}
              onClick={handleUnlinkGitHub}
              size="sm"
              variant="outline"
            >
              Disconnect
            </Button>
          ) : (
            <Button
              loading={isLinkingGitHub}
              onClick={handleLinkGitHub}
              size="sm"
              variant="outline"
            >
              Connect
            </Button>
          )}
        </div>

        {/* Info message */}
        {accounts.length === 1 && (
          <p className="text-muted-foreground text-sm">
            {hasCredentialAccount
              ? "You can connect Google or GitHub to enable signing in with multiple methods."
              : "Add a password or connect another provider before disconnecting your only login method."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
