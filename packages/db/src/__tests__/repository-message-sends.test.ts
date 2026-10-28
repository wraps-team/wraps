import { describe, expect, it, vi } from "vitest";
import type { DbClient } from "../repositories/events";
import {
  decodeCursor,
  encodeCursor,
  getEmailLogByMessageId,
  listEmailLogs,
} from "../repositories/message-sends";

const ORG_ID = "org-email-logs-test";
const MESSAGE_ID = "ses-test-msg-001";

function makeLogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    messageId: MESSAGE_ID,
    status: "sent",
    recipient: "user@example.com",
    subject: null,
    from: "noreply@app.com",
    sourceType: "transactional",
    sentAt: new Date("2026-05-20T10:00:00Z"),
    deliveredAt: null,
    bouncedAt: null,
    bouncedSubType: null,
    createdAt: new Date("2026-05-20T10:00:00Z"),
    ...overrides,
  };
}

function makeMockDbForList(countValue: number, dataRows: unknown[]) {
  const countWhere = vi.fn().mockResolvedValue([{ count: countValue }]);
  const dataWhere = vi.fn().mockReturnValue({
    orderBy: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue(dataRows),
    }),
  });
  const mockSelect = vi
    .fn()
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({ where: countWhere }),
    })
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({ where: dataWhere }),
    });

  return {
    dbClient: { select: mockSelect } as unknown as DbClient,
    countWhere,
    dataWhere,
  };
}

function makeMockDbForGet(row: unknown | null) {
  const mockSelect = vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(row ? [row] : []),
      }),
    }),
  });
  return { select: mockSelect } as unknown as DbClient;
}

describe("Repository: listEmailLogs", () => {
  it("returns org-scoped email logs from mock db", async () => {
    const row = makeLogRow();
    const { dbClient } = makeMockDbForList(1, [row]);

    const result = await listEmailLogs(ORG_ID, {}, dbClient);

    expect(result.logs).toHaveLength(1);
    expect(result.logs[0]).toMatchObject({
      messageId: MESSAGE_ID,
      status: "sent",
      recipient: "user@example.com",
    });
    expect(result.total).toBe(1);
    expect(result.nextCursor).toBeNull();
  });

  it("passes status filter as a WHERE condition on both count and data queries", async () => {
    const bouncedRow = makeLogRow({ status: "bounced" });
    const { dbClient, countWhere, dataWhere } = makeMockDbForList(1, [
      bouncedRow,
    ]);

    const result = await listEmailLogs(ORG_ID, { status: "bounced" }, dbClient);

    expect(result.logs[0]?.status).toBe("bounced");
    // Both the count and data queries receive a WHERE condition containing the status value
    expect(countWhere).toHaveBeenCalledTimes(1);
    expect(dataWhere).toHaveBeenCalledTimes(1);
    // Verify the status value appears in both WHERE conditions (not just the org condition)
    function hasValue(
      node: unknown,
      target: string,
      seen = new WeakSet<object>()
    ): boolean {
      if (typeof node === "string") return node === target;
      if (!node || typeof node !== "object") return false;
      if (seen.has(node as object)) return false;
      seen.add(node as object);
      return Object.values(node as object).some((v) =>
        hasValue(v, target, seen)
      );
    }
    expect(hasValue(countWhere.mock.calls[0]?.[0], "bounced")).toBe(true);
    expect(hasValue(dataWhere.mock.calls[0]?.[0], "bounced")).toBe(true);
  });

  it("returns total: null when cursor is present (skips count query)", async () => {
    const mockDataWhere = vi.fn().mockReturnValue({
      orderBy: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue([]),
      }),
    });
    const dbClient = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: mockDataWhere }),
      }),
    } as unknown as DbClient;

    const result = await listEmailLogs(
      ORG_ID,
      { cursor: encodeCursor(new Date("2026-05-20T10:00:00Z"), "row-id-1") },
      dbClient
    );

    expect(result.total).toBeNull();
  });

  it("total count comes from count query (not paginated results)", async () => {
    const rows = [makeLogRow(), makeLogRow({ messageId: "ses-msg-002" })];
    const { dbClient } = makeMockDbForList(50, rows);

    const result = await listEmailLogs(ORG_ID, { limit: 10 }, dbClient);

    expect(result.total).toBe(50);
    expect(result.logs).toHaveLength(2);
  });

  it("returns a compound (createdAt,id) cursor when rows exceed limit, null when not", async () => {
    const limit = 2;
    const lastVisible = makeLogRow({
      id: "row-page1-last",
      createdAt: new Date("2026-05-20T09:00:00Z"),
    });
    const rows = [
      makeLogRow({ id: "row-page1-first" }),
      lastVisible,
      makeLogRow({ id: "row-sentinel" }), // beyond limit → triggers nextCursor
    ];
    const { dbClient } = makeMockDbForList(10, rows);

    const result = await listEmailLogs(ORG_ID, { limit }, dbClient);

    expect(result.logs).toHaveLength(limit);
    // Cursor must encode the LAST visible row's createdAt AND its id (tiebreaker)
    expect(result.nextCursor).not.toBeNull();
    expect(decodeCursor(result.nextCursor as string)).toEqual({
      createdAt: lastVisible.createdAt,
      id: lastVisible.id,
    });

    const { dbClient: dbClient2 } = makeMockDbForList(2, [
      makeLogRow({ createdAt: new Date("2026-05-20T10:00:00Z") }),
      makeLogRow({ createdAt: new Date("2026-05-20T09:00:00Z") }),
    ]);
    const result2 = await listEmailLogs(ORG_ID, { limit }, dbClient2);
    expect(result2.nextCursor).toBeNull();
  });

  it("keyset cursor filters by (createdAt,id) tuple, not createdAt alone", async () => {
    // Two rows share an identical createdAt (batch insert) — the id tiebreaker
    // is what prevents the next page from skipping the rest of the batch.
    const sharedCreatedAt = new Date("2026-05-20T10:00:00Z");
    let capturedWhere: unknown;
    const dbClient = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation((cond) => {
            capturedWhere = cond;
            return {
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            };
          }),
        }),
      }),
    } as unknown as DbClient;

    await listEmailLogs(
      ORG_ID,
      { cursor: encodeCursor(sharedCreatedAt, "batch-row-007") },
      dbClient
    );

    function hasValue(
      node: unknown,
      target: string,
      seen = new WeakSet<object>()
    ): boolean {
      if (typeof node === "string") {
        return node === target;
      }
      if (!node || typeof node !== "object") {
        return false;
      }
      if (seen.has(node as object)) {
        return false;
      }
      seen.add(node as object);
      return Object.values(node as object).some((v) =>
        hasValue(v, target, seen)
      );
    }
    // The id from the cursor must appear in the WHERE clause (tuple comparison)
    expect(hasValue(capturedWhere, "batch-row-007")).toBe(true);
  });

  it("ignores a malformed cursor instead of throwing", () => {
    expect(decodeCursor("not-a-real-cursor")).toBeNull();
    expect(decodeCursor("")).toBeNull();
    // Round-trips cleanly
    const ts = new Date("2026-05-20T10:00:00Z");
    expect(decodeCursor(encodeCursor(ts, "abc"))).toEqual({
      createdAt: ts,
      id: "abc",
    });
  });

  it("rejects base64 payloads that only look like a cursor", () => {
    const b64 = (s: string) => Buffer.from(s).toString("base64url");
    // JSON with no separator
    expect(
      decodeCursor(b64('{"createdAt":"2026-05-20T10:00:00.000Z","id":"abc"}'))
    ).toBeNull();
    // new Date("5") is a valid date, so a lenient parse would accept this
    expect(decodeCursor(b64("5|abc"))).toBeNull();
    // Parses, but is not the canonical form encodeCursor emits
    expect(decodeCursor(b64("2026-05-20T10:00:00Z|abc"))).toBeNull();
    // Empty id
    expect(decodeCursor(b64("2026-05-20T10:00:00.000Z|"))).toBeNull();
    // Not base64 at all
    expect(decodeCursor("%%%")).toBeNull();
  });
});

