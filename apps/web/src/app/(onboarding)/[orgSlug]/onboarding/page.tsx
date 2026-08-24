"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import Loader from "@/components/loader";
import { authClient } from "@/lib/auth-client";
import { BillingStep } from "./components/billing-step";
import { ChoosePathStep } from "./components/choose-path-step";
import { InviteMembersStep } from "./components/invite-members-step";
import { StepProgress } from "./components/step-progress";
import { SuccessStep } from "./components/success-step";

// Dynamic import for heavy component - loaded when user reaches step 3
const CliDeployConnectStep = dynamic(
  () =>
    import("./components/cli-deploy-connect-step").then(
      (m) => m.CliDeployConnectStep
    ),
  { loading: () => <Loader fullScreen /> }
);

const STEPS = [
  { id: 1, title: "Choose Plan", component: BillingStep },
  { id: 2, title: "Invite Team", component: InviteMembersStep },
  { id: 3, title: "Choose Path", component: ChoosePathStep },
  { id: 4, title: "Deploy & Connect", component: CliDeployConnectStep },
  { id: 5, title: "Success", component: SuccessStep },
];

/**
 * Determine initial step from URL params or localStorage
 */
function getInitialStep(
  searchParams: URLSearchParams,
  orgSlug: string
): number {
  // Check URL param first
  const stepParam = searchParams.get("step");
  if (stepParam) {
    const step = Number.parseInt(stepParam, 10);
    if (!Number.isNaN(step) && step >= 1 && step <= STEPS.length) {
      return step;
    }
  }

  // Fall back to localStorage
  if (typeof window !== "undefined") {
    const savedStep = localStorage.getItem(`onboarding_step_${orgSlug}`);
    if (savedStep) {
      const step = Number.parseInt(savedStep, 10);
      if (!Number.isNaN(step) && step >= 1 && step <= STEPS.length) {
        return step;
      }
    }
  }

  return 1;
}

type OnboardingPageProps = {
  params: Promise<{ orgSlug: string }>;
};

