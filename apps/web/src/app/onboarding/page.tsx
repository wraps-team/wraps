"use client";

import { useRouter } from "next/navigation";
import { CreateOrganizationForm } from "@/components/forms/create-organization-form";
import Loader from "@/components/loader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  // Redirect to auth if not logged in
  if (!(isPending || session)) {
    router.push("/auth");
    return null;
  }

  if (isPending) {
    return <Loader fullScreen />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Create Your Organization</CardTitle>
          <CardDescription>
            Let's set up your workspace to get started with Wraps
          </CardDescription>
        </CardHeader>

        <CardContent>
          <CreateOrganizationForm />
        </CardContent>
      </Card>
    </div>
  );
}
