/**
 * Email detail — failure states (audit finding F5)
 *
 * The page used to collapse every failure — a genuine miss, an expired role,
 * a DynamoDB outage — into `fetchEmail() === null` and then `redirect()` back
 * to the emails list with no message at all. Clicking a row looked broken.
 *
 * These tests pin the replacement behavior: a genuine miss is a 404, and every
 * other failure renders a visible, named state. Nothing redirects.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORG_SLUG = "acme";
const ORG_ID = "org-1";
const USER_ID = "user-1";
const EMAIL_ID = "0100018f-1111-2222-3333-444455556666";
const NOT_FOUND_SIGNAL = "NEXT_NOT_FOUND";

const notFoundMock = vi.fn(() => {
  throw new Error(NOT_FOUND_SIGNAL);
});
const redirectMock = vi.fn((path: string) => {
  throw new Error(`redirect called with ${path}`);
});

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => notFoundMock(),
  redirect: (path: string) => redirectMock(path),
  usePathname: () => `/${ORG_SLUG}/emails/${EMAIL_ID}`,
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => ({
        user: { id: USER_ID, email: "dev@acme.test", name: "Dev" },
        session: {
          id: "sess-1",
          userId: USER_ID,
          token: "t",
          createdAt: new Date(),
          updatedAt: new Date(),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      })),
    },
  },
}));

vi.mock("@/lib/organization", () => ({
  getOrganizationWithMembership: vi.fn(async () => ({
    id: ORG_ID,
    slug: ORG_SLUG,
    name: "Acme",
    userRole: "owner" as const,
  })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const queryEmailEventsMock = vi.fn();
const queryEventsByMessageIdsMock = vi.fn();
vi.mock("@/lib/aws/dynamodb", () => ({
  queryEmailEvents: (...args: unknown[]) => queryEmailEventsMock(...args),
  queryEventsByMessageIds: (...args: unknown[]) =>
    queryEventsByMessageIdsMock(...args),
}));

const findAwsAccountsMock = vi.fn(async () => [
  { id: "acc-1", accountId: "123456789012", organizationId: ORG_ID },
]);
const selectMessageSendMock = vi.fn(async () => [] as unknown[]);

vi.mock("@wraps/db", () => ({
  db: {
    query: {
      awsAccount: {
        findMany: () => findAwsAccountsMock(),
      },
    },
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => ({
            then: (onFulfilled: (rows: unknown[]) => unknown) =>
              selectMessageSendMock().then(onFulfilled),
          }),
        }),
      }),
    }),
  },
}));

vi.mock("@wraps/db/schema/app", () => ({
  awsAccount: { organizationId: "organizationId" },
}));

vi.mock("@wraps/db/schema/batch", () => ({
  messageSend: {
    id: "id",
    messageId: "messageId",
    awsAccountId: "awsAccountId",
    from: "from",
    recipient: "recipient",
    subject: "subject",
    status: "status",
    sentAt: "sentAt",
    organizationId: "organizationId",
    channel: "channel",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ op: "and", args }),
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  or: (...args: unknown[]) => ({ op: "or", args }),
}));

// Heavy interactive children are not under test here.
vi.mock("@/components/email-archive-viewer", () => ({
  EmailArchiveViewer: () => null,
}));

vi.mock("../components/email-fields", () => ({
  EmailFields: () => null,
}));

type ListFilters = { days?: string; q?: string; status?: string };

async function renderDetailPage(listFilters: ListFilters = {}) {
  const { default: EmailDetailPage } = await import("../page");
  const element = await EmailDetailPage({
    params: Promise.resolve({ orgSlug: ORG_SLUG, emailId: EMAIL_ID }),
    searchParams: Promise.resolve(listFilters),
  });
  return render(element as React.ReactElement);
}

/** A message Postgres knows about and DynamoDB has no events for. */
const SENT_PG_RECORD = {
  id: EMAIL_ID,
  messageId: "0100018f-aaaa-bbbb-cccc-ddddeeeeffff",
  awsAccountId: "acc-1",
  from: "billing@acme.test",
  recipient: "customer@example.com",
  subject: "Your invoice",
  status: "sent",
  sentAt: new Date("2026-08-18T18:06:00.000Z"),
};

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  queryEmailEventsMock.mockResolvedValue([]);
  queryEventsByMessageIdsMock.mockResolvedValue([]);
  selectMessageSendMock.mockResolvedValue([]);
  findAwsAccountsMock.mockResolvedValue([
    { id: "acc-1", accountId: "123456789012", organizationId: ORG_ID },
  ]);
});

