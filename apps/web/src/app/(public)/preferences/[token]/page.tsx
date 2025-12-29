import { contact, contactTopic, db, eq, organization, topic } from "@wraps/db";
import { and } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token";
import { PreferencesForm } from "./preferences-form";

interface PreferencesPageProps {
  params: Promise<{
    token: string;
  }>;
}

export async function generateMetadata({
  params,
}: PreferencesPageProps): Promise<Metadata> {
  const { token } = await params;
  const payload = await verifyUnsubscribeToken(token);

  if (!payload) {
    return { title: "Email Preferences" };
  }

  const [org] = await db
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, payload.oid))
    .limit(1);

  return {
    title: org?.name ? `Email Preferences - ${org.name}` : "Email Preferences",
    description: "Manage your email subscription preferences",
  };
}

export default async function PreferencesPage({
  params,
}: PreferencesPageProps) {
  const { token } = await params;

  // Verify token
  const payload = await verifyUnsubscribeToken(token);
  if (!payload) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <svg
              className="h-6 w-6 text-red-500"
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
          <h1 className="mb-2 font-semibold text-gray-900 text-xl">
            Link Expired
          </h1>
          <p className="text-gray-500 text-sm">
            This preferences link is no longer valid. Please use the link from a
            more recent email.
          </p>
        </div>
      </div>
    );
  }

  const { cid: contactId, oid: organizationId } = payload;

  // Load contact
  const [contactRecord] = await db
    .select({
      id: contact.id,
      email: contact.email,
      emailStatus: contact.emailStatus,
    })
    .from(contact)
    .where(
      and(eq(contact.id, contactId), eq(contact.organizationId, organizationId))
    )
    .limit(1);

  if (!contactRecord) {
    notFound();
  }

  // Load organization with branding
  const [org] = await db
    .select({
      name: organization.name,
      logo: organization.logo,
      brandColor: organization.brandColor,
    })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);

  // Load public topics for this organization
  const topics = await db
    .select({
      id: topic.id,
      name: topic.name,
      description: topic.description,
    })
    .from(topic)
    .where(
      and(eq(topic.organizationId, organizationId), eq(topic.public, true))
    );

  // Load contact's topic subscriptions
  const subscriptions = await db
    .select({
      topicId: contactTopic.topicId,
      status: contactTopic.status,
    })
    .from(contactTopic)
    .where(eq(contactTopic.contactId, contactId));

  // Build topic list with subscription status
  const topicsWithStatus = topics.map((t) => {
    const sub = subscriptions.find((s) => s.topicId === t.id);
    return {
      ...t,
      subscribed: sub?.status === "subscribed",
    };
  });

  const maskedEmail = contactRecord.email
    ? maskEmail(contactRecord.email)
    : "your email";

  const brandColor = org?.brandColor || "#3b82f6"; // Default to blue

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header with branding */}
        <div className="mb-8 text-center">
          {org?.logo ? (
            <img
              alt={org.name || "Company logo"}
              className="mx-auto mb-6 h-12 w-auto"
              src={org.logo}
            />
          ) : org?.name ? (
            <div
              className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl font-semibold text-lg text-white"
              style={{ backgroundColor: brandColor }}
            >
              {org.name.charAt(0).toUpperCase()}
            </div>
          ) : null}

          <h1 className="mb-2 font-semibold text-2xl text-gray-900 tracking-tight">
            Email Preferences
          </h1>
          <p className="text-gray-500 text-sm">
            Manage subscriptions for{" "}
            <span className="font-medium text-gray-700">{maskedEmail}</span>
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <PreferencesForm
            brandColor={brandColor}
            contactId={contactId}
            isGloballyUnsubscribed={
              contactRecord.emailStatus === "unsubscribed"
            }
            organizationId={organizationId}
            orgName={org?.name || undefined}
            token={token}
            topics={topicsWithStatus}
          />
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-gray-400 text-xs">
          You can update your preferences anytime using the link in our emails.
        </p>
      </div>
    </div>
  );
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!(local && domain)) return email;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}
