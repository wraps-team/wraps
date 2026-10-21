"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Button } from "@wraps/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Code2,
  Layers,
  Rocket,
  Shield,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DocsLayout } from "@/components/docs-layout";
import {
  CodeBlock,
  CodeBlockBody,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockFiles,
  CodeBlockHeader,
  CodeBlockItem,
} from "@/components/ui/shadcn-io/code-block";

// ── Architecture Diagram ──────────────────────────────────────────────

const architectureDiagram = `# Email Event Flow
#
# Your App ─→ SES ─→ Configuration Set ─→ EventBridge (default bus)
#                                              │
#                                    ┌─────────┴─────────┐
#                                    │                    │
#                              Wraps Rule           Your Rules
#                                    │                    │
#                                   SQS              [targets]
#                                    │
#                                 Lambda
#                                    │
#                                DynamoDB`;

// ── Event Payloads ────────────────────────────────────────────────────

const sendPayload = `{
  "version": "0",
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "detail-type": "Email Sent",
  "source": "aws.ses",
  "account": "123456789012",
  "time": "2025-01-15T10:30:00Z",
  "region": "us-east-1",
  "resources": [],
  "detail": {
    "eventType": "Send",
    "mail": {
      "timestamp": "2025-01-15T10:30:00.000Z",
      "source": "hello@yourapp.com",
      "sourceArn": "arn:aws:ses:us-east-1:123456789012:identity/yourapp.com",
      "sendingAccountId": "123456789012",
      "messageId": "EXAMPLE7c191be45-e9aedb9a-02f9-4d12-a87d-dd0099a07f8a-000000",
      "destination": ["user@example.com"],
      "headersTruncated": false,
      "tags": {
        "ses:configuration-set": ["wraps-email-tracking"]
      }
    },
    "send": {}
  }
}`;

const deliveryPayload = `{
  "version": "0",
  "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
  "detail-type": "Email Delivered",
  "source": "aws.ses",
  "account": "123456789012",
  "time": "2025-01-15T10:30:01Z",
  "region": "us-east-1",
  "resources": [],
  "detail": {
    "eventType": "Delivery",
    "mail": {
      "timestamp": "2025-01-15T10:30:00.000Z",
      "source": "hello@yourapp.com",
      "messageId": "EXAMPLE7c191be45-e9aedb9a-02f9-4d12-a87d-dd0099a07f8a-000000",
      "destination": ["user@example.com"],
      "tags": {
        "ses:configuration-set": ["wraps-email-tracking"]
      }
    },
    "delivery": {
      "timestamp": "2025-01-15T10:30:01.000Z",
      "processingTimeMillis": 1025,
      "recipients": ["user@example.com"],
      "smtpResponse": "250 2.0.0 OK",
      "reportingMTA": "a8-21.smtp-out.amazonses.com"
    }
  }
}`;

const bouncePayload = `{
  "version": "0",
  "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
  "detail-type": "Email Bounced",
  "source": "aws.ses",
  "account": "123456789012",
  "time": "2025-01-15T10:30:02Z",
  "region": "us-east-1",
  "resources": [],
  "detail": {
    "eventType": "Bounce",
    "mail": {
      "timestamp": "2025-01-15T10:30:00.000Z",
      "source": "hello@yourapp.com",
      "messageId": "EXAMPLE7c191be45-e9aedb9a-02f9-4d12-a87d-dd0099a07f8a-000000",
      "destination": ["invalid@example.com"],
      "tags": {
        "ses:configuration-set": ["wraps-email-tracking"]
      }
    },
    "bounce": {
      "bounceType": "Permanent",
      "bounceSubType": "General",
      "bouncedRecipients": [
        {
          "emailAddress": "invalid@example.com",
          "action": "failed",
          "status": "5.1.1",
          "diagnosticCode": "smtp; 550 5.1.1 user unknown"
        }
      ],
      "timestamp": "2025-01-15T10:30:02.000Z",
      "feedbackId": "0100018d-1234-abcd-ef01-234567890abc-000000"
    }
  }
}`;

const complaintPayload = `{
  "version": "0",
  "id": "d4e5f6a7-b8c9-0123-defa-234567890123",
  "detail-type": "Email Complaint Received",
  "source": "aws.ses",
  "account": "123456789012",
  "time": "2025-01-15T12:00:00Z",
  "region": "us-east-1",
  "resources": [],
  "detail": {
    "eventType": "Complaint",
    "mail": {
      "timestamp": "2025-01-15T10:30:00.000Z",
      "source": "hello@yourapp.com",
      "messageId": "EXAMPLE7c191be45-e9aedb9a-02f9-4d12-a87d-dd0099a07f8a-000000",
      "destination": ["user@example.com"],
      "tags": {
        "ses:configuration-set": ["wraps-email-tracking"]
      }
    },
    "complaint": {
      "complainedRecipients": [
        { "emailAddress": "user@example.com" }
      ],
      "timestamp": "2025-01-15T12:00:00.000Z",
      "feedbackId": "0100018d-5678-abcd-ef01-234567890def-000000",
      "complaintSubType": null,
      "complaintFeedbackType": "abuse"
    }
  }
}`;

