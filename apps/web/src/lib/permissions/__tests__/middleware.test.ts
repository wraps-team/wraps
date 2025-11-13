import { auth } from "@wraps/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAWSAccountAccess } from "../middleware";
import { testAWSAccount, testOrganization, testUser, testUser2 } from "./setup";

vi.mock("@wraps/auth");

describe("requireAWSAccountAccess", () => {
  const mockRequest = new Request("http://localhost");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 if no session", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue(null);

    const result = await requireAWSAccountAccess(mockRequest, {
      organizationId: testOrganization.id,
      awsAccountId: testAWSAccount.id,
      permission: "view",
    });

    expect(result.authorized).toBe(false);
    expect(result.response?.status).toBe(401);
  });

  it("should return 403 if access denied", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: testUser2,
      session: { id: "session-123" },
    } as any);

    const result = await requireAWSAccountAccess(mockRequest, {
      organizationId: testOrganization.id,
      awsAccountId: testAWSAccount.id,
      permission: "view",
    });

    expect(result.authorized).toBe(false);
    expect(result.response?.status).toBe(403);
  });

  it("should return authorized true if access granted", async () => {
    vi.mocked(auth.api.getSession).mockResolvedValue({
      user: testUser, // testUser is the owner, so should have access
      session: { id: "session-123" },
    } as any);

    const result = await requireAWSAccountAccess(mockRequest, {
      organizationId: testOrganization.id,
      awsAccountId: testAWSAccount.id,
      permission: "view",
    });

    expect(result.authorized).toBe(true);
    expect(result.userId).toBe(testUser.id);
  });
});
