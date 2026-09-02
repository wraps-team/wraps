import type { auditLog, BroadcastRecipientRow } from "@wraps/db";
import type { EmailListItem } from "@/app/(dashboard)/[orgSlug]/emails/types";
import type { SMSListItem } from "@/app/(dashboard)/[orgSlug]/sms/types";
import type { BatchSendWithMeta } from "@/lib/batch";
import type { ContactWithMeta } from "@/lib/contacts";
import type { EventWithContact } from "@/lib/events";
import type { CSVColumnDef } from "./csv-export";

export const emailCSVColumns: CSVColumnDef<EmailListItem>[] = [
  { header: "Message ID", accessor: (r) => r.messageId },
  { header: "From", accessor: (r) => r.from },
  { header: "To", accessor: (r) => r.to.join("; ") },
  { header: "Subject", accessor: (r) => r.subject },
  { header: "Status", accessor: (r) => r.status },
  { header: "Sent At", accessor: (r) => new Date(r.sentAt).toISOString() },
  { header: "Events", accessor: (r) => r.eventCount },
  { header: "Opened", accessor: (r) => (r.hasOpened ? "Yes" : "No") },
  { header: "Clicked", accessor: (r) => (r.hasClicked ? "Yes" : "No") },
];

export const smsCSVColumns: CSVColumnDef<SMSListItem>[] = [
  { header: "Destination Number", accessor: (r) => r.destinationNumber },
  { header: "Origination Number", accessor: (r) => r.originationNumber },
  { header: "Status", accessor: (r) => r.status },
  { header: "Sent At", accessor: (r) => new Date(r.sentAt).toISOString() },
];

export const contactCSVColumns: CSVColumnDef<ContactWithMeta>[] = [
  { header: "Email", accessor: (r) => r.email },
  { header: "Phone", accessor: (r) => r.phone },
  { header: "First Name", accessor: (r) => r.firstName },
  { header: "Last Name", accessor: (r) => r.lastName },
  { header: "Company", accessor: (r) => r.company },
  { header: "Job Title", accessor: (r) => r.jobTitle },
  { header: "Email Status", accessor: (r) => r.emailStatus },
  { header: "SMS Status", accessor: (r) => r.smsStatus },
  { header: "Emails Sent", accessor: (r) => r.emailsSent },
  { header: "Emails Opened", accessor: (r) => r.emailsOpened },
  { header: "Emails Clicked", accessor: (r) => r.emailsClicked },
  { header: "SMS Sent", accessor: (r) => r.smsSent },
  {
    header: "Topics",
    accessor: (r) => r.topics?.map((t) => t.topicName).join(", ") ?? "",
  },
  {
    header: "Created At",
    accessor: (r) => (r.createdAt ? new Date(r.createdAt).toISOString() : ""),
  },
];

export const broadcastCSVColumns: CSVColumnDef<BatchSendWithMeta>[] = [
  { header: "Name", accessor: (r) => r.name },
  { header: "Channel", accessor: (r) => r.channel },
  { header: "Status", accessor: (r) => r.status },
  { header: "Subject", accessor: (r) => r.subject },
  { header: "Total Recipients", accessor: (r) => r.totalRecipients },
  { header: "Sent", accessor: (r) => r.sent },
  { header: "Delivered", accessor: (r) => r.delivered },
  { header: "Opened", accessor: (r) => r.opened },
  { header: "Clicked", accessor: (r) => r.clicked },
  { header: "Bounced", accessor: (r) => r.bounced },
  { header: "Complained", accessor: (r) => r.complained },
  { header: "Failed", accessor: (r) => r.failed },
  {
    header: "Created At",
    accessor: (r) => (r.createdAt ? new Date(r.createdAt).toISOString() : ""),
  },
];

export const broadcastRecipientCSVColumns: CSVColumnDef<BroadcastRecipientRow>[] =
  [
    { header: "Recipient", accessor: (r) => r.recipient },
    { header: "Status", accessor: (r) => r.status },
    { header: "Error", accessor: (r) => r.error },
    { header: "Bounce Type", accessor: (r) => r.bounceType },
    { header: "Bounce Subtype", accessor: (r) => r.bounceSubType },
    {
      header: "Sent At",
      accessor: (r) => (r.sentAt ? new Date(r.sentAt).toISOString() : ""),
    },
  ];

export const auditLogCSVColumns: CSVColumnDef<typeof auditLog.$inferSelect>[] =
  [
    {
      header: "Timestamp",
      accessor: (r) => new Date(r.createdAt).toISOString(),
    },
    { header: "Action", accessor: (r) => r.action },
    { header: "Resource", accessor: (r) => r.resource },
    { header: "Resource ID", accessor: (r) => r.resourceId },
    { header: "Actor Email", accessor: (r) => r.actorEmail },
    { header: "Actor ID", accessor: (r) => r.userId },
    { header: "IP Address", accessor: (r) => r.ipAddress },
    { header: "User Agent", accessor: (r) => r.userAgent },
    {
      header: "Metadata",
      accessor: (r) => (r.metadata ? JSON.stringify(r.metadata) : ""),
    },
  ];

export const eventCSVColumns: CSVColumnDef<EventWithContact>[] = [
  { header: "Event Name", accessor: (r) => r.eventName },
  { header: "Contact Email", accessor: (r) => r.contactEmail },
  { header: "Contact First Name", accessor: (r) => r.contactFirstName },
  { header: "Contact Last Name", accessor: (r) => r.contactLastName },
  {
    header: "Event Data",
    accessor: (r) => (r.eventData ? JSON.stringify(r.eventData) : ""),
  },
  {
    header: "Created At",
    accessor: (r) => (r.createdAt ? new Date(r.createdAt).toISOString() : ""),
  },
];
