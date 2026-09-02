import { headers } from "next/headers";

export type AuditLogAction =
  | "member.invited"
  | "member.invite_accepted"
  | "member.invite_cancelled"
  | "member.removed"
  | "member.role_changed"
  | "resource.deployed"
  | "resource.deleted"
  | "api_key.created"
  | "api_key.revoked"
  | "settings.updated"
  | "audit_log.exported"
  | "plan.changed"
  | "domain.verified"
  | "auth.login"
  | "auth.login_failed"
  | "auth.password_reset"
  | "template.created"
  | "template.updated"
  | "template.published"
  | "template.unpublished"
  | "template.deleted"
  | "template.type_updated"
  | "template.status_updated"
  | "template.converted"
  | "template.version_restored"
  | "brand_kit.created"
  | "brand_kit.updated"
  | "brand_kit.deleted"
  | "brand_kit.set_default"
  | "block.created"
  | "contact.created"
  | "contact.updated"
  | "contact.deleted"
  | "contact.created_bulk"
  | "contact.deleted_bulk"
  | "contact.imported"
  | "segment.created"
  | "segment.updated"
  | "segment.deleted"
  | "segment.split"
  | "topic.created"
  | "topic.updated"
  | "topic.deleted"
  | "broadcast.sent"
  | "broadcast.draft_saved"
  | "broadcast.draft_updated"
  | "broadcast.sent_from_draft"
  | "broadcast.draft_deleted"
  | "broadcast.duplicated"
  | "broadcast.cancelled"
  | "broadcast.resumed"
  | "sso.provider_saved"
  | "sso.provider_deleted"
  | "sso.domain_verification_requested"
  | "sso.domain_verified"
  | "sso.scim_token_generated"
  | "workflow.created"
  | "workflow.updated"
  | "workflow.deleted"
  | "workflow.enabled"
  | "workflow.disabled"
  | "workflow.duplicated"
  | "org.created"
  | "permissions.granted"
  | "permissions.revoked"
  | "contact.topic_subscribed"
  | "contact.topic_unsubscribed"
  | "contact.topics_bulk_subscribed"
  | "contact.topics_bulk_unsubscribed"
  | "settings.sender_defaults_updated"
  | "settings.webhook_secret_saved"
  | "settings.webhook_secret_removed"
  | "settings.daily_quota_reserve_saved"
  | "block.updated"
  | "block.deleted"
  | "template.duplicated"
  | "template.version_created"
  | "agent.created"
  | "agent.killed"
  | "agent.send_pending"
  | "agent.send_approved"
  | "agent.send_rejected"
  | "agent.send_blocked";

export async function getAuditContext(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  const hdrs = await headers();
  const forwarded = hdrs.get("x-forwarded-for");
  return {
    ipAddress: forwarded ? forwarded.split(",")[0].trim() : null,
    userAgent: hdrs.get("user-agent"),
  };
}

export function auditLogEntry(
  ctx: { ipAddress: string | null; userAgent: string | null },
  params: {
    organizationId: string;
    actorId: string;
    actorEmail: string;
    action: AuditLogAction;
    resource: string;
    resourceId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  return {
    organizationId: params.organizationId,
    userId: params.actorId,
    actorEmail: params.actorEmail,
    action: params.action,
    resource: params.resource,
    resourceId: params.resourceId ?? null,
    metadata: params.metadata ?? null,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  };
}
