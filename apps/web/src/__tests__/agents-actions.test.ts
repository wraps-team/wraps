import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock boundaries — system edges only ───────────────────────────────────────
// The customer-side effects live in apps/api; these actions reach them over
// HTTP. So we mock the REAL boundaries: `fetch` to the API, the better-auth
// session, and the notification helper. The audit write is asserted as a
// behavior (an audit row was inserted with the right action + metadata), not by
// internal call-shape trivia.

const {
  mockVerifyOrgAccess,
  mockFindAgentForOrg,
  mockFindApprovalForOrg,
  mockNotifyOrg,
  mockGetSession,
  mockInsertValues,
  mockInsert,
} = vi.hoisted(() => ({
  mockVerifyOrgAccess: vi.fn(),
  mockFindAgentForOrg: vi.fn(),
  mockFindApprovalForOrg: vi.fn(),
  mockNotifyOrg: vi.fn(),
  mockGetSession: vi.fn(),
  mockInsertValues: vi.fn().mockResolvedValue([]),
  mockInsert: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@wraps/auth", () => ({
  auth: { api: { getSession: mockGetSession } },
}));

vi.mock("@/actions/shared/verify-org-access", () => ({
  verifyOrgAccess: mockVerifyOrgAccess,
}));

vi.mock("@wraps/auth/notify", () => ({
  notifyOrg: mockNotifyOrg,
}));

vi.mock("@wraps/db", () => ({
  db: { insert: mockInsert },
  findAgentForOrg: mockFindAgentForOrg,
  findApprovalForOrg: mockFindApprovalForOrg,
  listAgentsForOrg: vi.fn(),
  listApprovalQueueForOrg: vi.fn(),
  auditLog: { __table: "audit_log" },
}));

const { killAgent, approveSend, rejectSend } = await import("@/actions/agents");

// ── Fixtures ──────────────────────────────────────────────────────────────────

const OWNER_ACCESS = {
  role: "owner",
  orgSlug: "test-org",
  userId: "user-123",
  userEmail: "owner@example.com",
  userName: "Owner",
};
const MEMBER_ACCESS = {
  role: "member",
  orgSlug: "test-org",
  userId: "user-456",
  userEmail: "member@example.com",
  userName: "Member",
};
const TEST_ORG_ID = "test-org-123";
const API_URL = "http://localhost:3001";

const AGENT = {
  id: "agent-1",
  organizationId: TEST_ORG_ID,
  name: "support-bot",
  emailAddress: "support-bot@agents.example.com",
  domain: "agents.example.com",
  status: "ACTIVE" as const,
  policy: {
    maxPerHour: 20,
    maxPerDay: 100,
    allowedRecipients: [],
    allowedRecipientDomains: [],
  },
  createdBy: "user-123",
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

const APPROVAL = {
  id: "approval-1",
  organizationId: TEST_ORG_ID,
  agentId: "agent-1",
  payload: {
    from: "support-bot@agents.example.com",
    to: "customer@example.com",
    subject: "Hello",
    text: "Hi",
  },
  reason: "recipient not allowlisted",
  status: "PENDING" as const,
  decidedBy: null,
  decidedAt: null,
  messageId: null,
  errorMessage: null,
  createdAt: new Date("2026-01-02T00:00:00Z"),
};

function mockFetchOnce(status: number, body: unknown) {
  const ok = status >= 200 && status < 300;
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok,
    status,
    text: async () => JSON.stringify(body),
  });
}

function lastFetch() {
  const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
  const [url, init] = calls.at(-1) as [string, RequestInit];
  return { url, init };
}

