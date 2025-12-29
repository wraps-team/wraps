/**
 * Unsubscribe Routes
 *
 * RFC 8058 compliant one-click unsubscribe endpoints.
 *
 * POST /unsubscribe/:token - One-click unsubscribe (RFC 8058)
 * GET /unsubscribe/:token - Unsubscribe confirmation page
 */

import { contact, contactTopic, db, eq, topic } from "@wraps/db";
import { and, sql } from "drizzle-orm";
import { Elysia, t } from "elysia";
import { verifyUnsubscribeToken } from "../lib/unsubscribe-token";

export const unsubscribeRoutes = new Elysia({ prefix: "/unsubscribe" })
  /**
   * POST /unsubscribe/:token
   *
   * RFC 8058 one-click unsubscribe endpoint.
   * Handles both:
   * - RFC 8058: Content-Type: application/x-www-form-urlencoded, body: "List-Unsubscribe=One-Click"
   * - Regular form: JSON or form body
   *
   * IMPORTANT: Must return 200 OK directly, NO redirects (RFC 8058 requirement)
   */
  .post(
    "/:token",
    async ({ params, body, headers, set }) => {
      const { token } = params;
      const contentType = headers["content-type"] || "";

      // 1. Verify the token
      const payload = await verifyUnsubscribeToken(token);
      if (!payload) {
        set.status = 400;
        return { error: "Invalid or expired unsubscribe link" };
      }

      const { cid: contactId, oid: organizationId, tid: topicId } = payload;

      // 2. Verify the contact exists and belongs to the organization
      const [existingContact] = await db
        .select({
          id: contact.id,
          email: contact.email,
          emailStatus: contact.emailStatus,
        })
        .from(contact)
        .where(
          and(
            eq(contact.id, contactId),
            eq(contact.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!existingContact) {
        set.status = 404;
        return { error: "Contact not found" };
      }

      // 3. Check if this is RFC 8058 one-click unsubscribe
      // RFC 8058 sends: Content-Type: application/x-www-form-urlencoded
      // Body: List-Unsubscribe=One-Click
      const bodyStr = typeof body === "string" ? body : String(body ?? "");
      const isOneClick =
        contentType.includes("application/x-www-form-urlencoded") &&
        bodyStr.includes("List-Unsubscribe=One-Click");

      // 4. Process unsubscribe based on whether it's topic-specific or global
      const now = new Date();

      if (topicId) {
        // Topic-specific unsubscribe
        await db
          .update(contactTopic)
          .set({
            status: "unsubscribed",
            unsubscribedAt: now,
          })
          .where(
            and(
              eq(contactTopic.contactId, contactId),
              eq(contactTopic.topicId, topicId)
            )
          );

        // Decrement topic subscriber count
        await db
          .update(topic)
          .set({
            subscriberCount: sql`GREATEST(0, ${topic.subscriberCount} - 1)`,
          })
          .where(eq(topic.id, topicId));

        console.log(
          `[UNSUBSCRIBE] Contact ${contactId} unsubscribed from topic ${topicId}`
        );
      } else {
        // Global unsubscribe - unsubscribe from all email communications
        await db
          .update(contact)
          .set({
            emailStatus: "unsubscribed",
            emailUnsubscribedAt: now,
          })
          .where(eq(contact.id, contactId));

        // Also unsubscribe from all topics
        await db
          .update(contactTopic)
          .set({
            status: "unsubscribed",
            unsubscribedAt: now,
          })
          .where(eq(contactTopic.contactId, contactId));

        console.log(`[UNSUBSCRIBE] Contact ${contactId} unsubscribed globally`);
      }

      // 5. Return success (no redirect per RFC 8058)
      // For one-click, just return 200 OK
      if (isOneClick) {
        set.status = 200;
        return { success: true, message: "Unsubscribed successfully" };
      }

      // For regular requests, return more details
      return {
        success: true,
        message: topicId
          ? "You have been unsubscribed from this topic."
          : "You have been unsubscribed from all emails.",
        contactId,
        topicId,
      };
    },
    {
      params: t.Object({
        token: t.String(),
      }),
      // Accept any body type for flexibility (RFC 8058 sends form-urlencoded)
      body: t.Optional(t.Unknown()),
      detail: {
        tags: ["unsubscribe"],
        summary: "One-click unsubscribe (RFC 8058)",
        description:
          "Processes unsubscribe requests. Supports RFC 8058 one-click unsubscribe via POST with body 'List-Unsubscribe=One-Click'. Returns 200 OK directly (no redirects per RFC 8058 spec).",
      },
    }
  )

  /**
   * GET /unsubscribe/:token
   *
   * Unsubscribe confirmation/landing page.
   * Shows a simple HTML page confirming the unsubscribe action.
   * Useful for users who click the unsubscribe link in the email footer.
   */
  .get(
    "/:token",
    async ({ params, set }) => {
      const { token } = params;

      // 1. Verify the token
      const payload = await verifyUnsubscribeToken(token);
      if (!payload) {
        set.status = 400;
        set.headers["content-type"] = "text/html; charset=utf-8";
        return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invalid Link - Wraps</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
    h1 { color: #dc2626; }
    p { color: #6b7280; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>Invalid or Expired Link</h1>
  <p>This unsubscribe link is no longer valid. It may have expired or already been used.</p>
  <p>If you continue to receive unwanted emails, please contact support.</p>
</body>
</html>`;
      }

      const { cid: contactId, oid: organizationId, tid: topicId } = payload;

      // 2. Get contact info
      const [existingContact] = await db
        .select({
          id: contact.id,
          email: contact.email,
          emailStatus: contact.emailStatus,
        })
        .from(contact)
        .where(
          and(
            eq(contact.id, contactId),
            eq(contact.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!existingContact) {
        set.status = 404;
        set.headers["content-type"] = "text/html; charset=utf-8";
        return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Not Found - Wraps</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
    h1 { color: #dc2626; }
    p { color: #6b7280; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>Contact Not Found</h1>
  <p>We couldn't find your subscription. You may have already been unsubscribed.</p>
</body>
</html>`;
      }

      // 3. Get topic name if topic-specific
      let topicName = "";
      if (topicId) {
        const [topicRecord] = await db
          .select({ name: topic.name })
          .from(topic)
          .where(eq(topic.id, topicId))
          .limit(1);
        topicName = topicRecord?.name || "this topic";
      }

      // 4. Return HTML confirmation page with form
      set.headers["content-type"] = "text/html; charset=utf-8";
      const maskedEmail = existingContact.email
        ? maskEmail(existingContact.email)
        : "your email";

      return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe - Wraps</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
    h1 { color: #111827; margin-bottom: 16px; }
    p { color: #6b7280; line-height: 1.6; margin-bottom: 24px; }
    .email { font-weight: 600; color: #111827; }
    .topic { font-weight: 600; color: #4f46e5; }
    button { background: #dc2626; color: white; border: none; padding: 12px 32px; font-size: 16px; border-radius: 8px; cursor: pointer; }
    button:hover { background: #b91c1c; }
    .success { display: none; }
    .success h1 { color: #059669; }
  </style>
</head>
<body>
  <div class="form">
    <h1>Unsubscribe</h1>
    <p>
      You are about to unsubscribe <span class="email">${maskedEmail}</span>
      ${topicId ? ` from <span class="topic">${topicName}</span>` : " from all email communications"}.
    </p>
    <form method="POST" action="/unsubscribe/${token}">
      <button type="submit">Confirm Unsubscribe</button>
    </form>
  </div>
  <div class="success">
    <h1>Unsubscribed</h1>
    <p>You have been successfully unsubscribed. You will no longer receive ${topicId ? `emails about ${topicName}` : "marketing emails from us"}.</p>
  </div>
  <script>
    document.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const res = await fetch('/unsubscribe/${token}', { method: 'POST' });
        if (res.ok) {
          document.querySelector('.form').style.display = 'none';
          document.querySelector('.success').style.display = 'block';
        }
      } catch (err) {
        alert('Failed to unsubscribe. Please try again.');
      }
    });
  </script>
</body>
</html>`;
    },
    {
      params: t.Object({
        token: t.String(),
      }),
      detail: {
        tags: ["unsubscribe"],
        summary: "Unsubscribe confirmation page",
        description:
          "Shows a confirmation page for users who click the unsubscribe link in emails. Displays a form to confirm the unsubscribe action.",
      },
    }
  );

/**
 * Mask an email address for privacy (e.g., "j***@example.com")
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!(local && domain)) return email;
  if (local.length <= 2) return `${local[0]}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}
