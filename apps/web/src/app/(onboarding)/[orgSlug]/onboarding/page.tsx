"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import Loader from "@/components/loader";
import { authClient } from "@/lib/auth-client";
import { AwsConnectStep } from "./components/aws-connect-step";
import { BillingStep } from "./components/billing-step";
import { CliInstallStep } from "./components/cli-install-step";
import { DeployStep } from "./components/deploy-step";
import { StepProgress } from "./components/step-progress";
import { SuccessStep } from "./components/success-step";
import { WelcomeStep } from "./components/welcome-step";

const STEPS = [
  { id: 1, title: "Welcome", component: WelcomeStep },
  { id: 2, title: "Install CLI", component: CliInstallStep },
  { id: 3, title: "Connect AWS", component: AwsConnectStep },
  { id: 4, title: "First Deployment", component: DeployStep },
  { id: 5, title: "Choose Plan", component: BillingStep },
  { id: 6, title: "Success", component: SuccessStep },
];

type OnboardingPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default function OnboardingPage({ params }: OnboardingPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: session, isPending } = authClient.useSession();
  const [orgSlug, setOrgSlug] = useState<string | null>(null);

  // Get step from URL or localStorage
  const [currentStep, setCurrentStep] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);

  // Get organization details
  const { data: organizations } = authClient.useListOrganizations();

  // Get orgSlug from route params
  useEffect(() => {
    params.then((p) => setOrgSlug(p.orgSlug));
  }, [params]);

  // Initialize step from URL or localStorage
  useEffect(() => {
    if (!orgSlug) {
      return;
    }

    const stepParam = searchParams.get("step");
    if (stepParam) {
      const step = Number.parseInt(stepParam, 10);
      if (!Number.isNaN(step) && step >= 1 && step <= STEPS.length) {
        setCurrentStep(step);
        setIsInitialized(true);
        return;
      }
    }

    const savedStep = localStorage.getItem(`onboarding_step_${orgSlug}`);
    if (savedStep) {
      const step = Number.parseInt(savedStep, 10);
      if (!Number.isNaN(step) && step >= 1 && step <= STEPS.length) {
        setCurrentStep(step);
      }
    }
    setIsInitialized(true);
  }, [orgSlug, searchParams]);

  // Save step to localStorage
  useEffect(() => {
    if (orgSlug && isInitialized) {
      localStorage.setItem(
        `onboarding_step_${orgSlug}`,
        currentStep.toString()
      );
    }
  }, [currentStep, orgSlug, isInitialized]);

  // Check if onboarding is already completed
  const { data: onboardingStatus } = useQuery({
    queryKey: ["onboarding-status", orgSlug],
    queryFn: async () => {
      if (!orgSlug) {
        return null;
      }
      const res = await fetch(`/api/${orgSlug}/onboarding/status`);
      if (!res.ok) {
        return null;
      }
      return res.json();
    },
    enabled: !!orgSlug,
  });

  useEffect(() => {
    if (onboardingStatus?.completed) {
      // If completed, redirect to emails
      router.push(`/${orgSlug}/emails`);
    }
  }, [onboardingStatus, router, orgSlug]);

  if (isPending || !isInitialized || !orgSlug) {
    return <Loader fullScreen />;
  }

  if (!session) {
    router.push("/auth");
    return null;
  }

  // Find the organization that matches the orgSlug
  const currentOrg = organizations?.find(
    (org) => org.slug === orgSlug || org.id === orgSlug
  );

  if (!currentOrg && organizations !== undefined) {
    // Organization not found or user doesn't have access
    router.push("/");
    return null;
  }

  if (!currentOrg) {
    // Still loading organizations
    return <Loader fullScreen />;
  }

  const CurrentStepComponent = STEPS[currentStep - 1].component;

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    // Skip current step and move to the next one
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    } else {
      // If on last step, skip to emails without marking complete
      router.push(`/${orgSlug}/emails`);
    }
  };

  const handleComplete = async () => {
    // Mark onboarding complete and redirect to emails
    await fetch(`/api/${orgSlug}/onboarding/complete`, {
      method: "POST",
    });

    // Invalidate the onboarding status query to refetch
    await queryClient.invalidateQueries({
      queryKey: ["onboarding-status", orgSlug],
    });

    // Clear localStorage
    localStorage.removeItem(`onboarding_step_${orgSlug}`);

    router.push(`/${orgSlug}/emails`);
  };

  return (
    <div className="space-y-8">
      {/* Progress Indicator */}
      <StepProgress
        currentStep={currentStep}
        steps={STEPS.map((s) => s.title)}
      />

      {/* Current Step Content */}
      <CurrentStepComponent
        onBack={handleBack}
        onComplete={handleComplete}
        onNext={handleNext}
        onSkip={handleSkip}
        organizationId={currentOrg.id}
      />
    </div>
  );
}
