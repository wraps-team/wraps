import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface InvitationErrorPageProps {
  searchParams: Promise<{
    message?: string;
  }>;
}

export default async function InvitationErrorPage({
  searchParams,
}: InvitationErrorPageProps) {
  const { message } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Invitation Error</CardTitle>
          <CardDescription>
            {message || "There was a problem with this invitation"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-amber-900 text-sm">
              If you believe this is an error, please contact the person who
              invited you or reach out to support.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link href="/dashboard">Go to Dashboard</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/auth">Sign In</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export async function generateMetadata() {
  return {
    title: "Invitation Error | Wraps",
    description: "There was a problem with your invitation",
  };
}