const openPayload = `{
  "version": "0",
  "id": "e5f6a7b8-c9d0-1234-efab-345678901234",
  "detail-type": "Email Opened",
  "source": "aws.ses",
  "account": "123456789012",
  "time": "2025-01-15T11:00:00Z",
  "region": "us-east-1",
  "resources": [],
  "detail": {
    "eventType": "Open",
    "mail": {
      "timestamp": "2025-01-15T10:30:00.000Z",
      "source": "hello@yourapp.com",
      "messageId": "EXAMPLE7c191be45-e9aedb9a-02f9-4d12-a87d-dd0099a07f8a-000000",
      "destination": ["user@example.com"],
      "tags": {
        "ses:configuration-set": ["wraps-email-tracking"]
      }
    },
    "open": {
      "timestamp": "2025-01-15T11:00:00.000Z",
      "userAgent": "Mozilla/5.0",
      "ipAddress": "198.51.100.1"
    }
  }
}`;

const clickPayload = `{
  "version": "0",
  "id": "f6a7b8c9-d0e1-2345-fabc-456789012345",
  "detail-type": "Email Clicked",
  "source": "aws.ses",
  "account": "123456789012",
  "time": "2025-01-15T11:05:00Z",
  "region": "us-east-1",
  "resources": [],
  "detail": {
    "eventType": "Click",
    "mail": {
      "timestamp": "2025-01-15T10:30:00.000Z",
      "source": "hello@yourapp.com",
      "messageId": "EXAMPLE7c191be45-e9aedb9a-02f9-4d12-a87d-dd0099a07f8a-000000",
      "destination": ["user@example.com"],
      "tags": {
        "ses:configuration-set": ["wraps-email-tracking"]
      }
    },
    "click": {
      "timestamp": "2025-01-15T11:05:00.000Z",
      "ipAddress": "198.51.100.1",
      "userAgent": "Mozilla/5.0",
      "link": "https://yourapp.com/welcome"
    }
  }
}`;

const rejectPayload = `{
  "version": "0",
  "id": "a7b8c9d0-e1f2-3456-abcd-567890123456",
  "detail-type": "Email Rejected",
  "source": "aws.ses",
  "account": "123456789012",
  "time": "2025-01-15T10:30:00Z",
  "region": "us-east-1",
  "resources": [],
  "detail": {
    "eventType": "Reject",
    "mail": {
      "timestamp": "2025-01-15T10:30:00.000Z",
      "source": "hello@yourapp.com",
      "messageId": "EXAMPLE7c191be45-e9aedb9a-02f9-4d12-a87d-dd0099a07f8a-000000",
      "destination": ["user@example.com"],
      "tags": {
        "ses:configuration-set": ["wraps-email-tracking"]
      }
    },
    "reject": {
      "reason": "VIRUS"
    }
  }
}`;

const deliveryDelayPayload = `{
  "version": "0",
  "id": "b8c9d0e1-f2a3-4567-bcde-678901234567",
  "detail-type": "Email Delivery Delayed",
  "source": "aws.ses",
  "account": "123456789012",
  "time": "2025-01-15T10:35:00Z",
  "region": "us-east-1",
  "resources": [],
  "detail": {
    "eventType": "DeliveryDelay",
    "mail": {
      "timestamp": "2025-01-15T10:30:00.000Z",
      "source": "hello@yourapp.com",
      "messageId": "EXAMPLE7c191be45-e9aedb9a-02f9-4d12-a87d-dd0099a07f8a-000000",
      "destination": ["user@example.com"],
      "tags": {
        "ses:configuration-set": ["wraps-email-tracking"]
      }
    },
    "deliveryDelay": {
      "timestamp": "2025-01-15T10:35:00.000Z",
      "delayType": "TransientCommunicationFailure",
      "expirationTime": "2025-01-15T22:30:00.000Z",
      "delayedRecipients": [
        {
          "emailAddress": "user@example.com",
          "status": "4.4.1",
          "diagnosticCode": "smtp; 421 4.4.1 Connection timed out"
        }
      ]
    }
  }
}`;

const renderingFailurePayload = `{
  "version": "0",
  "id": "c9d0e1f2-a3b4-5678-cdef-789012345678",
  "detail-type": "Email Rendering Failed",
  "source": "aws.ses",
  "account": "123456789012",
  "time": "2025-01-15T10:30:00Z",
  "region": "us-east-1",
  "resources": [],
  "detail": {
    "eventType": "Rendering Failure",
    "mail": {
      "timestamp": "2025-01-15T10:30:00.000Z",
      "source": "hello@yourapp.com",
      "messageId": "EXAMPLE7c191be45-e9aedb9a-02f9-4d12-a87d-dd0099a07f8a-000000",
      "destination": ["user@example.com"],
      "tags": {
        "ses:configuration-set": ["wraps-email-tracking"]
      }
    },
    "failure": {
      "errorMessage": "Attribute 'firstName' is not present in the rendering data.",
      "templateName": "welcome-email"
    }
  }
}`;

const subscriptionPayload = `{
  "version": "0",
  "id": "d0e1f2a3-b4c5-6789-defa-890123456789",
  "detail-type": "Email Subscribed",
  "source": "aws.ses",
  "account": "123456789012",
  "time": "2025-01-15T11:10:00Z",
  "region": "us-east-1",
  "resources": [],
  "detail": {
    "eventType": "Subscription",
    "mail": {
      "timestamp": "2025-01-15T10:30:00.000Z",
      "source": "hello@yourapp.com",
      "messageId": "EXAMPLE7c191be45-e9aedb9a-02f9-4d12-a87d-dd0099a07f8a-000000",
      "destination": ["user@example.com"],
      "tags": {
        "ses:configuration-set": ["wraps-email-tracking"]
      }
    },
    "subscription": {
      "contactList": "wraps-email-contacts",
      "timestamp": "2025-01-15T11:10:00.000Z",
      "source": "ListManagement",
      "newTopicPreferences": {
        "unsubscribeAll": true
      },
      "oldTopicPreferences": {
        "unsubscribeAll": false
      }
    }
  }
}`;