export default function OnboardingPage({ params }: OnboardingPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { data: session, isPending } = authClient.useSession();
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Get step from URL or localStorage
  const [currentStep, setCurrentStep] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);

  // Get organization details
  const { data: organizations, isPending: isOrgsLoading } =
    authClient.useListOrganizations();

  // Track whether infrastructure was connected (vs skipped)
  const [isInfrastructureConnected, setIsInfrastructureConnected] =
    useState(false);

  // Track which onboarding path the user chose
  const [onboardingPath, setOnboardingPath] = useState<
    "start_building" | "connect_aws" | null
  >(null);

  // Refs to prevent duplicate actions
  const hasShownSubscribedToast = useRef(false);
  const hasAdjustedBillingStep = useRef(false);
  const hasTrackedStart = useRef(false);
  const previousStep = useRef<number | null>(null);
  const hasRedirected = useRef(false);
  const userAdvancedPastBilling = useRef(false);
  const isCompleting = useRef(false);

  // EFFECT 1: Initialize orgSlug, step, and URL params together
  // Consolidates: orgSlug resolution, step initialization, plan/interval storage
  useEffect(() => {
    let mounted = true;

    params.then((p) => {
      if (!mounted) {
        return;
      }

      const slug = p.orgSlug;
      const initialStep = getInitialStep(searchParams, slug);

      // Store plan and billing interval preferences from URL
      const planParam = searchParams.get("plan");
      const intervalParam = searchParams.get("interval");
      if (planParam) {
        localStorage.setItem(`onboarding_plan_${slug}`, planParam);
      }
      if (intervalParam) {
        localStorage.setItem(`onboarding_interval_${slug}`, intervalParam);
      }

      // Read saved onboarding path from localStorage
      const savedPath = localStorage.getItem(`onboarding_path_${slug}`);
      const validPath =
        savedPath === "start_building" || savedPath === "connect_aws"
          ? savedPath
          : null;

      // Batch state updates in a transition to reduce renders
      startTransition(() => {
        setOrgSlug(slug);
        setCurrentStep(initialStep);
        if (validPath) {
          setOnboardingPath(validPath);
        }
        setIsInitialized(true);
      });
    });

    return () => {
      mounted = false;
    };
  }, [params, searchParams]);

  // EFFECT 2: Handle Stripe checkout return and step persistence
  // Consolidates: subscribed toast, step localStorage save
  useEffect(() => {
    if (!(isInitialized && orgSlug)) {
      return;
    }

    // Handle Stripe checkout return
    if (!hasShownSubscribedToast.current) {
      const subscribed = searchParams.get("subscribed");
      if (subscribed === "true") {
        hasShownSubscribedToast.current = true;
        toast.success("Payment successful!");
        if (currentStep === 1) {
          setCurrentStep(2);
          return; // Skip localStorage save since we're changing step
        }
      }
    }

    // Save current step to localStorage
    localStorage.setItem(`onboarding_step_${orgSlug}`, currentStep.toString());
  }, [isInitialized, orgSlug, currentStep, searchParams]);

  // Check if onboarding is already completed
  const { data: onboardingStatus, isLoading: isStatusLoading } = useQuery({
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
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // Find the organization that matches the orgSlug
  const currentOrg = organizations?.find(
    (org) => org.slug === orgSlug || org.id === orgSlug
  );

  // Self-hosted orgs get their plan from the license key, not Stripe — skip the
  // plan selection / billing step entirely.
  const isSelfHosted = onboardingStatus?.selfHosted === true;

  // EFFECT 3: Handle billing step adjustment based on subscription status
  useEffect(() => {
    if (
      !(isInitialized && onboardingStatus) ||
      hasAdjustedBillingStep.current ||
      hasShownSubscribedToast.current ||
      userAdvancedPastBilling.current
    ) {
      return;
    }

    // Self-hosted: billing step doesn't apply. Move off it and never reset back.
    if (isSelfHosted) {
      hasAdjustedBillingStep.current = true;
      if (currentStep === 1) {
        setCurrentStep(2);
      }
      return;
    }

    // If user has active subscription and is on billing step (step 1), skip to choose path
    if (onboardingStatus.hasActiveSubscription && currentStep === 1) {
      hasAdjustedBillingStep.current = true;
      setCurrentStep(2);
      return;
    }

    // If user is past billing step but has NO subscription, reset to billing step
    if (!onboardingStatus.hasActiveSubscription && currentStep > 1) {
      hasAdjustedBillingStep.current = true;
      setCurrentStep(1);
    }
  }, [isInitialized, onboardingStatus, isSelfHosted, currentStep]);

  // EFFECT 4: Analytics tracking (onboarding started + step views)
  useEffect(() => {
    if (!(isInitialized && currentOrg)) {
      return;
    }

    // Track onboarding started once per session
    if (!hasTrackedStart.current) {
      hasTrackedStart.current = true;
      posthog.capture("onboarding_started", {
        organization_id: currentOrg.id,
        initial_step: currentStep,
      });
    }

    // Track step views when step changes
    if (previousStep.current !== currentStep) {
      previousStep.current = currentStep;
      posthog.capture("onboarding_step_viewed", {
        step: currentStep,
        step_name: STEPS[currentStep - 1]?.title,
        organization_id: currentOrg.id,
      });
    }
  }, [isInitialized, currentOrg, currentStep]);

  // EFFECT 5: Handle all redirects in a single effect
  useEffect(() => {
    if (hasRedirected.current) {
      return;
    }

    // Redirect if onboarding is completed
    if (onboardingStatus?.completed && orgSlug) {
      hasRedirected.current = true;
      router.push(`/${orgSlug}`);
      return;
    }

    // Redirect if no session (auth check complete)
    if (!isPending && session === null) {
      hasRedirected.current = true;
      router.push("/auth");
      return;
    }

    // Redirect if org not found (after organizations fully loaded)
    if (
      !isOrgsLoading &&
      organizations !== undefined &&
      orgSlug &&
      !currentOrg
    ) {
      hasRedirected.current = true;
      router.push("/");
    }
  }, [
    onboardingStatus,
    orgSlug,
    isPending,
    session,
    isOrgsLoading,
    organizations,
    currentOrg,
    router,
  ]);

  // Completion logic — defined before early returns so EFFECT 6 can call it.
  // Accepts an optional explicit path to avoid stale closure when called from effects.
  const completeOnboarding = async (
    pathOverride?: "start_building" | "connect_aws" | null
  ) => {
    if (!orgSlug || isCompleting.current) {
      return;
    }
    isCompleting.current = true;
    const path = pathOverride ?? onboardingPath ?? "connect_aws";
    const res = await fetch(`/api/${orgSlug}/onboarding/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!res.ok) {
      toast.error("Failed to complete onboarding. Please try again.");
      hasRedirected.current = false;
      isCompleting.current = false;
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: ["onboarding-status", orgSlug],
    });
    localStorage.removeItem(`onboarding_step_${orgSlug}`);
    localStorage.removeItem(`onboarding_plan_${orgSlug}`);
    localStorage.removeItem(`onboarding_interval_${orgSlug}`);
    localStorage.removeItem(`onboarding_path_${orgSlug}`);
    if (currentOrg) {
      posthog.capture("onboarding_flow_completed", {
        organization_id: currentOrg.id,
        final_step: currentStep,
        onboarding_path: path,
      });
    }
    router.push(`/${orgSlug}`);
  };

  // EFFECT 6: Auto-complete for "Start building" path
  // When user reaches step 4+ with start_building path, skip Deploy & Connect.
  // Passes onboardingPath explicitly to avoid stale closure.
  useEffect(() => {
    if (
      isInitialized &&
      currentStep >= 4 &&
      onboardingPath === "start_building" &&
      !hasRedirected.current
    ) {
      hasRedirected.current = true;
      completeOnboarding(onboardingPath);
    }
  }, [isInitialized, currentStep, onboardingPath, completeOnboarding]);

  if (isPending || !isInitialized || !orgSlug || isOrgsLoading) {
    return <Loader fullScreen />;
  }

  if (!session) {
    return <Loader fullScreen />;
  }

  if (!currentOrg) {
    // Still loading organizations or redirecting
    return <Loader fullScreen />;
  }

  // Prevent flash of Deploy & Connect UI while auto-complete effect runs
  if (currentStep >= 4 && onboardingPath === "start_building") {
    return <Loader fullScreen />;
  }

  // Don't flash the billing step before we know whether it should be skipped.
  // Self-hosted orgs (and already-subscribed users) skip it via EFFECT 3.
  if (currentStep === 1 && (isStatusLoading || isSelfHosted)) {
    return <Loader fullScreen />;
  }

  // Never render Deploy & Connect before we know whether this deployment is
  // self-hosted — `selfHosted={false}` renders the platform CloudFormation path,
  // which a self-hosted control plane can never read. `!onboardingStatus` also
  // covers the queryFn returning null on a failed status fetch; without it the
  // gate fails open permanently rather than for one render.
  if (currentStep === 4 && (isStatusLoading || !onboardingStatus)) {
    return <Loader fullScreen />;
  }

  // Self-hosted orgs never see the "Choose Plan" step, so drop it from the
  // progress indicator and shift the displayed step number accordingly.
  const visibleSteps = isSelfHosted ? STEPS.slice(1) : STEPS;
  const displayStep = isSelfHosted ? currentStep - 1 : currentStep;

  const CurrentStepComponent = STEPS[currentStep - 1].component;

  const handleNext = () => {
    if (currentStep < STEPS.length) {
      // If advancing past billing step, prevent Effect 3 from resetting
      // back to step 1 before the onboarding-status query refreshes
      if (currentStep === 1) {
        userAdvancedPastBilling.current = true;
      }
      // Sync path choice from localStorage when advancing from Choose Path step
      if (currentStep === 3 && orgSlug) {
        const savedPath = localStorage.getItem(`onboarding_path_${orgSlug}`);
        if (savedPath === "start_building" || savedPath === "connect_aws") {
          setOnboardingPath(savedPath);
        }
      }
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
      router.push(`/${orgSlug}`);
    }
  };

  // Called when AWS account is connected (CLI polling or CloudFormation validation)
  const handleConnected = () => {
    setIsInfrastructureConnected(true);
    // Advance to Success step (step 5)
    setCurrentStep(5);
  };

  const handleComplete = completeOnboarding;

  return (
    <div className="space-y-8">
      {/* Progress Indicator */}
      <StepProgress
        currentStep={displayStep}
        steps={visibleSteps.map((s) => s.title)}
      />

      {/* Current Step Content */}
      <CurrentStepComponent
        isConnected={isInfrastructureConnected}
        onBack={handleBack}
        onComplete={handleComplete}
        onConnected={handleConnected}
        onNext={handleNext}
        onSkip={handleSkip}
        organizationId={currentOrg.id}
        orgName={currentOrg.name}
        orgSlug={orgSlug}
        selfHosted={isSelfHosted}
      />
    </div>
  );
}
