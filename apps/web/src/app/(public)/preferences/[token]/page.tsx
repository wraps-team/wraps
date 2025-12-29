import { contact, contactTopic, db, eq, organization, topic } from "@wraps/db";
import { and } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token";
import { PreferencesForm } from "./preferences-form";

export const metadata: Metadata = {
  title: "Email Preferences",
  description: "Manage your email subscription preferences",
};

interface PreferencesPageProps {
  params: Promise<{
    token: string;
  }>;
}

export default async function PreferencesPage({
  params,
}: PreferencesPageProps) {
  const { token } = await params;

  // Verify token
  const payload = await verifyUnsubscribeToken(token);
  if (!payload) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-4 font-bold text-2xl text-red-600">
          Invalid or Expired Link
        </h1>
        <p className="text-gray-600">
          This preferences link is no longer valid. It may have expired or
          already been used.
        </p>
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

  // Load organization
  const [org] = await db
    .select({
      name: organization.name,
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

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div className="mb-8 text-center">
        <h1 className="mb-2 font-bold text-2xl">Email Preferences</h1>
        <p className="text-gray-600">
          Manage email preferences for{" "}
          <span className="font-medium">{maskedEmail}</span>
          {org?.name && (
            <>
              {" "}
              from <span className="font-medium">{org.name}</span>
            </>
          )}
        </p>
      </div>

      <PreferencesForm
        contactId={contactId}
        isGloballyUnsubscribed={contactRecord.emailStatus === "unsubscribed"}
        organizationId={organizationId}
        token={token}
        topics={topicsWithStatus}
      />
    </div>
  );
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!(local && domain)) return email;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}
