import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockFindMany = vi.fn();
const mockGetOrganizationWithMembership = vi.fn();
const mockQueryEmailEvents = vi.fn();

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

vi.mock("@wraps/db", () => ({
  db: {
    query: {
      awsAccount: {
        findMany: (...args: unknown[]) => mockFindMany(...args),
      },
    },
  },
}));

vi.mock("@wraps/db/schema/app", () => ({
  awsAccount: {
    organizationId: "organizationId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(() => Promise.resolve(new Headers())),
}));

vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: (...args: unknown[]) =>
    mockGetOrganizationWithMembership(...args),
}));

vi.mock("@/lib/aws/dynamodb", () => ({
  queryEmailEvents: (...args: unknown[]) => mockQueryEmailEvents(...args),
}));

vi.mock("@/components/email-archive-viewer", () => ({
  EmailArchiveViewer: () => <div>archive-viewer</div>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("../components/copy-button", () => ({
  CopyButton: () => null,
}));

vi.mock("../components/email-fields", () => ({
  EmailFields: () => <div>email-fields</div>,
}));

vi.mock("../components/event-item", () => ({
  EventItem: () => null,
}));

vi.mock("../components/event-timeline", () => ({
  EventTimeline: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import EmailDetailPage from "../page";

type MockEmailEvent = {
  messageId: string;
  sentAt: number;
  accountId: string;
  from: string;
  to: string[];
  subject: string;
  eventType: string;
  eventData: string;
  additionalData?: string;
  createdAt: number;
  expiresAt: number;
};

function createEvent(overrides: Partial<MockEmailEvent> = {}): MockEmailEvent {
  return {
    messageId: "msg-1",
    sentAt: 1_000,
    accountId: "123456789012",
    from: "sender@example.com",
    to: ["recipient@example.com"],
    subject: "Quarterly update",
    eventType: "Send",
    eventData: "{}",
    createdAt: 1_000,
    expiresAt: 9_999_999,
    ...overrides,
  };
}

async function renderPage(emailId: string): Promise<string> {
  const page = await EmailDetailPage({
    params: Promise.resolve({
      orgSlug: "acme",
      emailId,
    }),
  });

  return renderToStaticMarkup(page);
}

describe("EmailDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetSession.mockResolvedValue({
      user: {
        id: "user-1",
      },
    });

    mockGetOrganizationWithMembership.mockResolvedValue({
      id: "org-1",
      slug: "acme",
    });

    mockFindMany.mockResolvedValue([
      {
        id: "aws-account-1",
        features: {
          email: {
            archivingEnabled: false,
          },
        },
      },
    ]);
  });

  it("keeps delivered status when the only open is automated", async () => {
    mockQueryEmailEvents.mockResolvedValue([
      createEvent({
        messageId: "msg-bot",
        eventType: "Send",
        sentAt: 1_000,
        createdAt: 1_000,
      }),
      createEvent({
        messageId: "msg-bot",
        eventType: "Delivery",
        sentAt: 1_000,
        createdAt: 1_001,
      }),
      createEvent({
        messageId: "msg-bot",
        eventType: "Open",
        sentAt: 1_000,
        createdAt: 1_002,
        additionalData: JSON.stringify({
          ipAddress: "1.2.3.4",
        }),
      }),
    ]);

    const html = await renderPage("msg-bot");

    expect(html).toContain("Delivered");
    expect(html).not.toContain("Opened");
  });

  it("promotes status to opened when a real open exists", async () => {
    mockQueryEmailEvents.mockResolvedValue([
      createEvent({
        messageId: "msg-real",
        eventType: "Send",
        sentAt: 2_000,
        createdAt: 2_000,
      }),
      createEvent({
        messageId: "msg-real",
        eventType: "Delivery",
        sentAt: 2_000,
        createdAt: 2_001,
      }),
      createEvent({
        messageId: "msg-real",
        eventType: "Open",
        sentAt: 2_000,
        createdAt: 2_002,
        additionalData: JSON.stringify({
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
          ipAddress: "203.0.113.42",
        }),
      }),
    ]);

    const html = await renderPage("msg-real");

    expect(html).toContain("Opened");
  });
});