const inboundPayload = `{
  "version": "0",
  "id": "e1f2a3b4-c5d6-7890-efab-901234567890",
  "detail-type": "email.received",
  "source": "wraps.inbound",
  "account": "123456789012",
  "time": "2025-01-15T14:00:00Z",
  "region": "us-east-1",
  "resources": [],
  "detail": {
    "messageId": "abcdef12-3456-7890-abcd-ef1234567890",
    "from": "sender@external.com",
    "to": ["inbox@yourapp.com"],
    "subject": "Re: Your recent order",
    "date": "2025-01-15T14:00:00.000Z",
    "receivedAt": "2025-01-15T14:00:00.500Z",
    "replyToken": {
      "conversationId": "aGVsbG8gd29y",
      "sendId": "MDEyMzQ1Njc",
      "status": "valid"
    },
    "autoReply": false
  }
}`;

// ── Rule Patterns ─────────────────────────────────────────────────────

const ruleAllEvents = `{
  "source": ["aws.ses"],
  "detail-type": [
    "Email Sent",
    "Email Delivered",
    "Email Bounced",
    "Email Complaint Received",
    "Email Opened",
    "Email Clicked",
    "Email Rejected",
    "Email Rendering Failed",
    "Email Delivery Delayed",
    "Email Subscribed"
  ]
}`;

const ruleBouncesComplaints = `{
  "source": ["aws.ses"],
  "detail-type": [
    "Email Bounced",
    "Email Complaint Received"
  ]
}`;

const rulePermanentBounces = `{
  "source": ["aws.ses"],
  "detail-type": ["Email Bounced"],
  "detail": {
    "bounce": {
      "bounceType": ["Permanent"]
    }
  }
}`;

const ruleInbound = `{
  "source": ["wraps.inbound"],
  "detail-type": ["email.received"]
}`;

// ── ExpandableSection Component ───────────────────────────────────────

function ExpandableSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-lg border">
      <button
        className="flex w-full items-center justify-between p-4 text-left font-medium"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        {title}
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>
      {isOpen && <div className="border-t px-4 pb-4 pt-2">{children}</div>}
    </div>
  );
}

// ── Reusable CodeBlock Renderer ───────────────────────────────────────

function JsonCodeBlock({ filename, code }: { filename: string; code: string }) {
  return (
    <CodeBlock
      className="h-auto"
      data={[{ language: "json", filename, code }]}
      defaultValue="json"
    >
      <CodeBlockHeader>
        <CodeBlockFiles>
          {(item) => (
            <CodeBlockFilename key={item.language} value={item.language}>
              {item.filename}
            </CodeBlockFilename>
          )}
        </CodeBlockFiles>
        <CodeBlockCopyButton />
      </CodeBlockHeader>
      <CodeBlockBody>
        {(item) => (
          <CodeBlockItem
            key={item.language}
            lineNumbers={false}
            value={item.language}
          >
            <CodeBlockContent language={item.language}>
              {item.code}
            </CodeBlockContent>
          </CodeBlockItem>
        )}
      </CodeBlockBody>
    </CodeBlock>
  );
}

// ── Page Content ──────────────────────────────────────────────────────

