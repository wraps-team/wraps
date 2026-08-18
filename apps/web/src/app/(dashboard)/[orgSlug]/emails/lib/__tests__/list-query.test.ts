/**
 * The emails list query contract: the opaque cursor codec, and the constant
 * relationship the CSV export silently depends on.
 */

import { describe, expect, it } from "vitest";
import {
  decodeEmailCursor,
  EMAIL_EXPORT_ROW_CAP,
  EMAIL_LIST_MAX_PAGE_SIZE,
  encodeEmailCursor,
} from "../list-query";

const SENT_AT = new Date("2026-08-18T12:00:00.000Z");
const WINDOW = {
  from: new Date("2026-08-11T09:30:00.000Z"),
  to: new Date("2026-08-18T09:30:00.000Z"),
};

describe("email cursor codec", () => {
  it("round-trips the keyset position", () => {
    const token = encodeEmailCursor({
      sentAt: SENT_AT,
      id: "msg-1",
      sort: "desc",
      window: WINDOW,
    });
    const decoded = decodeEmailCursor(token);

    expect(decoded?.sentAt.toISOString()).toBe(SENT_AT.toISOString());
    expect(decoded?.id).toBe("msg-1");
  });

  it("round-trips the pinned window", () => {
    // The whole point of carrying it: page 2 must query page 1's window, not
    // a window recomputed at page-2 time.
    const token = encodeEmailCursor({
      sentAt: SENT_AT,
      id: "msg-1",
      sort: "desc",
      window: WINDOW,
    });
    const decoded = decodeEmailCursor(token);

    expect(decoded?.window?.from.toISOString()).toBe(WINDOW.from.toISOString());
    expect(decoded?.window?.to.toISOString()).toBe(WINDOW.to.toISOString());
  });

  it("is opaque - the token leaks no readable timestamp", () => {
    const token = encodeEmailCursor({
      sentAt: SENT_AT,
      id: "msg-1",
      sort: "desc",
      window: WINDOW,
    });

    expect(token).not.toContain("2026-08-18");
    expect(token).not.toContain("msg-1");
  });

  it("keeps ids that contain the field separator", () => {
    const token = encodeEmailCursor({
      sentAt: SENT_AT,
      id: "weird|id|value",
      sort: "desc",
      window: WINDOW,
    });

    expect(decodeEmailCursor(token)?.id).toBe("weird|id|value");
  });

  it("carries a null window rather than inventing one", () => {
    const token = encodeEmailCursor({
      sentAt: SENT_AT,
      id: "msg-1",
      sort: null,
      window: null,
    });
    const decoded = decodeEmailCursor(token);

    expect(decoded?.id).toBe("msg-1");
    expect(decoded?.window).toBeNull();
  });

  it("still reads a legacy token, with no window", () => {
    // Tokens minted before the window was carried are `<sentAt>|<id>`. A page-2
    // request in flight across a deploy must keep paging, not 400.
    const legacy = btoa(`${SENT_AT.toISOString()}|msg-1`)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const decoded = decodeEmailCursor(legacy);

    expect(decoded?.id).toBe("msg-1");
    expect(decoded?.sentAt.toISOString()).toBe(SENT_AT.toISOString());
    expect(decoded?.window).toBeNull();
    expect(decoded?.sort).toBeNull();
  });

  it("round-trips the sort the keyset was walked under", () => {
    // A cursor is a position in one ordering. The route needs to know which,
    // so it can refuse a cursor replayed against the opposite sort instead of
    // seeking the wrong way through the keyset.
    const token = encodeEmailCursor({
      sentAt: SENT_AT,
      id: "msg-1",
      sort: "asc",
      window: WINDOW,
    });

    expect(decodeEmailCursor(token)?.sort).toBe("asc");
  });

  it("rejects a v2 token carrying an unknown sort", () => {
    const bogus = btoa(
      `v2|${WINDOW.from.toISOString()}|${WINDOW.to.toISOString()}|sideways|${SENT_AT.toISOString()}|x`
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(decodeEmailCursor(bogus)).toBeNull();
  });

  it("rejects a malformed token instead of throwing", () => {
    expect(decodeEmailCursor("not-base64-$$$")).toBeNull();
    expect(decodeEmailCursor("")).toBeNull();
  });

  it("rejects a v2 token whose window does not parse", () => {
    const broken = btoa(
      `v2|nonsense|also-nonsense|desc|${SENT_AT.toISOString()}|x`
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(decodeEmailCursor(broken)).toBeNull();
  });

  it("rejects a v2 token whose window runs backwards", () => {
    const backwards = btoa(
      `v2|${WINDOW.to.toISOString()}|${WINDOW.from.toISOString()}|desc|${SENT_AT.toISOString()}|x`
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(decodeEmailCursor(backwards)).toBeNull();
  });
});

describe("export row cap", () => {
  it("is a whole multiple of the export page size", () => {
    // The export loop pages at EMAIL_LIST_MAX_PAGE_SIZE and stops once it has
    // reached the cap, then slices to the cap. Because every page is full, the
    // collected count lands exactly on the cap - but only while these two
    // divide. Break that and the slice starts discarding rows the loop already
    // fetched while the export still reports was_truncated: false.
    expect(EMAIL_EXPORT_ROW_CAP % EMAIL_LIST_MAX_PAGE_SIZE).toBe(0);
  });
});
