/**
 * Scheduler Service Unit Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Create a hoisted mock that can be referenced in the factory
const mockSend = vi.hoisted(() => vi.fn());

// Mock the AWS SDK before importing the service
vi.mock("@aws-sdk/client-scheduler", () => {
  return {
    SchedulerClient: class MockSchedulerClient {
      send = mockSend;
    },
    CreateScheduleCommand: vi.fn((params) => ({ ...params, _type: "CreateScheduleCommand" })),
    DeleteScheduleCommand: vi.fn((params) => ({ ...params, _type: "DeleteScheduleCommand" })),
  };
});

// Import after mocking
import {
  createBroadcastSchedule,
  deleteBroadcastSchedule,
} from "../scheduler";

describe("Scheduler Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
  });

  describe("createBroadcastSchedule", () => {
    const baseParams = {
      batchId: "test-batch-123",
      organizationId: "org-456",
      awsAccountId: "aws-789",
      scheduledFor: new Date("2025-01-15T14:00:00.000Z"),
      channel: "email" as const,
    };

    it("returns schedule name without calling AWS when config is missing (non-production)", async () => {
      // Environment variables are not set by default in tests
      const result = await createBroadcastSchedule(baseParams);

      expect(result).toBe("wraps-batch-test-batch-123");
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("handles SMS channel", async () => {
      const smsParams = {
        ...baseParams,
        channel: "sms" as const,
      };

      const result = await createBroadcastSchedule(smsParams);

      expect(result).toBe("wraps-batch-test-batch-123");
    });

    it("generates correct schedule name from batchId", async () => {
      const params = {
        ...baseParams,
        batchId: "unique-id-abc-123",
      };

      const result = await createBroadcastSchedule(params);

      expect(result).toBe("wraps-batch-unique-id-abc-123");
    });
  });

  describe("deleteBroadcastSchedule", () => {
    it("skips deletion when config is missing (non-production)", async () => {
      await deleteBroadcastSchedule("test-batch-123");

      expect(mockSend).not.toHaveBeenCalled();
    });

    it("returns without error", async () => {
      await expect(deleteBroadcastSchedule("test-batch-123")).resolves.toBeUndefined();
    });
  });
});