export default function InfrastructureEventsPageContent() {
  return (
    <DocsLayout>
      {/* Page Header */}
      <div className="mb-12">
        <Badge className="mb-4" variant="outline">
          Infrastructure / Events
        </Badge>
        <h1 className="mb-4 font-bold text-4xl tracking-tight">
          EventBridge Events
        </h1>
        <p className="text-lg text-muted-foreground">
          Every email event flows through your AWS account&apos;s EventBridge
          bus. Create rules to build alerts, analytics, workflows, and more.
        </p>
      </div>

      {/* ── Section 1: How It Works ───────────────────────────────── */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Layers className="h-6 w-6 text-primary" />
          How It Works
        </h2>
        <p className="mb-4 text-muted-foreground">
          When you send an email through Wraps, SES publishes event
          notifications to the default EventBridge bus in your AWS account.
          Wraps creates a rule on that bus to capture events into its processing
          pipeline &mdash; but because it&apos;s <em>your</em> bus, you can add
          your own rules alongside Wraps&apos; rule with zero configuration.
        </p>

        <CodeBlock
          className="h-auto"
          data={[
            {
              language: "bash",
              filename: "architecture.txt",
              code: architectureDiagram,
            },
          ]}
          defaultValue="bash"
        >
          <CodeBlockHeader>
            <CodeBlockFiles>
              {(item) => (
                <CodeBlockFilename key={item.language} value={item.language}>
                  {item.filename}
                </CodeBlockFilename>
              )}
            </CodeBlockFiles>
            <CodeBlockCopyButton />
          </CodeBlockHeader>
          <CodeBlockBody>
            {(item) => (
              <CodeBlockItem
                key={item.language}
                lineNumbers={false}
                value={item.language}
              >
                <CodeBlockContent language={item.language}>
                  {item.code}
                </CodeBlockContent>
              </CodeBlockItem>
            )}
          </CodeBlockBody>
        </CodeBlock>

        <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">
            Your events, your bus, your rules
          </p>
          <p className="mt-1 text-muted-foreground text-sm">
            EventBridge evaluates every rule on the bus independently. Adding
            your own rules has no impact on Wraps&apos; processing pipeline, and
            you get native fan-out, content-based filtering, and IAM security
            &mdash; no webhook endpoints to manage.
          </p>
        </div>
      </section>

      {/* ── Section 2: What Wraps Handles Automatically ───────────── */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Shield className="h-6 w-6 text-primary" />
          What Wraps Handles Automatically
        </h2>
        <p className="mb-4 text-muted-foreground">
          Wraps&apos; built-in pipeline captures all configured events and
          processes them into DynamoDB. You get this for free &mdash; custom
          rules are for anything extra you want to build.
        </p>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-4 text-left font-medium">Field</th>
                    <th className="p-4 text-left font-medium">Source</th>
                    <th className="p-4 text-left font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        messageId
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      mail.messageId
                    </td>
                    <td className="p-4 text-muted-foreground">
                      SES message ID (partition key)
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        sentAt
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      mail.timestamp
                    </td>
                    <td className="p-4 text-muted-foreground">
                      When the email was sent (sort key)
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        accountId
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      envelope.account
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Your AWS account ID
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">from</code>
                    </td>
                    <td className="p-4 text-muted-foreground">mail.source</td>
                    <td className="p-4 text-muted-foreground">
                      Sender email address
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">to</code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      mail.destination
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Recipient email addresses
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        subject
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      mail.commonHeaders
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Email subject line
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        eventType
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      detail.eventType
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Event type (Send, Delivery, Bounce, etc.)
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        eventData
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Full event JSON
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Complete event payload for detailed analysis
                    </td>
                  </tr>
                  <tr>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        expiresAt
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">Computed</td>
                    <td className="p-4 text-muted-foreground">
                      TTL (90 days Production, 365 days Enterprise)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">Suppression normalization</p>
          <p className="mt-1 text-muted-foreground text-sm">
            When SES reports a bounce with sub-type{" "}
            <code className="rounded bg-muted px-1 py-0.5">Suppressed</code> or{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              OnAccountSuppressionList
            </code>
            , Wraps normalizes these into a distinct{" "}
            <code className="rounded bg-muted px-1 py-0.5">Suppressed</code>{" "}
            event type in DynamoDB. This makes it easy to distinguish real
            bounces from suppression-list entries.
          </p>
        </div>
      </section>

      {/* ── Section 3: Event Types Reference ──────────────────────── */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Zap className="h-6 w-6 text-primary" />
          Event Types Reference
        </h2>
        <p className="mb-4 text-muted-foreground">
          SES uses three different naming conventions depending on where you
          look. This mapping table is the key to writing EventBridge rules
          correctly.
        </p>

        {/* Mapping Table */}
        <Card className="mb-6">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-4 text-left font-medium">Event</th>
                    <th className="p-4 text-left font-medium">
                      EventBridge{" "}
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                        detail-type
                      </code>
                    </th>
                    <th className="p-4 text-left font-medium">
                      <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                        detail.eventType
                      </code>
                    </th>
                    <th className="p-4 text-left font-medium">When It Fires</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-4 font-medium">Send</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        Email Sent
                      </code>
                    </td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">Send</code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Email accepted by SES for delivery
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">Delivery</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        Email Delivered
                      </code>
                    </td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        Delivery
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Recipient mail server accepted the email
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">Open</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        Email Opened
                      </code>
                    </td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">Open</code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Recipient opened the email (tracking pixel loaded)
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">Click</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        Email Clicked
                      </code>
                    </td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        Click
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Recipient clicked a tracked link
                    </td>
                  </tr>
                  <tr className="border-b bg-destructive/10">
                    <td className="p-4 font-medium">Bounce</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        Email Bounced
                      </code>
                    </td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        Bounce
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Email could not be delivered
                    </td>
                  </tr>
                  <tr className="border-b bg-destructive/10">
                    <td className="p-4 font-medium">Complaint</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        Email Complaint Received
                      </code>
                    </td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        Complaint
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Recipient marked email as spam
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">Reject</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        Email Rejected
                      </code>
                    </td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        Reject
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      SES rejected the email (virus, policy)
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">Delivery Delay</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        Email Delivery Delayed
                      </code>
                    </td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        DeliveryDelay
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Temporary delivery issue, SES will retry
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">Rendering Failure</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        Email Rendering Failed
                      </code>
                    </td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        Rendering Failure
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      SES template rendering failed
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">Subscription</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        Email Subscribed
                      </code>
                    </td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        Subscription
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Recipient changed subscription preferences
                    </td>
                  </tr>
                  <tr className="bg-info/10">
                    <td className="p-4 font-medium">Inbound Email</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        email.received
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">&mdash;</td>
                    <td className="p-4 text-muted-foreground">
                      Inbound email received (source:{" "}
                      <code className="rounded bg-muted px-1 py-0.5">
                        wraps.inbound
                      </code>
                      )
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Delivery Events */}
        <h3 className="mb-3 font-semibold text-lg">Delivery Events</h3>
        <div className="mb-6 space-y-3">
          <ExpandableSection title="Send &mdash; Email accepted by SES">
            <div className="space-y-3">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-3 text-left font-medium">Field</th>
                          <th className="p-3 text-left font-medium">
                            Description
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.mail.messageId
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Unique SES message identifier
                          </td>
                        </tr>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.mail.source
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Sender (From) address
                          </td>
                        </tr>
                        <tr>
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.mail.destination
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Array of recipient addresses
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <JsonCodeBlock code={sendPayload} filename="send-event.json" />
            </div>
          </ExpandableSection>

          <ExpandableSection title="Delivery &mdash; Accepted by recipient mail server">
            <div className="space-y-3">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-3 text-left font-medium">Field</th>
                          <th className="p-3 text-left font-medium">
                            Description
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.delivery.processingTimeMillis
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Time from send to delivery (ms)
                          </td>
                        </tr>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.delivery.recipients
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Array of recipients who received the email
                          </td>
                        </tr>
                        <tr>
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.delivery.smtpResponse
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            SMTP response from recipient server
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <JsonCodeBlock
                code={deliveryPayload}
                filename="delivery-event.json"
              />
            </div>
          </ExpandableSection>

          <ExpandableSection title="Bounce &mdash; Email could not be delivered">
            <div className="space-y-3">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-3 text-left font-medium">Field</th>
                          <th className="p-3 text-left font-medium">
                            Description
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.bounce.bounceType
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Permanent, Transient, or Undetermined
                          </td>
                        </tr>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.bounce.bounceSubType
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Specific reason (General, NoEmail, Suppressed, etc.)
                          </td>
                        </tr>
                        <tr>
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.bounce.bouncedRecipients
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Array with address, status, and diagnostic code
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <JsonCodeBlock
                code={bouncePayload}
                filename="bounce-event.json"
              />
            </div>
          </ExpandableSection>

          <ExpandableSection title="Reject &mdash; SES refused to send">
            <div className="space-y-3">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-3 text-left font-medium">Field</th>
                          <th className="p-3 text-left font-medium">
                            Description
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.reject.reason
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Why SES rejected the email (e.g., VIRUS)
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <JsonCodeBlock
                code={rejectPayload}
                filename="reject-event.json"
              />
            </div>
          </ExpandableSection>

          <ExpandableSection title="Delivery Delay &mdash; Temporary delivery issue">
            <div className="space-y-3">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-3 text-left font-medium">Field</th>
                          <th className="p-3 text-left font-medium">
                            Description
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.deliveryDelay.delayType
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Reason for delay (e.g.,
                            TransientCommunicationFailure)
                          </td>
                        </tr>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.deliveryDelay.expirationTime
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            When SES will stop retrying
                          </td>
                        </tr>
                        <tr>
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.deliveryDelay.delayedRecipients
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Array with address, status, and diagnostic code
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <JsonCodeBlock
                code={deliveryDelayPayload}
                filename="delivery-delay-event.json"
              />
            </div>
          </ExpandableSection>
        </div>

        {/* Engagement Events */}
        <h3 className="mb-3 font-semibold text-lg">Engagement Events</h3>
        <p className="mb-3 text-muted-foreground text-sm">
          Open and click events carry the recipient&apos;s IP address and user
          agent. Wraps stores the user agent to filter bot opens out of your
          metrics and discards the IP address without storing it &mdash; the
          full event, IP included, still lands in your own AWS account. User
          agents are personal data in the EU and UK, so drop <code>OPEN</code>{" "}
          and <code>CLICK</code> from your event types if you don&apos;t want
          engagement tracked at all &mdash; SES stops emitting those events
          entirely, so they never reach your own EventBridge bus or DynamoDB
          history either. See{" "}
          <Link className="text-primary hover:underline" href="/privacy">
            Section 1.5 of our privacy policy
          </Link>
          .
        </p>
        <p className="mb-3 text-muted-foreground text-sm">
          Event types aren&apos;t set in a config file &mdash; there isn&apos;t
          one for infrastructure. They&apos;re chosen at the CLI: on a new
          deployment, run{" "}
          <code className="rounded bg-muted px-1 py-0.5">wraps email init</code>{" "}
          and pick the <strong>Custom</strong> configuration path (Starter
          doesn&apos;t enable event tracking at all; Production and Enterprise
          both track all ten event types and don&apos;t prompt). On an existing
          deployment, run{" "}
          <code className="rounded bg-muted px-1 py-0.5">
            wraps email upgrade
          </code>{" "}
          and choose the event types action. Either way, you&apos;re asked which
          event types should reach your EventBridge bus and DynamoDB history
          &mdash; Send, Delivery, Open, Click, Reject, Rendering Failure,
          Delivery Delay, and Subscription are all offered, and all are selected
          by default. Deselect <code>Open</code> and <code>Click</code> there to
          stop engagement tracking. <code>Bounce</code> and{" "}
          <code>Complaint</code> aren&apos;t offered as choices &mdash;
          they&apos;re always included, since dropping either would leave your
          pipeline blind to bounces and complaints and your domain reputation
          would degrade.
        </p>
        <div className="mb-6 space-y-3">
          <ExpandableSection title="Open &mdash; Recipient opened the email">
            <div className="space-y-3">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-3 text-left font-medium">Field</th>
                          <th className="p-3 text-left font-medium">
                            Description
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.open.userAgent
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Recipient&apos;s browser/email client
                          </td>
                        </tr>
                        <tr>
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.open.ipAddress
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            IP address of the recipient
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <JsonCodeBlock code={openPayload} filename="open-event.json" />
            </div>
          </ExpandableSection>

          <ExpandableSection title="Click &mdash; Recipient clicked a link">
            <div className="space-y-3">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-3 text-left font-medium">Field</th>
                          <th className="p-3 text-left font-medium">
                            Description
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.click.link
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            URL that was clicked
                          </td>
                        </tr>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.click.userAgent
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Recipient&apos;s browser/email client
                          </td>
                        </tr>
                        <tr>
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.click.ipAddress
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            IP address of the recipient
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <JsonCodeBlock code={clickPayload} filename="click-event.json" />
            </div>
          </ExpandableSection>

          <ExpandableSection title="Subscription &mdash; Preference change">
            <div className="space-y-3">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-3 text-left font-medium">Field</th>
                          <th className="p-3 text-left font-medium">
                            Description
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.subscription.contactList
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Name of the SES contact list
                          </td>
                        </tr>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.subscription.newTopicPreferences
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Updated subscription preferences
                          </td>
                        </tr>
                        <tr>
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.subscription.oldTopicPreferences
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Previous subscription preferences
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <JsonCodeBlock
                code={subscriptionPayload}
                filename="subscription-event.json"
              />
            </div>
          </ExpandableSection>
        </div>

        {/* System Events */}
        <h3 className="mb-3 font-semibold text-lg">System Events</h3>
        <div className="mb-6 space-y-3">
          <ExpandableSection title="Complaint &mdash; Marked as spam">
            <div className="space-y-3">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-3 text-left font-medium">Field</th>
                          <th className="p-3 text-left font-medium">
                            Description
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.complaint.complainedRecipients
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Array of recipients who complained
                          </td>
                        </tr>
                        <tr>
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.complaint.complaintFeedbackType
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Feedback type (abuse, not-spam, etc.)
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <JsonCodeBlock
                code={complaintPayload}
                filename="complaint-event.json"
              />
            </div>
          </ExpandableSection>

          <ExpandableSection title="Rendering Failure &mdash; Template error">
            <div className="space-y-3">
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-3 text-left font-medium">Field</th>
                          <th className="p-3 text-left font-medium">
                            Description
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.failure.errorMessage
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Description of the rendering error
                          </td>
                        </tr>
                        <tr>
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.failure.templateName
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Name of the SES template that failed
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <JsonCodeBlock
                code={renderingFailurePayload}
                filename="rendering-failure-event.json"
              />
            </div>
          </ExpandableSection>
        </div>

        {/* Inbound Events */}
        <h3 className="mb-3 font-semibold text-lg">Inbound Events</h3>
        <div className="space-y-3">
          <ExpandableSection title="Inbound Email &mdash; email.received (source: wraps.inbound)">
            <div className="space-y-3">
              <div className="rounded-lg border-primary border-l-4 bg-primary/10 p-4">
                <p className="text-muted-foreground text-sm">
                  Inbound events use a different source (
                  <code className="rounded bg-muted px-1 py-0.5">
                    wraps.inbound
                  </code>
                  ) and detail-type (
                  <code className="rounded bg-muted px-1 py-0.5">
                    email.received
                  </code>
                  ) than SES outbound events. Filter for these separately in
                  your EventBridge rules.
                </p>
              </div>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="p-3 text-left font-medium">Field</th>
                          <th className="p-3 text-left font-medium">
                            Description
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.from
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Sender email address
                          </td>
                        </tr>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.to
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Array of recipient addresses
                          </td>
                        </tr>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.subject
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Email subject line
                          </td>
                        </tr>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.receivedAt
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            When the inbound email was received
                          </td>
                        </tr>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.rawS3Key
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            S3 key of the raw MIME message in your inbound
                            bucket
                          </td>
                        </tr>
                        <tr className="border-b">
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.truncated
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Present and <code>true</code> only when large fields
                            were dropped to fit the EventBridge size limit;{" "}
                            <code>detail.truncatedFields</code> lists them
                          </td>
                        </tr>
                        <tr>
                          <td className="p-3">
                            <code className="rounded bg-muted px-1 py-0.5">
                              detail.parsedS3Key
                            </code>
                          </td>
                          <td className="p-3 text-muted-foreground">
                            Set on truncated events: S3 key of the full parsed
                            email JSON, in the same bucket as{" "}
                            <code>rawS3Key</code>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <JsonCodeBlock
                code={inboundPayload}
                filename="inbound-event.json"
              />
              <p className="text-muted-foreground text-sm">
                The full parsed email is always stored in your bucket at{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  parsed/{"{emailId}"}.json
                </code>
                . If it would exceed the EventBridge PutEvents size limit (1 MB,
                or 256 KB in Regions without the 1 MB increase), the event is
                trimmed: the largest of{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">html</code>,{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">text</code> and{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">headers</code>{" "}
                is dropped first, then the others, then{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  attachments
                </code>
                , until it fits, and the detail gains{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  truncated: true
                </code>
                ,{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  truncatedFields
                </code>{" "}
                and{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  parsedS3Key
                </code>
                . When{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  truncated
                </code>{" "}
                is set, read the full email from{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  parsedS3Key
                </code>{" "}
                (or the raw MIME from{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">rawS3Key</code>
                ). If that is still too large,{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">to</code>/
                <code className="rounded bg-muted px-1.5 py-0.5">cc</code> are
                replaced by{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">toCount</code>/
                <code className="rounded bg-muted px-1.5 py-0.5">ccCount</code>{" "}
                and the subject is cut to 1,000 characters; as a last resort the
                detail holds only{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">emailId</code>,{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">rawS3Key</code>
                ,{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  parsedS3Key
                </code>
                ,{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  receivedAt
                </code>
                ,{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  replyToken
                </code>{" "}
                and{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  autoReply
                </code>
                .
              </p>
              <p className="text-muted-foreground text-sm">
                When replying to a signed message,{" "}
                <code className="rounded bg-muted px-1.5 py-0.5">
                  replyToken.status === "valid"
                </code>{" "}
                confirms the token verified; see the{" "}
                <Link
                  className="font-medium text-primary underline"
                  href="/docs/guides/reply-threading"
                >
                  reply-threading guide
                </Link>
                .
              </p>
            </div>
          </ExpandableSection>
        </div>
      </section>

      {/* ── Section 4: Bounce & Complaint Reference ───────────────── */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <AlertTriangle className="h-6 w-6 text-primary" />
          Bounce &amp; Complaint Reference
        </h2>
        <p className="mb-4 text-muted-foreground">
          Bounces and complaints are the most important events to handle
          correctly. AWS monitors your bounce and complaint rates and will
          suspend your account if they exceed thresholds.
        </p>

        <div className="mb-4 rounded-lg border-destructive border-l-4 bg-destructive/10 p-4">
          <p className="font-medium text-sm">SES suspension thresholds</p>
          <p className="mt-1 text-muted-foreground text-sm">
            AWS will place your SES account under review if your bounce rate
            exceeds <strong>5%</strong> or your complaint rate exceeds{" "}
            <strong>0.1%</strong>. Persistent violations lead to sending
            suspension.
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Bounce Type Matrix</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-4 text-left font-medium">bounceType</th>
                    <th className="p-4 text-left font-medium">bounceSubType</th>
                    <th className="p-4 text-left font-medium">
                      Recommended Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-4 font-medium">Permanent</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        General
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Suppress immediately &mdash; address is invalid
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">Permanent</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        NoEmail
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Suppress &mdash; mailbox does not exist
                    </td>
                  </tr>
                  <tr className="border-b bg-info/10">
                    <td className="p-4 font-medium">Permanent</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        Suppressed
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Already on SES suppression list (Wraps normalizes to
                      Suppressed)
                    </td>
                  </tr>
                  <tr className="border-b bg-info/10">
                    <td className="p-4 font-medium">Permanent</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        OnAccountSuppressionList
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Account-level suppression (Wraps normalizes to Suppressed)
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">Permanent</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        UnsubscribedRecipient
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Recipient unsubscribed &mdash; remove from mailing list
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">Transient</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        General
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Retry later &mdash; temporary issue
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">Transient</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        MailboxFull
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Retry, suppress after repeated failures
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">Transient</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        MessageTooLarge
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Reduce message size and resend
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">Transient</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        ContentRejected
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Review email content for policy violations
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">Transient</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        AttachmentRejected
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Review attachment type and size
                    </td>
                  </tr>
                  <tr>
                    <td className="p-4 font-medium">Undetermined</td>
                    <td className="p-4">
                      <code className="rounded bg-muted px-1 py-0.5">
                        Undetermined
                      </code>
                    </td>
                    <td className="p-4 text-muted-foreground">
                      Investigate manually &mdash; check diagnostic code
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="rounded-lg border-primary border-l-4 bg-primary/10 p-4">
          <p className="font-medium text-sm">Wraps suppression normalization</p>
          <p className="mt-1 text-muted-foreground text-sm">
            Wraps automatically detects bounces with sub-type{" "}
            <code className="rounded bg-muted px-1 py-0.5">Suppressed</code> or{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              OnAccountSuppressionList
            </code>{" "}
            and stores them with event type{" "}
            <code className="rounded bg-muted px-1 py-0.5">Suppressed</code> in
            DynamoDB instead of{" "}
            <code className="rounded bg-muted px-1 py-0.5">Bounce</code>. This
            keeps your bounce metrics accurate by excluding addresses that were
            already suppressed.
          </p>
        </div>
      </section>

      {/* ── Section 5: Creating Custom Rules ──────────────────────── */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Code2 className="h-6 w-6 text-primary" />
          Creating Custom Rules
        </h2>
        <p className="mb-4 text-muted-foreground">
          The default EventBridge bus evaluates all rules independently. Your
          rules run alongside Wraps&apos; rule with no interference. Create
          rules in the AWS Console, CLI, CDK, or Terraform using these event
          patterns.
        </p>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Match all SES events</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="mb-3 text-muted-foreground text-sm">
                Capture every email event on the bus. Use this to forward
                everything to a single target.
              </p>
              <JsonCodeBlock
                code={ruleAllEvents}
                filename="pattern-all-events.json"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Filter bounces and complaints only
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="mb-3 text-muted-foreground text-sm">
                Alert on the events that matter most for sender reputation.
              </p>
              <JsonCodeBlock
                code={ruleBouncesComplaints}
                filename="pattern-bounces-complaints.json"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Filter permanent bounces only
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="mb-3 text-muted-foreground text-sm">
                Use content-based filtering to match only permanent hard
                bounces. Transient bounces are excluded.
              </p>
              <JsonCodeBlock
                code={rulePermanentBounces}
                filename="pattern-permanent-bounces.json"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Match inbound email events
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="mb-3 text-muted-foreground text-sm">
                Inbound events use a different source. Match them separately
                from outbound SES events.
              </p>
              <JsonCodeBlock
                code={ruleInbound}
                filename="pattern-inbound.json"
              />
            </CardContent>
          </Card>
        </div>

        <div className="mt-6">
          <h3 className="mb-3 font-semibold text-lg">Available Targets</h3>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-4 text-left font-medium">Target</th>
                      <th className="p-4 text-left font-medium">Use Case</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="p-4 font-medium">Lambda</td>
                      <td className="p-4 text-muted-foreground">
                        Custom processing, database writes, API calls
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-4 font-medium">SNS</td>
                      <td className="p-4 text-muted-foreground">
                        Fan-out to email, SMS, Slack, PagerDuty
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-4 font-medium">SQS</td>
                      <td className="p-4 text-muted-foreground">
                        Buffered processing, batch operations
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-4 font-medium">Step Functions</td>
                      <td className="p-4 text-muted-foreground">
                        Multi-step workflows, orchestration
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-4 font-medium">API Destination</td>
                      <td className="p-4 text-muted-foreground">
                        Forward to external webhooks (Slack, Zapier, etc.)
                      </td>
                    </tr>
                    <tr>
                      <td className="p-4 font-medium">CloudWatch Logs</td>
                      <td className="p-4 text-muted-foreground">
                        Logging, debugging, audit trail
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Section 6: Common Use Cases ───────────────────────────── */}
      <section className="mb-12">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-2xl">
          <Rocket className="h-6 w-6 text-primary" />
          Common Use Cases
        </h2>
        <p className="mb-6 text-muted-foreground">
          Practical examples of what you can build with custom EventBridge
          rules.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Alert on Bounces &amp; Complaints
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-muted-foreground text-sm">
                Route bounce and complaint events to SNS, then subscribe a Slack
                channel or PagerDuty endpoint. Get notified immediately when
                your sender reputation is at risk.
              </p>
              <div className="rounded bg-muted/50 p-3 font-mono text-xs">
                EventBridge &rarr; SNS &rarr; Slack / PagerDuty
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Build Engagement Analytics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-muted-foreground text-sm">
                Capture open and click events in a Lambda function that writes
                to your own database. Build custom dashboards with open rates,
                click-through rates, and per-link analytics.
              </p>
              <div className="rounded bg-muted/50 p-3 font-mono text-xs">
                EventBridge &rarr; Lambda &rarr; Your Database
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Trigger Workflows</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-muted-foreground text-sm">
                Use Step Functions to orchestrate multi-step processes. For
                example: when a welcome email is delivered, wait 3 days, check
                if the recipient opened it, then send a follow-up.
              </p>
              <div className="rounded bg-muted/50 p-3 font-mono text-xs">
                EventBridge &rarr; Step Functions &rarr; SES
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Forward to Your Webhook</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-muted-foreground text-sm">
                Use an API Destination to forward events to any HTTP endpoint.
                Connect to Zapier, Make, n8n, or your own API without managing
                infrastructure.
              </p>
              <div className="rounded bg-muted/50 p-3 font-mono text-xs">
                EventBridge &rarr; API Destination &rarr; Your Endpoint
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Section 7: Quotas & Limits ────────────────────────────── */}
      <section className="mb-12">
        <h2 className="mb-4 font-bold text-2xl">Quotas &amp; Limits</h2>
        <p className="mb-4 text-muted-foreground">
          Key EventBridge limits to keep in mind when creating custom rules.
        </p>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-4 text-left font-medium">Resource</th>
                    <th className="p-4 text-left font-medium">Default Limit</th>
                    <th className="p-4 text-left font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-4 font-medium">Rules per event bus</td>
                    <td className="p-4">300</td>
                    <td className="p-4 text-muted-foreground">
                      Adjustable up to 2,000 via AWS support
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">Targets per rule</td>
                    <td className="p-4">5</td>
                    <td className="p-4 text-muted-foreground">
                      Hard limit (use fan-out via SNS for more)
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-4 font-medium">PutEvents rate</td>
                    <td className="p-4">10,000/sec</td>
                    <td className="p-4 text-muted-foreground">
                      Varies by region; SES manages publishing
                    </td>
                  </tr>
                  <tr>
                    <td className="p-4 font-medium">Event pattern size</td>
                    <td className="p-4">2,048 chars</td>
                    <td className="p-4 text-muted-foreground">
                      Adjustable via AWS support
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Next Steps ────────────────────────────────────────────── */}
      <section className="mb-12">
        <h2 className="mb-6 font-bold text-2xl">Next Steps</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">
                What Gets Deployed: Email
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                See every AWS resource Wraps creates, organized by preset.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/infrastructure/email">
                  View Resources
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Email SDK Reference</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Send emails with the TypeScript SDK after deploying.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/sdk-reference">
                  View SDK Docs
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="transition-colors hover:border-primary/50">
            <CardHeader>
              <CardTitle className="text-lg">Configuration Presets</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-muted-foreground text-sm">
                Compare presets and customize your configuration.
              </p>
              <Button asChild variant="outline">
                <Link href="/docs/guides/configuration-presets">
                  View Guide
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Help Section ──────────────────────────────────────────── */}
      <Card className="bg-muted/50">
        <CardContent className="p-8 text-center">
          <h3 className="mb-2 font-bold text-xl">Need Help?</h3>
          <p className="mb-4 text-muted-foreground">
            If you run into any issues, check our GitHub discussions or open an
            issue.
          </p>
          <Button asChild>
            <a
              href="https://github.com/wraps-team/wraps/discussions"
              rel="noopener noreferrer"
              target="_blank"
            >
              Get Help
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </DocsLayout>
  );
}
