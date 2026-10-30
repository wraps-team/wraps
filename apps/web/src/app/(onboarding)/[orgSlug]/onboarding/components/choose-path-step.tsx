import { Panel, PanelTitle } from "@wraps/ui/components/ui/panel";
import { CloudIcon, PencilRulerIcon } from "lucide-react";
import posthog from "posthog-js";
import { Button } from "@/components/ui/button";

type ChoosePathStepProps = {
  onNext: () => void;
  organizationId: string;
  orgSlug?: string;
};

export function ChoosePathStep({
  onNext,
  organizationId,
  orgSlug: orgSlugProp,
}: ChoosePathStepProps) {
  const handlePath = (path: "start_building" | "connect_aws") => {
    // Persist path choice to survive Stripe redirect
    const orgSlug = orgSlugProp ?? window.location.pathname.split("/")[1] ?? "";
    localStorage.setItem(`onboarding_path_${orgSlug}`, path);

    posthog.capture("onboarding_path_chosen", {
      path,
      step: 3,
      step_name: "Choose Path",
      organization_id: organizationId,
    });
    posthog.capture("onboarding_step_completed", {
      step: 3,
      step_name: "Choose Path",
      organization_id: organizationId,
    });
    onNext();
  };

  return (
    <Panel
      description="How would you like to get started?"
      label={<PanelTitle>Welcome to Wraps!</PanelTitle>}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col items-center space-y-3 border p-6 text-center">
          <CloudIcon className="h-10 w-10 text-primary" />
          <h3 className="font-semibold text-lg">Connect AWS now</h3>
          <p className="text-muted-foreground text-sm">
            Set up your AWS infrastructure and start sending emails in minutes.
            Best if you already have an AWS account.
          </p>
          <Button
            className="mt-auto w-full"
            onClick={() => handlePath("connect_aws")}
            size="lg"
          >
            Set up infrastructure
          </Button>
        </div>

        <div className="flex flex-col items-center space-y-3 border p-6 text-center">
          <PencilRulerIcon className="h-10 w-10 text-primary" />
          <h3 className="font-semibold text-lg">Start building</h3>
          <p className="text-muted-foreground text-sm">
            Explore templates, contacts, and workflows first. You'll need to
            connect AWS before you can send anything.
          </p>
          <Button
            className="mt-auto w-full"
            onClick={() => handlePath("start_building")}
            size="lg"
            variant="outline"
          >
            Explore Wraps!
          </Button>
        </div>
      </div>
    </Panel>
  );
}