describe("Email detail page — failure states", () => {
  it("404s on a genuine miss instead of redirecting to the list", async () => {
    await expect(renderDetailPage()).rejects.toThrow(NOT_FOUND_SIGNAL);

    expect(notFoundMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("names an expired-credentials failure and offers a retry", async () => {
    const expired = new Error(
      "The security token included in the request is expired"
    );
    expired.name = "ExpiredTokenException";
    queryEmailEventsMock.mockRejectedValue(expired);

    await renderDetailPage();

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByText(/couldn't authenticate/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /try again/i })
    ).toBeInTheDocument();
  });

  it("distinguishes a denied-permission failure from expired credentials", async () => {
    queryEmailEventsMock.mockRejectedValue(
      new Error(
        "Failed to query DynamoDB: User is not authorized to perform: dynamodb:Query (AccessDeniedException)"
      )
    );

    await renderDetailPage();

    expect(screen.getByText(/denied access/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/couldn't authenticate/i)
    ).not.toBeInTheDocument();
  });

  it("explains a missing AWS connection and links to email setup", async () => {
    findAwsAccountsMock.mockResolvedValue([]);

    await renderDetailPage();

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(screen.getByText(/no aws account connected/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /connect an aws account/i })
    ).toHaveAttribute("href", `/${ORG_SLUG}/emails/setup`);
  });

  it("says a recorded-but-unsent message has not been sent yet", async () => {
    selectMessageSendMock.mockResolvedValue([
      {
        id: EMAIL_ID,
        messageId: null,
        awsAccountId: "acc-1",
        from: "hello@acme.test",
        recipient: "customer@example.com",
        subject: "Welcome aboard",
        status: "queued",
        sentAt: null,
      },
    ]);

    await renderDetailPage();

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(screen.getByText(/hasn't been sent yet/i)).toBeInTheDocument();
    expect(screen.getByText(/customer@example.com/)).toBeInTheDocument();
  });

  it("keeps a link back to the emails list on every failure state", async () => {
    findAwsAccountsMock.mockResolvedValue([]);

    await renderDetailPage();

    const backLinks = screen
      .getAllByRole("link", { name: /back to emails/i })
      .map((link) => link.getAttribute("href"));

    expect(backLinks).toContain(`/${ORG_SLUG}/emails`);
  });
});

/**
 * Audit finding F11. A thrown DynamoDB read and a genuinely empty history both
 * rendered "No events recorded yet", so a permissions or region problem read to
 * the user as a factual claim about their message: it has no delivery events.
 */
describe("Email detail page — timeline states", () => {
  beforeEach(() => {
    selectMessageSendMock.mockResolvedValue([SENT_PG_RECORD]);
  });

  it("says the timeline is unavailable, names the account, and offers a retry", async () => {
    queryEmailEventsMock.mockRejectedValue(
      new Error("Failed to query DynamoDB: connection reset")
    );

    await renderDetailPage();

    expect(screen.getByText("Event timeline unavailable")).toBeInTheDocument();
    expect(screen.getByText(/1234\.\.\.9012/)).toBeInTheDocument();
    expect(screen.getByText("wraps email doctor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("does not call an unreadable timeline empty", async () => {
    queryEmailEventsMock.mockRejectedValue(
      new Error("Failed to query DynamoDB: connection reset")
    );

    await renderDetailPage();

    expect(screen.queryByText("No events recorded")).toBeNull();
    expect(screen.queryByText(/no events recorded yet/i)).toBeNull();
  });

  it("calls a successful empty read empty, and blames retention rather than Wraps", async () => {
    await renderDetailPage();

    expect(screen.getByText("No events recorded")).toBeInTheDocument();
    expect(screen.getByText(/retention you configured/i)).toBeInTheDocument();
    expect(screen.queryByText("Event timeline unavailable")).toBeNull();
  });

  it("distinguishes an undeployed event pipeline from an unreadable one", async () => {
    const missingTable = new Error(
      "Requested resource not found (ResourceNotFoundException)"
    );
    // AWS SDK v3 hands back `name: "Error"` often enough that the name alone
    // cannot be trusted - the classifier reads name and message together.
    queryEmailEventsMock.mockRejectedValue(missingTable);

    await renderDetailPage();

    expect(
      screen.getByText("Event history isn't deployed for this account")
    ).toBeInTheDocument();
    expect(screen.getByText("wraps email deploy")).toBeInTheDocument();
    expect(screen.queryByText("Event timeline unavailable")).toBeNull();
  });

  it("renders the real timeline when the read succeeds with events", async () => {
    queryEventsByMessageIdsMock.mockResolvedValue([
      {
        messageId: SENT_PG_RECORD.messageId,
        eventType: "Send",
        sentAt: 1,
        createdAt: Date.parse("2026-08-18T18:06:00.000Z"),
        mailSentAt: Date.parse("2026-08-18T18:06:00.000Z"),
        from: SENT_PG_RECORD.from,
        to: [SENT_PG_RECORD.recipient],
        subject: SENT_PG_RECORD.subject,
        additionalData: null,
      },
    ]);

    await renderDetailPage();

    expect(screen.queryByText("No events recorded")).toBeNull();
    expect(screen.queryByText("Event timeline unavailable")).toBeNull();
  });
});

/** Audit finding F8 - the back link used to be a bare list URL. */
describe("Email detail page — back link", () => {
  it("returns to the filtered view the message was opened from", async () => {
    selectMessageSendMock.mockResolvedValue([SENT_PG_RECORD]);

    await renderDetailPage({ days: "30", q: "invoice", status: "bounced" });

    const backLink = screen.getByRole("link", { name: /back to emails/i });
    expect(backLink).toHaveAttribute(
      "href",
      `/${ORG_SLUG}/emails?days=30&status=bounced&q=invoice`
    );
  });

  it("falls back to the bare list when no filters were carried", async () => {
    selectMessageSendMock.mockResolvedValue([SENT_PG_RECORD]);

    await renderDetailPage();

    expect(
      screen.getByRole("link", { name: /back to emails/i })
    ).toHaveAttribute("href", `/${ORG_SLUG}/emails`);
  });
});
