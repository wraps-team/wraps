import {
  contact,
  contactTopic,
  db,
  eq,
  organization,
  topic,
  topicSettings,
} from "@wraps/db";
import { verifyConfirmationToken } from "@wraps/email";
import { and } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PreferenceCenterShell } from "@/components/preference-center/shell";
import { PreferenceThemeToggle } from "@/components/preference-center/theme-toggle";
import { resolvePreferenceCenterTheme } from "@/lib/preference-theme/resolve";
import { ConfirmationForm } from "./confirmation-form";

type ConfirmPageProps = {
  params: Promise<{
    token: string;
  }>;
};

export async function generateMetadata({
  params,
}: ConfirmPageProps): Promise<Metadata> {
  const { token } = await params;
  const payload = await verifyConfirmationToken(token);

  if (!payload) {
    return { title: "Confirm Subscription" };
  }

  // biome-ignore lint/plugin: payload.tid comes from a cryptographically verified confirmation token (verifyConfirmationToken) — this public, token-authenticated route has no org session; the token itself is the authorization, and only the topic's display name is read here.
  const [topicRecord] = await db
    .select({ name: topic.name })
    .from(topic)
    .where(eq(topic.id, payload.tid))
    .limit(1);

  return {
    title: topicRecord?.name
      ? `Confirm Subscription - ${topicRecord.name}`
      : "Confirm Subscription",
    description: "Confirm your email subscription",
  };
}

export default async function ConfirmPage({ params }: ConfirmPageProps) {
  const { token } = await params;

  // Verify token
  const payload = await verifyConfirmationToken(token);
  if (!payload) {
    // No org context is available before token verification, so this
    // branch is intentionally NOT themed — it renders on the app's default
    // tokens rather than any organization's preference center theme.
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <svg
              className="h-6 w-6 text-destructive"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
            </svg>
          </div>
          <h1 className="mb-2 font-semibold text-foreground text-xl">
            Link Expired
          </h1>
          <p className="text-muted-foreground text-sm">
            This confirmation link has expired. Please request a new
            confirmation email from the subscription page.
          </p>
        </div>
      </div>
    );
  }

  const { cid: contactId, oid: organizationId, tid: topicId } = payload;

  // Load contact
  const [contactRecord] = await db
    .select({
      id: contact.id,
      email: contact.email,
    })
    .from(contact)
    .where(
      and(eq(contact.id, contactId), eq(contact.organizationId, organizationId))
    )
    .limit(1);

  if (!contactRecord) {
    notFound();
  }

  // Load topic
  const [topicRecord] = await db
    .select({
      id: topic.id,
      name: topic.name,
      description: topic.description,
    })
    .from(topic)
    .where(and(eq(topic.id, topicId), eq(topic.organizationId, organizationId)))
    .limit(1);

  if (!topicRecord) {
    notFound();
  }

  // Load organization with branding and theme (single query with left join)
  // Join condition includes explicit org check for defense in depth
  const [org] = await db
    .select({
      name: organization.name,
      logo: organization.logo,
      brandColor: organization.brandColor,
      preferenceCenterLogo: topicSettings.preferenceCenterLogo,
      preferenceCenterTheme: topicSettings.preferenceCenterTheme,
    })
    .from(organization)
    .leftJoin(
      topicSettings,
      and(
        eq(organization.id, topicSettings.organizationId),
        eq(topicSettings.organizationId, organizationId) // defense in depth
      )
    )
    .where(eq(organization.id, organizationId))
    .limit(1);

  // Check current subscription status
  const [subscription] = await db
    .select({
      status: contactTopic.status,
      confirmedAt: contactTopic.confirmedAt,
    })
    .from(contactTopic)
    .where(
      and(
        eq(contactTopic.contactId, contactId),
        eq(contactTopic.topicId, topicId)
      )
    )
    .limit(1);

  const isAlreadyConfirmed =
    subscription?.status === "subscribed" && subscription.confirmedAt !== null;

  const maskedEmail = contactRecord.email
    ? maskEmail(contactRecord.email)
    : "your email";

  const theme = resolvePreferenceCenterTheme({
    theme: org?.preferenceCenterTheme ?? null,
    brandColor: org?.brandColor ?? null,
  });

  return (
    <PreferenceCenterShell
      description={
        isAlreadyConfirmed ? (
          <>
            <span className="font-medium text-foreground">{maskedEmail}</span>{" "}
            is already subscribed to this topic.
          </>
        ) : (
          <>
            Confirm subscription for{" "}
            <span className="font-medium text-foreground">{maskedEmail}</span>
          </>
        )
      }
      logo={org?.preferenceCenterLogo ?? org?.logo}
      orgName={org?.name}
      theme={theme}
      title={isAlreadyConfirmed ? "Already Subscribed" : "Confirm Subscription"}
    >
      {/* Topic info */}
      <div className="mb-6 rounded-xl bg-muted p-4">
        <h2 className="font-medium text-foreground">{topicRecord.name}</h2>
        {topicRecord.description && (
          <p className="mt-1 text-muted-foreground text-sm">
            {topicRecord.description}
          </p>
        )}
      </div>

      {isAlreadyConfirmed ? (
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
            <svg
              className="h-5 w-5 text-success"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M5 13l4 4L19 7"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
            </svg>
          </div>
          <p className="text-muted-foreground text-sm">
            You're already subscribed to this topic. You'll continue receiving
            updates.
          </p>
        </div>
      ) : (
        <ConfirmationForm token={token} />
      )}
      {theme.colorScheme === "system" && <PreferenceThemeToggle />}
    </PreferenceCenterShell>
  );
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!(local && domain)) {
    return email;
  }
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local.at(-1)}@${domain}`;
}
