import { aiUsageLog, aiUsageMonthly, db } from "@wraps/db";
import { eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { testOrganization, testUser } from "@/app/api/__tests__/setup";
import {
  checkAiUsageLimit,
  getAiMessageLimit,
  getAiUsageCount,
  getCurrentPeriodKey,
  getUsageSummary,
  getUsageWarning,
  incrementAiUsage,
  logAiUsage,
  trackAiRequest,
} from "../ai-usage";

// Mock the organization helper to return specific plans
const mockGetOrganizationPlanId = vi.fn();
vi.mock("@/lib/organization", () => ({
  getOrganizationPlanId: (...args: any[]) => mockGetOrganizationPlanId(...args),
}));

describe("AI Usage Functions", () => {
  beforeAll(() => {
    // Default mock: return starter plan
    mockGetOrganizationPlanId.mockResolvedValue("starter");
  });

  afterEach(async () => {
    // Clean up test data after each test
    await db
      .delete(aiUsageLog)
      .where(eq(aiUsageLog.organizationId, testOrganization.id));
    await db
      .delete(aiUsageMonthly)
      .where(eq(aiUsageMonthly.organizationId, testOrganization.id));

    // Reset mock to default
    mockGetOrganizationPlanId.mockResolvedValue("starter");
  });

  describe("getCurrentPeriodKey", () => {
    it("should return current month in YYYY-MM format", () => {
      const key = getCurrentPeriodKey();
      expect(key).toMatch(/^\d{4}-\d{2}$/);

      const now = new Date();
      const expectedYear = now.getUTCFullYear();
      const expectedMonth = String(now.getUTCMonth() + 1).padStart(2, "0");
      expect(key).toBe(`${expectedYear}-${expectedMonth}`);
    });
  });

  describe("getAiMessageLimit", () => {
    it("should return the published limit for each purchasable plan", () => {
      // Hardcoded on purpose. getAiMessageLimit just reads PLANS, so
      // comparing against PLANS would assert nothing — this is a tripwire that
      // makes changing a published allowance require restating it here.
      expect(getAiMessageLimit("free")).toBe(10);
      expect(getAiMessageLimit("pro")).toBe(250);
      expect(getAiMessageLimit("business")).toBe(1000);
    });

    // The three-tier restructure gave each legacy plan its successor's
    // allowances (starter→pro, growth→business, scale→business), the same
    // parity rule used for maxAwsAccounts and sso. These assertions state that
    // rule rather than repeating the numbers, so a future change to Pro's or
    // Business's allowance cannot silently strand a grandfathered customer.
    //
    // This test previously asserted the pre-restructure numbers (starter 50,
    // growth 250) and was the failing suite in `pnpm check:all`.
    it("should give legacy plans their successor's allowance", () => {
      expect(getAiMessageLimit("starter")).toBe(getAiMessageLimit("pro"));
      expect(getAiMessageLimit("growth")).toBe(getAiMessageLimit("business"));
      expect(getAiMessageLimit("scale")).toBe(getAiMessageLimit("business"));
    });

    it("should return default (50) for unknown plan", () => {
      expect(getAiMessageLimit("unknown-plan")).toBe(50);
    });
  });

  describe("getAiUsageCount", () => {
    it("should return 0 when no usage exists", async () => {
      const count = await getAiUsageCount(testOrganization.id);
      expect(count).toBe(0);
    });

    it("should return current message count", async () => {
      const periodKey = getCurrentPeriodKey();

      // Insert test data
      await db.insert(aiUsageMonthly).values({
        organizationId: testOrganization.id,
        periodKey,
        messageCount: 25,
      });

      const count = await getAiUsageCount(testOrganization.id);
      expect(count).toBe(25);
    });

    it("should not count messages from different periods", async () => {
      const currentPeriod = getCurrentPeriodKey();
      const lastMonth = "2024-01"; // A past period

      // Insert data for current and past periods
      await db.insert(aiUsageMonthly).values([
        {
          organizationId: testOrganization.id,
          periodKey: currentPeriod,
          messageCount: 10,
        },
        {
          organizationId: testOrganization.id,
          periodKey: lastMonth,
          messageCount: 100,
        },
      ]);

      const count = await getAiUsageCount(testOrganization.id);
      expect(count).toBe(10); // Only current period
    });
  });

  describe("incrementAiUsage", () => {
    it("should create new record when none exists", async () => {
      const newCount = await incrementAiUsage(testOrganization.id);
      expect(newCount).toBe(1);

      // Verify in database
      const count = await getAiUsageCount(testOrganization.id);
      expect(count).toBe(1);
    });

    it("should increment existing count", async () => {
      const periodKey = getCurrentPeriodKey();

      // Insert initial data
      await db.insert(aiUsageMonthly).values({
        organizationId: testOrganization.id,
        periodKey,
        messageCount: 5,
      });

      const newCount = await incrementAiUsage(testOrganization.id);
      expect(newCount).toBe(6);
    });

    it("should handle concurrent increments correctly", async () => {
      // Run multiple increments concurrently
      const results = await Promise.all([
        incrementAiUsage(testOrganization.id),
        incrementAiUsage(testOrganization.id),
        incrementAiUsage(testOrganization.id),
      ]);

      // All should complete, final count should be 3
      const finalCount = await getAiUsageCount(testOrganization.id);
      expect(finalCount).toBe(3);

      // Results should be unique incrementing values
      const sortedResults = results.sort((a, b) => a - b);
      expect(sortedResults).toEqual([1, 2, 3]);
    });
  });

  describe("logAiUsage", () => {
    it("should log usage with all fields", async () => {
      await logAiUsage({
        organizationId: testOrganization.id,
        userId: testUser.id,
        featureType: "ai_chat",
        templateId: "template-123",
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        model: "grok-1",
        durationMs: 1500,
      });

      const logs = await db.query.aiUsageLog.findMany({
        where: eq(aiUsageLog.organizationId, testOrganization.id),
      });

      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        organizationId: testOrganization.id,
        userId: testUser.id,
        featureType: "ai_chat",
        templateId: "template-123",
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        model: "grok-1",
        durationMs: 1500,
      });
    });

    it("should use default feature type", async () => {
      await logAiUsage({
        organizationId: testOrganization.id,
        userId: testUser.id,
      });

      const logs = await db.query.aiUsageLog.findMany({
        where: eq(aiUsageLog.organizationId, testOrganization.id),
      });

      expect(logs[0].featureType).toBe("ai_chat");
    });

    it("should include period key for filtering", async () => {
      await logAiUsage({
        organizationId: testOrganization.id,
        userId: testUser.id,
      });

      const logs = await db.query.aiUsageLog.findMany({
        where: eq(aiUsageLog.organizationId, testOrganization.id),
      });

      expect(logs[0].periodKey).toBe(getCurrentPeriodKey());
    });
  });

  describe("checkAiUsageLimit", () => {
    // Derived, not hardcoded: these cases exercise the allow/deny boundary,
    // not one tier's specific allowance. Spelling the numbers out is what left
    // this suite asserting the pre-restructure limits.
    const PRO_LIMIT = getAiMessageLimit("pro");
    const BUSINESS_LIMIT = getAiMessageLimit("business");

    it("should allow usage when under limit", async () => {
      mockGetOrganizationPlanId.mockResolvedValueOnce("pro");

      const result = await checkAiUsageLimit(testOrganization.id);
      expect(result.allowed).toBe(true);
      expect(result.current).toBe(0);
      expect(result.limit).toBe(PRO_LIMIT);
      expect(result.planId).toBe("pro");
    });

    it("should deny usage when at limit", async () => {
      const periodKey = getCurrentPeriodKey();
      mockGetOrganizationPlanId.mockResolvedValueOnce("pro");

      await db.insert(aiUsageMonthly).values({
        organizationId: testOrganization.id,
        periodKey,
        messageCount: PRO_LIMIT,
      });

      const result = await checkAiUsageLimit(testOrganization.id);
      expect(result.allowed).toBe(false);
      expect(result.current).toBe(PRO_LIMIT);
      expect(result.limit).toBe(PRO_LIMIT);
    });

    it("should deny usage when over limit", async () => {
      const periodKey = getCurrentPeriodKey();
      mockGetOrganizationPlanId.mockResolvedValueOnce("pro");

      await db.insert(aiUsageMonthly).values({
        organizationId: testOrganization.id,
        periodKey,
        messageCount: PRO_LIMIT + 5,
      });

      const result = await checkAiUsageLimit(testOrganization.id);
      expect(result.allowed).toBe(false);
      expect(result.current).toBe(PRO_LIMIT + 5);
    });

    it("should respect different plan limits", async () => {
      const periodKey = getCurrentPeriodKey();
      mockGetOrganizationPlanId.mockResolvedValueOnce("business");

      // Over Pro's allowance, still inside Business's.
      await db.insert(aiUsageMonthly).values({
        organizationId: testOrganization.id,
        periodKey,
        messageCount: PRO_LIMIT + 1,
      });

      const businessResult = await checkAiUsageLimit(testOrganization.id);
      expect(businessResult.allowed).toBe(true);
      expect(businessResult.limit).toBe(BUSINESS_LIMIT);
    });

    it("should allow high usage for scale plan", async () => {
      const periodKey = getCurrentPeriodKey();
      mockGetOrganizationPlanId.mockResolvedValueOnce("scale");

      // Comfortably under scale's allowance, derived rather than hardcoded:
      // this was a literal 800 against a then-1000 limit, and silently became
      // an over-limit value when Business (and so scale) dropped to 500.
      const underScaleLimit = Math.floor(getAiMessageLimit("scale") * 0.8);
      await db.insert(aiUsageMonthly).values({
        organizationId: testOrganization.id,
        periodKey,
        messageCount: underScaleLimit,
      });

      const result = await checkAiUsageLimit(testOrganization.id);
      expect(result.allowed).toBe(true);
      // scale is a legacy id mapped to Business, so it must report Business's
      // allowance — that mapping is what this case exists to prove, not the
      // literal number, which BUSINESS_LIMIT already pins above.
      expect(result.limit).toBe(BUSINESS_LIMIT);
    });
  });

  describe("trackAiRequest", () => {
    it("should increment usage and log request", async () => {
      const newCount = await trackAiRequest({
        organizationId: testOrganization.id,
        userId: testUser.id,
        featureType: "ai_chat",
        inputTokens: 50,
        outputTokens: 100,
      });

      expect(newCount).toBe(1);

      // Verify usage was incremented
      const usageCount = await getAiUsageCount(testOrganization.id);
      expect(usageCount).toBe(1);

      // Verify log was created
      const logs = await db.query.aiUsageLog.findMany({
        where: eq(aiUsageLog.organizationId, testOrganization.id),
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].inputTokens).toBe(50);
      expect(logs[0].outputTokens).toBe(100);
    });
  });

  describe("getUsageWarning", () => {
    it("should not warn when under 90% usage", () => {
      const result = getUsageWarning(40, 50); // 80%
      expect(result.shouldWarn).toBe(false);
      expect(result.remaining).toBe(10);
      expect(result.percentUsed).toBe(80);
      expect(result.message).toBeUndefined();
    });

    it("should warn when at 90% usage", () => {
      const result = getUsageWarning(45, 50); // 90%
      expect(result.shouldWarn).toBe(true);
      expect(result.remaining).toBe(5);
      expect(result.percentUsed).toBe(90);
      expect(result.message).toContain("5 AI messages remaining");
    });

    it("should warn when over 90% usage", () => {
      const result = getUsageWarning(48, 50); // 96%
      expect(result.shouldWarn).toBe(true);
      expect(result.remaining).toBe(2);
      expect(result.percentUsed).toBe(96);
    });

    it("should show specific message for last 3 messages", () => {
      const result = getUsageWarning(47, 50); // 3 remaining
      expect(result.message).toContain("Only 3 AI messages remaining");
      expect(result.message).toContain("Resets");
    });

    it("should show specific message for last message", () => {
      const result = getUsageWarning(49, 50); // 1 remaining
      expect(result.message).toContain("Only 1 AI message remaining");
      expect(result.message).toContain("Resets");
    });

    it("should show limit reached message when at 0 remaining", () => {
      const result = getUsageWarning(50, 50);
      expect(result.shouldWarn).toBe(true);
      expect(result.remaining).toBe(0);
      expect(result.percentUsed).toBe(100);
      expect(result.message).toContain("You've reached your AI message limit");
      expect(result.message).toContain("Resets");
    });

    it("should handle over limit (negative remaining)", () => {
      const result = getUsageWarning(55, 50);
      expect(result.remaining).toBe(0); // Clamped to 0
      expect(result.percentUsed).toBe(110);
    });

    it("should not warn for unlimited plans", () => {
      const result = getUsageWarning(1000, -1);
      expect(result.shouldWarn).toBe(false);
      expect(result.remaining).toBe(-1);
      expect(result.percentUsed).toBe(0);
      expect(result.message).toBeUndefined();
    });

    it("should handle zero usage", () => {
      const result = getUsageWarning(0, 50);
      expect(result.shouldWarn).toBe(false);
      expect(result.remaining).toBe(50);
      expect(result.percentUsed).toBe(0);
    });
  });

  describe("getUsageSummary", () => {
    it("should return usage summary for current period", async () => {
      const periodKey = getCurrentPeriodKey();
      mockGetOrganizationPlanId.mockResolvedValueOnce("business");

      await db.insert(aiUsageMonthly).values({
        organizationId: testOrganization.id,
        periodKey,
        messageCount: 75,
      });

      const summary = await getUsageSummary(testOrganization.id);
      expect(summary).toEqual({
        periodKey,
        messageCount: 75,
        limit: getAiMessageLimit("business"),
        planId: "business",
      });
    });

    it("should return zero count when no usage", async () => {
      mockGetOrganizationPlanId.mockResolvedValueOnce("pro");

      const summary = await getUsageSummary(testOrganization.id);
      expect(summary.messageCount).toBe(0);
      expect(summary.limit).toBe(getAiMessageLimit("pro"));
    });

    it("should allow querying specific period", async () => {
      const lastMonth = "2024-06";
      mockGetOrganizationPlanId.mockResolvedValueOnce("starter");

      await db.insert(aiUsageMonthly).values({
        organizationId: testOrganization.id,
        periodKey: lastMonth,
        messageCount: 30,
      });

      const summary = await getUsageSummary(testOrganization.id, lastMonth);
      expect(summary.periodKey).toBe(lastMonth);
      expect(summary.messageCount).toBe(30);
    });
  });
});

// Clean up any leftover historical period data
afterAll(async () => {
  await db
    .delete(aiUsageMonthly)
    .where(eq(aiUsageMonthly.periodKey, "2024-01"));
  await db
    .delete(aiUsageMonthly)
    .where(eq(aiUsageMonthly.periodKey, "2024-06"));
});
