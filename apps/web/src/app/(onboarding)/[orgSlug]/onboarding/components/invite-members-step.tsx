import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import { UserPlus } from "lucide-react";
import posthog from "posthog-js";
import { useState } from "react";
import { toast } from "sonner";
import { inviteMember } from "@/actions/members";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type InviteMembersStepProps = {
  onNext: () => void;
  onSkip: () => void;
  organizationId: string;
};

type SentInvite = {
  email: string;
  role: "admin" | "member";
};

export function InviteMembersStep({
  onNext,
  onSkip,
  organizationId,
}: InviteMembersStepProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [isInviting, setIsInviting] = useState(false);
  const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email?.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsInviting(true);
    const result = await inviteMember(email, role, organizationId);

    if (result.success) {
      posthog.capture("invitation_sent", {
        invited_email: email,
        role,
        organization_id: organizationId,
        source: "onboarding",
      });
      setSentInvites((prev) => [...prev, { email, role }]);
      toast.success(`Invitation sent to ${email}`);
      setEmail("");
      setRole("member");
    } else {
      toast.error(result.error);
    }

    setIsInviting(false);
  };

  const handleContinue = () => {
    posthog.capture("onboarding_step_completed", {
      step: 2,
      step_name: "Invite Team",
      organization_id: organizationId,
      invites_sent: sentInvites.length,
    });
    onNext();
  };

  const handleSkip = () => {
    posthog.capture("onboarding_step_skipped", {
      step: 2,
      step_name: "Invite Team",
      organization_id: organizationId,
    });
    onSkip();
  };

  return (
    <Card>
      <CardHeader className="space-y-2 text-center">
        <CardTitle className="text-3xl">Invite your team</CardTitle>
        <CardDescription className="text-base">
          Optional — invite teammates now or skip and add them anytime from
          Settings. They'll get access as soon as your setup is done.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <form className="flex gap-3" onSubmit={handleInvite}>
          <Input
            className="flex-1"
            disabled={isInviting}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@example.com"
            type="email"
            value={email}
          />
          <Select
            disabled={isInviting}
            onValueChange={(value) => setRole(value as "admin" | "member")}
            value={role}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Button disabled={isInviting || !email} type="submit">
            <UserPlus className="mr-2 h-4 w-4" />
            {isInviting ? "Sending..." : "Invite"}
          </Button>
        </form>

        {sentInvites.length > 0 && (
          <div className="space-y-2">
            <p className="font-medium text-sm text-muted-foreground">
              Invitations sent
            </p>
            <div className="space-y-2">
              {sentInvites.map((invite) => (
                <div
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  key={invite.email}
                >
                  <span>{invite.email}</span>
                  <span className="text-muted-foreground capitalize">
                    {invite.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col items-center gap-2 pt-2">
          <div className="flex justify-center gap-3">
            {sentInvites.length > 0 && (
              <Button onClick={handleContinue} size="lg">
                Continue
              </Button>
            )}
            <Button
              onClick={handleSkip}
              size="lg"
              variant={sentInvites.length > 0 ? "ghost" : "default"}
            >
              {sentInvites.length > 0
                ? "Skip for now"
                : "Skip — I'll do this later"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
