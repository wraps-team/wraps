// Pipeline step data - icons are referenced by name, mapped in client components
export const pipelineSteps = [
  {
    id: "sender",
    label: "Sender",
    iconName: "Mail" as const,
    description: "Email arrives at your domain",
  },
  {
    id: "ses",
    label: "SES",
    iconName: "Cloud" as const,
    description: "AWS receives and validates",
  },
  {
    id: "s3",
    label: "S3",
    iconName: "HardDrive" as const,
    description: "Raw email stored securely",
  },
  {
    id: "lambda",
    label: "Lambda",
    iconName: "Code2" as const,
    description: "Parse headers & attachments",
  },
  {
    id: "eventbridge",
    label: "EventBridge",
    iconName: "Zap" as const,
    description: "Trigger webhooks & rules",
  },
  {
    id: "app",
    label: "Your App",
    iconName: "Database" as const,
    description: "Process and respond",
  },
];

export const useCases = [
  {
    id: "support",
    iconName: "Headphones" as const,
    title: "Support Inbox",
    description:
      "Auto-create tickets from customer emails. Route by subject, extract order IDs, and assign to teams.",
    code: `// EventBridge handler
const ticket = await linear.createIssue({
  title: email.subject,
  description: email.text,
  teamId: routeToTeam(email.from),
});`,
  },
  {
    id: "orders",
    iconName: "Package" as const,
    title: "Order Processing",
    description:
      "Parse order confirmations, extract tracking numbers, and update your database automatically.",
    code: `// Parse order email
const tracking = extractTracking(email.html);
await db.orders.update({
  where: { email: email.from },
  data: { trackingNumber: tracking },
});`,
  },
  {
    id: "tickets",
    iconName: "FileText" as const,
    title: "Email-to-Ticket",
    description:
      "Integrate with Jira, Linear, GitHub Issues, or any ticketing system via webhooks.",
    code: `// Create GitHub issue
await octokit.issues.create({
  owner: 'your-org',
  repo: 'support',
  title: email.subject,
  body: email.html,
});`,
  },
  {
    id: "autorespond",
    iconName: "Mail" as const,
    title: "Auto-Responders",
    description:
      "Send acknowledgments, out-of-office replies, or follow-up sequences automatically.",
    code: `// Auto-acknowledge
await email.inbox.reply(emailId, {
  from: 'support@yourapp.com',
  html: \`Thanks for reaching out!
We'll respond within 24h.\`,
});`,
  },
  {
    id: "leads",
    iconName: "Users" as const,
    title: "Lead Capture",
    description:
      "Extract contact information from inquiries and sync to your CRM or marketing automation.",
    code: `// Sync to CRM
await hubspot.contacts.create({
  email: email.from.address,
  firstname: email.from.name,
  source: 'inbound_email',
});`,
  },
  {
    id: "documents",
    iconName: "MessageSquare" as const,
    title: "Document Processing",
    description:
      "Extract attachments, process PDFs, and trigger document workflows from the email.received event.",
    code: `// Presigned URL per attachment
for (const att of inbound.attachments) {
  const url = await email.inbox
    .getAttachment(inbound.emailId, att.id);
  await processDocument(url);
}`,
  },
];

export const codeExamples = {
  list: {
    label: "List",
    filename: "list-emails.ts",
    code: `import { WrapsEmail } from '@wraps.dev/email';

const email = new WrapsEmail({
  inboxBucketName: 'your-inbound-bucket',
});

// List returns summaries: emailId, key, size, lastModified
const { emails, nextToken } = await email.inbox.list({
  maxResults: 20,
});

for (const summary of emails) {
  const msg = await email.inbox.get(summary.emailId);
  console.log(\`\${msg.from.address}: \${msg.subject}\`);
}

// Next page: list({ continuationToken: nextToken })`,
  },
  get: {
    label: "Get",
    filename: "get-email.ts",
    code: `// Get full email details
const inbound = await email.inbox.get('inb_a1b2c3d4e5f6');

console.log('From:', inbound.from.name, inbound.from.address);
console.log('Subject:', inbound.subject);
console.log('HTML:', inbound.html);
console.log('Text:', inbound.text);

// Access attachments
for (const att of inbound.attachments) {
  console.log(\`Attachment: \${att.filename} (\${att.size} bytes)\`);
}

// Check spam/virus verdicts
if (inbound.spamVerdict === 'PASS') {
  // Safe to process
}`,
  },
  reply: {
    label: "Reply",
    filename: "reply-email.ts",
    code: `// Reply with proper threading headers
await email.inbox.reply('inb_a1b2c3d4e5f6', {
  from: 'support@yourapp.com',
  html: \`
    <p>Thanks for reaching out!</p>
    <p>We've received your message and will respond within 24 hours.</p>
    <p>Best,<br/>The Support Team</p>
  \`,
});

// Threading headers (In-Reply-To, References) are
// automatically set to maintain the email chain`,
  },
  forward: {
    label: "Forward",
    filename: "forward-email.ts",
    code: `// Forward to your team. Passthrough is the default:
// the raw MIME is sent on, so the original body and
// attachments are preserved.
await email.inbox.forward('inb_a1b2c3d4e5f6', {
  to: 'team@yourcompany.com',
  from: 'forwarding@yourapp.com',
  addPrefix: 'Fwd:',
});

// Or wrap the original in a new message with your note
await email.inbox.forward('inb_a1b2c3d4e5f6', {
  to: 'team@yourcompany.com',
  from: 'forwarding@yourapp.com',
  passthrough: false,
  text: 'Please review this customer inquiry.',
});`,
  },
  webhook: {
    label: "Webhook",
    filename: "eventbridge-handler.ts",
    code: `// EventBridge Lambda handler
export const handler = async (event: EventBridgeEvent) => {
  const email = event.detail;

  // Route on who SES delivered to (covers Bcc and forwards).
  // Mail from before the upgrade has no envelopeRecipients.
  const recipients =
    email.envelopeRecipients ??
    (email.to ?? []).map((t) => t.address.toLowerCase());
  if (recipients.some((r) => r.startsWith('support@'))) {
    await createSupportTicket(email);
  } else if (recipients.some((r) => r.startsWith('sales@'))) {
    await notifySalesTeam(email);
  }

  // Process attachments
  if (email.attachments?.length) {
    await processAttachments(email);
  }

  return { statusCode: 200 };
};`,
  },
};

// Architecture nodes for server-side rendering
export const architectureNodesData = [
  {
    id: "ses",
    label: "SES Receipt",
    sublabel: "MX Records",
    iconName: "Cloud" as const,
  },
  {
    id: "s3",
    label: "S3 Bucket",
    sublabel: "Raw Storage",
    iconName: "HardDrive" as const,
  },
  {
    id: "lambda",
    label: "Lambda",
    sublabel: "Parser",
    iconName: "Code2" as const,
  },
  {
    id: "eventbridge",
    label: "EventBridge",
    sublabel: "Webhooks",
    iconName: "Zap" as const,
  },
];

export type PipelineStep = (typeof pipelineSteps)[number];
export type UseCase = (typeof useCases)[number];
export type CodeExample = (typeof codeExamples)[keyof typeof codeExamples];
export type ArchitectureNode = (typeof architectureNodesData)[number];

// Icon name types for mapping
export type IconName =
  | "Mail"
  | "Cloud"
  | "HardDrive"
  | "Code2"
  | "Zap"
  | "Database"
  | "Headphones"
  | "Package"
  | "FileText"
  | "Users"
  | "MessageSquare";
