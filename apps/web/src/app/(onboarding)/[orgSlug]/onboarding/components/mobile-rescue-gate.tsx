"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { CheckCircleIcon, MailIcon, MonitorIcon } from "lucide-react";
import posthog from "posthog-js";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { sendDesktopLink } from "@/actions/mobile-rescue";
import { Button } from "@/components/ui/button";

type MobileRescueGateProps = {
  orgSlug: string;
  orgName: string;
  organizationId: string;
  userEmail: string;
  children: React.ReactNode;
};

export function MobileRescueGate({
  orgSlug,
  orgName,
  organizationId,
  userEmail,
  children,
}: MobileRescueGateProps) {
  const [gateActive, setGateActive] = useState(true);
  const [emailSent, setEmailSent] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const key = `mobile-rescue-bypassed-${orgSlug}`;
    if (sessionStorage.getItem(key) === "true") {
      setGateActive(false);
      return;
    }
    posthog.capture("mobile_signup_rescue_shown", {
      organization_id: organizationId,
    });
  }, [orgSlug, organizationId]);

  if (!gateActive) {
    return <>{children}</>;
  }

  const handleSendLink = async () => {
    setSending(true);
    try {
      const result = await sendDesktopLink(organizationId);
      if (result.success) {
        setEmailSent(true);
      } else {
        toast.error("Failed to send email. Please try again.");
      }
    } catch {
      toast.error("Failed to send email. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleBypass = () => {
    sessionStorage.setItem(`mobile-rescue-bypassed-${orgSlug}`, "true");
    posthog.capture("mobile_signup_rescue_bypassed", {
      organization_id: organizationId,
    });
    setGateActive(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-md">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <MonitorIcon className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">
            You'll need a desktop to get started
          </CardTitle>
          <CardDescription className="text-base">
            Wraps requires a desktop to set up your AWS sending infrastructure.
            {orgName && (
              <>
                {" "}
                Your organization <strong>{orgName}</strong> is ready and
                waiting.
              </>
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {emailSent ? (
            <div className="flex flex-col items-center space-y-3 rounded-lg bg-muted/50 p-4 text-center">
              <CheckCircleIcon className="h-8 w-8 text-success" />
              <p className="font-medium">Check your inbox!</p>
              <p className="text-muted-foreground text-sm">
                We sent a link to <strong>{userEmail}</strong>. Open it on your
                computer to continue setup.
              </p>
            </div>
          ) : (
            <Button
              className="w-full"
              disabled={sending}
              onClick={handleSendLink}
              size="lg"
            >
              <MailIcon className="mr-2 h-4 w-4" />
              {sending ? "Sending..." : "Send me the link"}
            </Button>
          )}

          <Button className="w-full" onClick={handleBypass} variant="ghost">
            I'm on desktop anyway
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