describe("Repository: getEmailLogByMessageId", () => {
  it("returns the full row when messageId and organizationId match", async () => {
    const row = makeLogRow({ messageId: MESSAGE_ID });
    const mockDb = makeMockDbForGet(row);

    const result = await getEmailLogByMessageId(MESSAGE_ID, ORG_ID, mockDb);

    expect(result).not.toBeNull();
    expect(result?.messageId).toBe(MESSAGE_ID);
    expect(result?.recipient).toBe("user@example.com");
    expect(result?.sourceType).toBe("transactional");
    expect(result?.status).toBe("sent");
  });

  it("returns null when no row is found for the messageId+org combination (IDOR guard)", async () => {
    const CALLER_ORG = "different-org-id";
    let capturedWhere: unknown;
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation((cond) => {
            capturedWhere = cond;
            return { limit: vi.fn().mockResolvedValue([]) };
          }),
        }),
      }),
    } as unknown as DbClient;

    const result = await getEmailLogByMessageId(MESSAGE_ID, CALLER_ORG, mockDb);

    expect(result).toBeNull();
    // Walk the Drizzle SQL expression tree (circular-ref-safe) and verify
    // the WHERE clause was built with the organizationId. Dropping it = IDOR.
    function hasValue(
      node: unknown,
      target: string,
      seen = new WeakSet<object>()
    ): boolean {
      if (typeof node === "string") return node === target;
      if (!node || typeof node !== "object") return false;
      if (seen.has(node as object)) return false;
      seen.add(node as object);
      return Object.values(node as object).some((v) =>
        hasValue(v, target, seen)
      );
    }
    expect(hasValue(capturedWhere, CALLER_ORG)).toBe(true);
  });
});
