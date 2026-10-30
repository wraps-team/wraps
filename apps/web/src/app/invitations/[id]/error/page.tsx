import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { AlertCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type InvitationErrorPageProps = {
  searchParams: Promise<{
    message?: string;
  }>;
};

export default async function InvitationErrorPage({
  searchParams,
}: InvitationErrorPageProps) {
  const { message } = await searchParams;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted p-4">
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
          <div className="rounded-lg border border-warning/30 bg-warning/15 p-4">
            <p className="text-warning text-sm">
              If you believe this is an error, please contact the person who
              invited you or reach out to support.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link href="/">Go to Dashboard</Link>
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
