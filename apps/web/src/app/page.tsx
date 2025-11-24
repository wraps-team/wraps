import { auth } from "@wraps/auth";
import { db } from "@wraps/db";
import { member, organization } from "@wraps/db/schema/auth";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Metadata for the landing page
export const metadata: Metadata = {
  title: "Wraps - Email Infrastructure Made Simple",
  description:
    "Deploy production-ready email infrastructure to your AWS account in minutes. Zero stored credentials, beautiful DX, and transparent AWS pricing.",
  keywords: [
    "email infrastructure",
    "aws ses",
    "email api",
    "developer tools",
    "email service",
  ],
  openGraph: {
    title: "Wraps - Email Infrastructure Made Simple",
    description:
      "Deploy production-ready email infrastructure to your AWS account in minutes.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Wraps - Email Infrastructure Made Simple",
    description:
      "Deploy production-ready email infrastructure to your AWS account in minutes.",
  },
};

export default async function HomePage() {
  const session = await auth.api.getSession({
    headers: await import("next/headers").then((mod) => mod.headers()),
  });

  // If not authenticated, show landing page
  if (!session?.user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <div className="w-full max-w-4xl space-y-8 text-center">
          <div className="space-y-4">
            <h1 className="font-bold text-5xl tracking-tight md:text-6xl">
              Email Infrastructure
              <br />
              <span className="text-primary">Made Simple</span>
            </h1>
            <p className="mx-auto max-w-2xl text-muted-foreground text-xl">
              Deploy production-ready email infrastructure to your AWS account
              in minutes. Zero stored credentials, beautiful DX, and transparent
              AWS pricing.
            </p>
          </div>

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/auth?mode=signup">Get Started</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/auth?mode=signin">Sign In</Link>
            </Button>
          </div>

          <div className="mx-auto mt-12 grid max-w-3xl gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Zero Credentials</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Infrastructure deploys to your AWS account. We never store
                  your credentials.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">AWS Pricing</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  Pay AWS directly at $0.10 per 1,000 emails. Transparent and
                  cost-effective.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Beautiful DX</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  TypeScript SDK, real-time analytics, and intuitive dashboard.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated - get user's organizations
  const userMemberships = await db.query.member.findMany({
    where: eq(member.userId, session.user.id),
    orderBy: (members, { asc }) => [asc(members.createdAt)],
  });

  // Get the full organization details for each membership
  const userOrgs = await Promise.all(
    userMemberships.map(async (m) => {
      const org = await db.query.organization.findFirst({
        where: eq(organization.id, m.organizationId),
      });
      return { organization: org, role: m.role };
    })
  );

  // Filter out any null organizations
  const validOrgs = userOrgs.filter(
    (
      item
    ): item is {
      organization: NonNullable<typeof item.organization>;
      role: string;
    } => item.organization !== null && item.organization !== undefined
  );

  // If user has no orgs, redirect to onboarding
  if (validOrgs.length === 0) {
    redirect("/onboarding");
  }

  // If user has exactly 1 org, redirect to it
  if (validOrgs.length === 1 && validOrgs[0].organization.slug) {
    redirect(`/${validOrgs[0].organization.slug}/emails`);
  }

  // User has multiple orgs - show organization selector
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="font-bold text-3xl tracking-tight">
            Select an Organization
          </h1>
          <p className="text-muted-foreground">
            Choose an organization to access its dashboard
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {validOrgs.map(({ organization: org, role }) => (
            <Link
              className="group relative rounded-lg border bg-card p-6 transition-colors hover:bg-accent"
              href={`/${org.slug}/emails`}
              key={org.id}
            >
              <div className="flex items-start gap-4">
                {org.logo ? (
                  <Image
                    alt={org.name}
                    className="h-12 w-12 rounded-lg object-cover"
                    height={48}
                    src={org.logo}
                    width={48}
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground">
                    {org.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold group-hover:text-foreground">
                    {org.name}
                  </h3>
                  <p className="text-muted-foreground text-sm capitalize">
                    {role}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="flex justify-center">
          <Button asChild variant="outline">
            <Link href="/onboarding">Create New Organization</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