function auditRows() {
  return mockInsertValues.mock.calls.map((c) => c[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockInsert.mockReturnValue({ values: mockInsertValues });
  mockInsertValues.mockResolvedValue([]);
  mockGetSession.mockResolvedValue({
    user: { id: OWNER_ACCESS.userId, email: OWNER_ACCESS.userEmail },
    session: { id: "session-1", token: "session-token-abc" },
  });
  global.fetch = vi.fn();
  process.env.NEXT_PUBLIC_API_URL = API_URL;
});

afterEach(() => {
  process.env.NEXT_PUBLIC_API_URL = undefined;
});

// ── killAgent ─────────────────────────────────────────────────────────────────

describe("killAgent", () => {
  it("calls the API kill route with the forwarded session and audits the kill", async () => {
    mockVerifyOrgAccess.mockResolvedValue(OWNER_ACCESS);
    mockFindAgentForOrg.mockResolvedValue(AGENT);
    mockFetchOnce(200, {
      agent: { ...AGENT, status: "KILLED" },
      syncStatus: "synced",
    });

    const result = await killAgent("agent-1", TEST_ORG_ID);

    expect(result).toMatchObject({ success: true, syncStatus: "synced" });

    // Hit the right API route with method + auth header + org header.
    const { url, init } = lastFetch();
    expect(url).toBe(`${API_URL}/v1/agents/agent-1/kill`);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer session-token-abc");
    expect(headers["X-Organization-Id"]).toBe(TEST_ORG_ID);

    // Audit row written (behavior, not call-shape): action + resourceId + metadata.
    const rows = auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      organizationId: TEST_ORG_ID,
      action: "agent.killed",
      resourceId: "agent-1",
      metadata: expect.objectContaining({
        name: "support-bot",
        syncStatus: "synced",
      }),
    });

    expect(mockNotifyOrg).toHaveBeenCalledWith(
      expect.objectContaining({ type: "agent.killed" })
    );
    // On a clean sync, the org is told the agent can no longer send.
    const successBody = mockNotifyOrg.mock.calls.at(-1)?.[0].body as string;
    expect(successBody).toContain("can no longer send email");
    expect(successBody).not.toMatch(/sync/i);

    if (result.success) {
      expect(result.agent.status).toBe("KILLED");
    }
  });

  it("surfaces the sync-failed warning while still reporting success", async () => {
    mockVerifyOrgAccess.mockResolvedValue(OWNER_ACCESS);
    mockFindAgentForOrg.mockResolvedValue(AGENT);
    mockFetchOnce(200, {
      agent: { ...AGENT, status: "KILLED" },
      syncStatus: "failed",
      warning: "Kill applied in Wraps, but syncing failed. Retry the kill.",
    });

    const result = await killAgent("agent-1", TEST_ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.syncStatus).toBe("failed");
      expect(result.warning).toContain("syncing failed");
    }
    // The Neon kill is durable → still reflected KILLED locally.
    if (result.success) {
      expect(result.agent.status).toBe("KILLED");
    }

    // The org notification must be honest: on a failed sync it warns the agent
    // may still send, not that it "can no longer send email".
    const failedBody = mockNotifyOrg.mock.calls.at(-1)?.[0].body as string;
    expect(failedBody).toMatch(/sync/i);
    expect(failedBody).toContain("may still send");
    expect(failedBody).not.toContain("can no longer send email");
  });

  it("returns the API error when the caller is not owner/admin (403)", async () => {
    mockVerifyOrgAccess.mockResolvedValue(OWNER_ACCESS);
    mockFindAgentForOrg.mockResolvedValue(AGENT);
    mockFetchOnce(403, { error: "Forbidden" });

    const result = await killAgent("agent-1", TEST_ORG_ID);

    expect(result).toEqual({ success: false, error: "Forbidden" });
    // No audit row on a failed API call.
    expect(auditRows()).toHaveLength(0);
    expect(mockNotifyOrg).not.toHaveBeenCalled();
  });

  it("denies members at the web layer before hitting the API", async () => {
    mockVerifyOrgAccess.mockResolvedValue(MEMBER_ACCESS);

    const result = await killAgent("agent-1", TEST_ORG_ID);

    expect(result).toEqual({
      success: false,
      error: "You don't have permission to perform this action",
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns an error when the agent is not in the org", async () => {
    mockVerifyOrgAccess.mockResolvedValue(OWNER_ACCESS);
    mockFindAgentForOrg.mockResolvedValue(null);

    const result = await killAgent("missing", TEST_ORG_ID);

    expect(result).toEqual({ success: false, error: "Agent not found" });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ── approveSend ───────────────────────────────────────────────────────────────

describe("approveSend", () => {
  it("approves + sends: returns success and audits the SENT outcome", async () => {
    mockVerifyOrgAccess.mockResolvedValue(OWNER_ACCESS);
    mockFindApprovalForOrg.mockResolvedValue(APPROVAL);
    mockFetchOnce(200, {
      ...APPROVAL,
      status: "SENT",
      messageId: "msg-789",
      decidedBy: OWNER_ACCESS.userId,
      decidedAt: "2026-01-03T00:00:00Z",
    });

    const result = await approveSend("approval-1", TEST_ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.approval.status).toBe("SENT");
      expect(result.approval.messageId).toBe("msg-789");
      expect(result.approval.decidedAt).toBeInstanceOf(Date);
    }

    const { url, init } = lastFetch();
    expect(url).toBe(`${API_URL}/v1/agents/approvals/approval-1/approve`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer session-token-abc"
    );

    const rows = auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "agent.send_approved",
      resourceId: "approval-1",
      metadata: expect.objectContaining({ outcome: "SENT" }),
    });
    expect(mockNotifyOrg).toHaveBeenCalledWith(
      expect.objectContaining({ type: "agent.send_approved" })
    );
  });

  it("surfaces the errorMessage when the enforcer send FAILED", async () => {
    mockVerifyOrgAccess.mockResolvedValue(OWNER_ACCESS);
    mockFindApprovalForOrg.mockResolvedValue(APPROVAL);
    mockFetchOnce(200, {
      ...APPROVAL,
      status: "FAILED",
      errorMessage: "SES rejected: address not verified",
      decidedBy: OWNER_ACCESS.userId,
      decidedAt: "2026-01-03T00:00:00Z",
    });

    const result = await approveSend("approval-1", TEST_ORG_ID);

    expect(result).toEqual({
      success: false,
      error: "SES rejected: address not verified",
    });
    // The decision + failed outcome is still audited.
    const rows = auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "agent.send_approved",
      metadata: expect.objectContaining({
        outcome: "FAILED",
        errorMessage: "SES rejected: address not verified",
      }),
    });
    // A failed send is not announced as an approval.
    expect(mockNotifyOrg).not.toHaveBeenCalled();
  });

  it("returns the API concurrency message on 409 without auditing", async () => {
    mockVerifyOrgAccess.mockResolvedValue(OWNER_ACCESS);
    mockFindApprovalForOrg.mockResolvedValue(APPROVAL);
    mockFetchOnce(409, { error: "Approval already SENT" });

    const result = await approveSend("approval-1", TEST_ORG_ID);

    expect(result).toEqual({
      success: false,
      error: "Approval already SENT",
    });
    expect(auditRows()).toHaveLength(0);
    expect(mockNotifyOrg).not.toHaveBeenCalled();
  });

  it("returns an error when the approval is not in the org", async () => {
    mockVerifyOrgAccess.mockResolvedValue(OWNER_ACCESS);
    mockFindApprovalForOrg.mockResolvedValue(null);

    const result = await approveSend("missing", TEST_ORG_ID);

    expect(result).toEqual({ success: false, error: "Approval not found" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("denies members at the web layer before hitting the API", async () => {
    mockVerifyOrgAccess.mockResolvedValue(MEMBER_ACCESS);

    const result = await approveSend("approval-1", TEST_ORG_ID);

    expect(result).toEqual({
      success: false,
      error: "You don't have permission to perform this action",
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ── rejectSend ────────────────────────────────────────────────────────────────

describe("rejectSend", () => {
  it("rejects: returns success and audits the rejection", async () => {
    mockVerifyOrgAccess.mockResolvedValue(OWNER_ACCESS);
    mockFindApprovalForOrg.mockResolvedValue(APPROVAL);
    mockFetchOnce(200, {
      ...APPROVAL,
      status: "REJECTED",
      decidedBy: OWNER_ACCESS.userId,
      decidedAt: "2026-01-03T00:00:00Z",
    });

    const result = await rejectSend("approval-1", TEST_ORG_ID);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.approval.status).toBe("REJECTED");
    }

    const { url, init } = lastFetch();
    expect(url).toBe(`${API_URL}/v1/agents/approvals/approval-1/reject`);
    expect(init.method).toBe("POST");

    const rows = auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "agent.send_rejected",
      resourceId: "approval-1",
    });
    expect(mockNotifyOrg).toHaveBeenCalledWith(
      expect.objectContaining({ type: "agent.send_rejected" })
    );
  });

  it("returns the API message when the row was already decided (409)", async () => {
    mockVerifyOrgAccess.mockResolvedValue(OWNER_ACCESS);
    mockFindApprovalForOrg.mockResolvedValue(APPROVAL);
    mockFetchOnce(409, { error: "Approval already REJECTED" });

    const result = await rejectSend("approval-1", TEST_ORG_ID);

    expect(result).toEqual({
      success: false,
      error: "Approval already REJECTED",
    });
    expect(auditRows()).toHaveLength(0);
    expect(mockNotifyOrg).not.toHaveBeenCalled();
  });
});
