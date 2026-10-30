"use client";

import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  deleteSsoProvider,
  generateScimToken,
  requestDomainVerification,
  saveSsoProvider,
  verifyDomain,
  verifyDomainViaSES,
} from "@/actions/sso";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  organization: { id: string; name: string; slug: string };
  userRole: string;
  existingProvider: {
    id: string;
    providerId: string;
    domain: string;
    issuer: string;
    domainVerified: boolean;
  } | null;
  existingScimProvider: { id: string } | null;
  initialVerificationToken: string | null;
  initialVerificationExpiresAt: string | null;
};

// Self-hosted deployments must show their own URLs here — these strings are
// what the customer pastes into their IdP, so the platform's host would point
// their SSO callbacks at a server that cannot complete them.
//
// Strip a trailing slash for the same reason: NEXT_PUBLIC_APP_URL is pasted into
// .env.selfhost, and `${APP_URL}/api/auth/...` would then register
// `//api/auth/sso/callback/domain` in the IdP — a path better-auth does not
// serve, so SSO and SCIM both fail on a deployment that looks configured.
const APP_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "https://app.wraps.dev"
).replace(/\/+$/, "");
const APP_HOST = APP_URL.replace(/^https?:\/\//, "");

export function OrganizationSettingsSso({
  organization,
  userRole,
  existingProvider,
  existingScimProvider,
  initialVerificationToken,
  initialVerificationExpiresAt,
}: Props) {
  const canEdit = ["owner", "admin"].includes(userRole);
  const [isPending, startTransition] = useTransition();

  const [issuer, setIssuer] = useState(existingProvider?.issuer ?? "");
  const [domain, setDomain] = useState(existingProvider?.domain ?? "");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const [scimToken, setScimToken] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [verificationToken, setVerificationToken] = useState<string | null>(
    initialVerificationToken
  );
  const [verificationExpiresAt, setVerificationExpiresAt] = useState<
    string | null
  >(initialVerificationExpiresAt);

  const scimBaseUrl = `${APP_URL}/api/auth/scim/v2`;

  function handleCopy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    });
  }

  function handleSave() {
    startTransition(() => {
      const promise = saveSsoProvider(organization.id, {
        domain,
        issuer,
        clientId,
        clientSecret,
      }).then((result) => {
        if (!result.success) throw new Error(result.error);
        return result;
      });

      toast.promise(promise, {
        loading: "Saving SSO configuration...",
        success: "SSO provider saved",
        error: (err) => err.message,
      });
    });
  }

  function handleDelete() {
    if (!existingProvider) return;
    if (
      !confirm(
        "Remove this SSO provider? Users will no longer be able to sign in via SSO."
      )
    ) {
      return;
    }

    startTransition(() => {
      const promise = deleteSsoProvider(
        organization.id,
        existingProvider.providerId
      ).then((result) => {
        if (!result.success) throw new Error(result.error);
        return result;
      });

      toast.promise(promise, {
        loading: "Removing SSO provider...",
        success: "SSO provider removed",
        error: (err) => err.message,
      });
    });
  }

  function handleRequestVerification() {
    if (!existingProvider) return;

    startTransition(() => {
      const promise = requestDomainVerification(
        organization.id,
        existingProvider.providerId
      ).then((result) => {
        if (!result.success) throw new Error(result.error);
        setVerificationToken(result.token);
        setVerificationExpiresAt(result.expiresAt);
        return result;
      });

      toast.promise(promise, {
        loading: "Requesting domain verification...",
        success: "Verification token generated",
        error: (err) => err.message,
      });
    });
  }

  function handleVerify() {
    if (!existingProvider) return;

    startTransition(() => {
      const promise = verifyDomain(
        organization.id,
        existingProvider.providerId
      ).then((result) => {
        if (!result.success) throw new Error(result.error);
        return result;
      });

      toast.promise(promise, {
        loading: "Verifying domain...",
        success: "Domain verified — SSO is now active",
        error: (err) => err.message,
      });
    });
  }

  function handleVerifyViaSES() {
    if (!existingProvider) return;

    startTransition(() => {
      const promise = verifyDomainViaSES(
        organization.id,
        existingProvider.providerId
      ).then((result) => {
        if (!result.success) throw new Error(result.error);
        return result;
      });

      toast.promise(promise, {
        loading: "Checking SES verification...",
        success: "Domain verified via SES — SSO is now active",
        error: (err) => err.message,
      });
    });
  }

  function handleGenerateScimToken() {
    if (!existingProvider) return;

    startTransition(() => {
      const promise = generateScimToken(
        organization.id,
        existingProvider.providerId
      ).then((result) => {
        if (!result.success) throw new Error(result.error);
        setScimToken(result.token);
        return result;
      });

      toast.promise(promise, {
        loading: "Generating SCIM token...",
        success: "SCIM token generated — copy it now, it won't be shown again",
        error: (err) => err.message,
      });
    });
  }

  const redirectUri = domain
    ? `${APP_URL}/api/auth/sso/callback/${domain}`
    : null;

  const dnsTxtHostname = existingProvider
    ? `_better-auth-token-${existingProvider.providerId}`
    : null;

  return (
    <div className="space-y-6">
      <Panel
        actions={
          existingProvider && (
            <div className="flex items-center gap-2 text-sm">
              {existingProvider.domainVerified ? (
                <>
                  <ShieldCheck className="h-4 w-4 text-success" />
                  <span className="text-success">Active</span>
                </>
              ) : (
                <>
                  <ShieldOff className="h-4 w-4 text-warning" />
                  <span className="text-warning">Pending verification</span>
                </>
              )}
            </div>
          )
        }
        description="Configure OIDC-based SSO for your organization. Members can sign in via your identity provider (Okta, Azure AD, etc.)."
        label={<PanelTitle>Single Sign-On</PanelTitle>}
      >
        {existingProvider ? (
          existingProvider.domainVerified ? (
            /* Active SSO */
            <div className="space-y-4">
              <div className="bg-muted p-4 text-sm space-y-2">
                <p className="font-medium text-success">
                  SSO is active for {existingProvider.domain}
                </p>
                <p className="text-muted-foreground">
                  Issuer: {existingProvider.issuer}
                </p>
              </div>
              <div className="border bg-muted/40 p-4 text-sm space-y-1">
                <p className="font-medium">How your team signs in</p>
                <ol className="space-y-1 text-muted-foreground list-decimal list-inside">
                  <li>
                    Go to <strong>{APP_HOST}</strong>
                  </li>
                  <li>
                    Enter their <strong>@{existingProvider.domain}</strong>{" "}
                    email address
                  </li>
                  <li>
                    Click <strong>Sign in with SSO</strong>
                  </li>
                </ol>
              </div>
              {canEdit && (
                <Button
                  disabled={isPending}
                  onClick={handleDelete}
                  variant="outline"
                >
                  Remove SSO Provider
                </Button>
              )}
            </div>
          ) : (
            /* Domain verification */
            <div className="space-y-4">
              <div className="border bg-muted/40 p-4 text-sm space-y-3">
                <p className="font-medium">
                  Step 2 of 2 — Verify domain ownership
                </p>
                <p className="text-muted-foreground">
                  Add a DNS TXT record to prove you own{" "}
                  <strong>{existingProvider.domain}</strong>. SSO activates
                  automatically once verified.
                </p>
                <ol className="space-y-1 text-muted-foreground list-decimal list-inside">
                  <li>
                    Click <strong>Get Verification Token</strong> below
                  </li>
                  <li>Add the TXT record to your DNS provider</li>
                  <li>
                    Click <strong>Verify Domain</strong> — DNS can take a few
                    minutes to propagate
                  </li>
                </ol>
              </div>

              {verificationToken && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Record type</p>
                    <div className="border bg-muted/50 px-3 py-2 font-mono text-sm">
                      TXT
                    </div>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Hostname / Name</p>
                    <div className="flex items-center gap-2 border bg-muted/50 p-3 font-mono text-sm">
                      <span className="flex-1 break-all">{dnsTxtHostname}</span>
                      <Button
                        aria-label="Copy DNS hostname"
                        onClick={() =>
                          handleCopy(dnsTxtHostname ?? "", "dns-hostname")
                        }
                        size="icon"
                        variant="ghost"
                      >
                        {copiedKey === "dns-hostname" ? (
                          <Check className="h-4 w-4 text-success" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Some DNS providers auto-append your domain — enter only
                      the part shown above.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Value</p>
                    <div className="flex items-center gap-2 border bg-muted/50 p-3 font-mono text-sm">
                      <span className="flex-1 break-all">
                        {dnsTxtHostname}={verificationToken}
                      </span>
                      <Button
                        aria-label="Copy DNS TXT value"
                        onClick={() =>
                          handleCopy(
                            `${dnsTxtHostname}=${verificationToken}`,
                            "dns-token"
                          )
                        }
                        size="icon"
                        variant="ghost"
                      >
                        {copiedKey === "dns-token" ? (
                          <Check className="h-4 w-4 text-success" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  {verificationExpiresAt && (
                    <p className="text-muted-foreground text-xs">
                      Token expires{" "}
                      {new Date(verificationExpiresAt).toLocaleDateString(
                        "en-US",
                        {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        }
                      )}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {canEdit && (
                  <Button
                    disabled={isPending}
                    onClick={handleRequestVerification}
                    variant="outline"
                  >
                    {isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    {verificationToken
                      ? "Regenerate Token"
                      : "Get Verification Token"}
                  </Button>
                )}
                {canEdit && (
                  <Button
                    disabled={isPending || !verificationToken}
                    onClick={handleVerify}
                  >
                    {isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Verify Domain
                  </Button>
                )}
                {canEdit && (
                  <Button
                    disabled={isPending}
                    onClick={handleDelete}
                    variant="ghost-destructive"
                  >
                    Remove Provider
                  </Button>
                )}
              </div>

              {canEdit && (
                <div className="border-t pt-4 space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Already use Wraps email for{" "}
                    <strong>{existingProvider.domain}</strong>? Skip the TXT
                    record — verify via your connected AWS account instead.
                  </p>
                  <Button
                    disabled={isPending}
                    onClick={handleVerifyViaSES}
                    variant="outline"
                  >
                    {isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Verify via AWS SES
                  </Button>
                </div>
              )}
            </div>
          )
        ) : (
          /* Setup form */
          <div className="space-y-6">
            {/* IdP setup guide */}
            <div className="border bg-muted/40 p-4 text-sm space-y-3">
              <p className="font-medium">
                Step 1 of 2 — Configure your identity provider
              </p>
              <p className="text-muted-foreground">
                Create a new OIDC app in your IdP (Okta, Azure AD, Google
                Workspace, etc.) with these settings before filling in the form
                below.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    Application type
                  </p>
                  <p className="text-muted-foreground">Web Application</p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Grant type</p>
                  <p className="text-muted-foreground">Authorization Code</p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Required scopes</p>
                  <p className="text-muted-foreground font-mono">
                    openid, email, profile
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    Sign-in redirect URI
                  </p>
                  <p className="text-muted-foreground">See field below ↓</p>
                </div>
              </div>
            </div>

            {/* Form fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="sso-domain">
                  Domain
                </label>
                <Input
                  disabled={!canEdit || isPending}
                  id="sso-domain"
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="company.com"
                  value={domain}
                />
                <p className="text-muted-foreground text-xs">
                  The email domain your team uses
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="sso-issuer">
                  Issuer URL
                </label>
                <Input
                  disabled={!canEdit || isPending}
                  id="sso-issuer"
                  onChange={(e) => setIssuer(e.target.value)}
                  placeholder="https://your-org.okta.com/oauth2/default"
                  value={issuer}
                />
                <p className="text-muted-foreground text-xs">
                  Okta: Settings → Authorization Servers → Issuer URI (usually
                  ends in <code>/oauth2/default</code>). Azure AD: the tenant
                  issuer from App registrations.
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="sso-client-id">
                  Client ID
                </label>
                <Input
                  disabled={!canEdit || isPending}
                  id="sso-client-id"
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="0oa..."
                  value={clientId}
                />
              </div>
              <div className="space-y-1">
                <label
                  className="text-sm font-medium"
                  htmlFor="sso-client-secret"
                >
                  Client Secret
                </label>
                <Input
                  disabled={!canEdit || isPending}
                  id="sso-client-secret"
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="••••••••"
                  type="password"
                  value={clientSecret}
                />
              </div>
            </div>

            {/* Redirect URI */}
            <div className="space-y-1">
              <p className="text-sm font-medium">Sign-in Redirect URI</p>
              <div className="flex items-center gap-2 border bg-muted/50 p-3 font-mono text-sm">
                <span
                  className={`flex-1 break-all ${domain ? "" : "text-muted-foreground"}`}
                >
                  {redirectUri ??
                    `${APP_URL}/api/auth/sso/callback/your-domain.com`}
                </span>
                {redirectUri && (
                  <Button
                    aria-label="Copy sign-in redirect URI"
                    onClick={() => handleCopy(redirectUri, "redirect-uri")}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    {copiedKey === "redirect-uri" ? (
                      <Check className="h-4 w-4 text-success" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                Add this as the sign-in redirect URI in your identity provider.
                Updates as you type your domain above.
              </p>
            </div>

            {canEdit && (
              <Button
                disabled={
                  isPending || !domain || !issuer || !clientId || !clientSecret
                }
                onClick={handleSave}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save and continue"
                )}
              </Button>
            )}
          </div>
        )}
      </Panel>

      {/* SCIM Provisioning — only shown when SSO is active */}
      {existingProvider?.domainVerified && (
        <Panel
          description="Automatically sync users and groups from your identity provider via the SCIM 2.0 protocol."
          label={
            <PanelTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              SCIM Provisioning
            </PanelTitle>
          }
        >
          <div className="space-y-4">
            <div className="border bg-muted/40 p-4 text-sm space-y-2">
              <p className="font-medium">Setup instructions</p>
              <ol className="space-y-1 text-muted-foreground list-decimal list-inside">
                <li>In your IdP, enable SCIM provisioning on this app</li>
                <li>Set the SCIM connector base URL to the value below</li>
                <li>
                  Set the authentication method to <strong>HTTP Header</strong>
                </li>
                <li>
                  Generate a SCIM token below and paste it as the bearer token
                </li>
                <li>
                  Enable <strong>Create</strong>, <strong>Update</strong>, and{" "}
                  <strong>Deactivate</strong> for users
                </li>
              </ol>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">SCIM Base URL</p>
              <div className="flex items-center gap-2 border bg-muted/50 p-3 font-mono text-sm">
                <span className="flex-1 break-all">{scimBaseUrl}</span>
                <Button
                  aria-label="Copy SCIM base URL"
                  onClick={() => handleCopy(scimBaseUrl, "scim-base-url")}
                  size="icon"
                  variant="ghost"
                >
                  {copiedKey === "scim-base-url" ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {scimToken ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">SCIM Bearer Token</p>
                <div className="flex items-center gap-2 border border-warning/30 bg-warning/15 p-3 font-mono text-sm">
                  <span className="flex-1 break-all">{scimToken}</span>
                  <Button
                    aria-label="Copy SCIM bearer token"
                    onClick={() => handleCopy(scimToken, "scim-token")}
                    size="icon"
                    variant="ghost"
                  >
                    {copiedKey === "scim-token" ? (
                      <Check className="h-4 w-4 text-success" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  Copy this token now. It won't be shown again.
                </p>
              </div>
            ) : (
              <div>
                {existingScimProvider && (
                  <p className="mb-3 text-muted-foreground text-sm">
                    A SCIM token has been generated previously. Generate a new
                    one to rotate credentials.
                  </p>
                )}
                {canEdit && (
                  <Button
                    disabled={isPending}
                    onClick={handleGenerateScimToken}
                  >
                    {isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <KeyRound className="mr-2 h-4 w-4" />
                    )}
                    {existingScimProvider
                      ? "Rotate SCIM Token"
                      : "Generate SCIM Token"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </Panel>
      )}
    </div>
  );
}
