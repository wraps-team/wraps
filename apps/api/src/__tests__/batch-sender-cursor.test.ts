/**
 * Batch Sender - Cursor-based Pagination Tests
 *
 * Tests that getContactsChunk uses keyset (cursor) pagination
 * instead of offset-based pagination to prevent duplicate/skipped
 * sends when contacts are added or deleted mid-batch.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Track query chain calls
let queryChain: {
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  offset: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};
let contactQueryResult: unknown[] = [];

vi.mock("@wraps/db", async () => {
  const actual = await vi.importActual("@wraps/db");

  return {
    ...actual,
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockImplementation(() => {
          queryChain = {
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            offset: vi.fn().mockReturnThis(),
            limit: vi
              .fn()
              .mockImplementation(() => Promise.resolve(contactQueryResult)),
          };
          return queryChain;
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnThis(),
      }),
    },
  };
});

vi.mock("../lib/unsubscribe-token", () => ({
  generateUnsubscribeToken: vi.fn().mockResolvedValue("mock-token"),
}));

vi.mock("../services/credentials", () => ({
  getCredentials: vi.fn().mockResolvedValue({
    accessKeyId: "test",
    secretAccessKey: "test",
    sessionToken: "test",
  }),
}));

vi.mock("../lib/activation-tracking", () => ({
  trackFirstEmailSent: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocks
const { getContactsChunk } = await import("../workers/batch-sender");

describe("getContactsChunk - cursor pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    contactQueryResult = [];
  });

  it("does not use offset when cursor is provided", async () => {
    contactQueryResult = [
      {
        id: "contact-1",
        email: "alice@example.com",
        phone: null,
        firstName: "Alice",
        lastName: "Smith",
        company: null,
        jobTitle: null,
        properties: {},
        createdAt: new Date("2026-01-15T10:00:00Z"),
      },
    ];

    const cursor = {
      createdAt: "2026-01-14T10:00:00Z",
      id: "contact-0",
    };

    const result = await getContactsChunk(
      "org-123",
      "email",
      50,
      undefined, // no filter
      cursor
    );

    expect(result).toHaveLength(1);
    // Key assertion: offset must NOT be called when cursor is provided
    expect(queryChain.offset).not.toHaveBeenCalled();
  });

  it("works without cursor for first chunk", async () => {
    contactQueryResult = [
      {
        id: "contact-1",
        email: "bob@example.com",
        phone: null,
        firstName: "Bob",
        lastName: null,
        company: null,
        jobTitle: null,
        properties: {},
        createdAt: new Date("2026-01-15T10:00:00Z"),
      },
    ];

    const result = await getContactsChunk("org-123", "email", 50);

    expect(result).toHaveLength(1);
    // No cursor = no offset either (first chunk starts from beginning)
    expect(queryChain.offset).not.toHaveBeenCalled();
  });

  it("uses offset for legacy chunk messages without cursor", async () => {
    contactQueryResult = [
      {
        id: "contact-51",
        email: "legacy@example.com",
        phone: null,
        firstName: "Legacy",
        lastName: null,
        company: null,
        jobTitle: null,
        properties: {},
        createdAt: new Date("2026-01-15T10:01:00Z"),
      },
    ];

    const result = await getContactsChunk(
      "org-123",
      "email",
      50,
      undefined,
      undefined,
      50
    );

    expect(result).toHaveLength(1);
    expect(queryChain.offset).toHaveBeenCalledWith(50);
  });
});
