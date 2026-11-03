/**
 * emitContactsUpdatedViaApi: the dashboard's hop to the API's
 * POST /v1/contacts/events/updated. It passes the signed-in user's session on
 * (Authorization + X-Organization-Id), gives up after 5 seconds, has no
 * default API URL, and never throws: every failure is logged with ctx.log.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emitContactsUpdatedViaApi } from "../contact-updated-api";

const session = vi.hoisted(() => ({
  token: "contact-updated-api-session-token" as string | null,
  error: null as Error | null,
}));

vi.mock("next/headers", () => ({
  headers: () => new Headers(),
}));

vi.mock("@wraps/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => {
        if (session.error) {
          throw session.error;
        }
        if (session.token === null) {
          return null;
        }
        return {
          user: { id: "contact-updated-api-user" },
          session: { token: session.token },
        };
      }),
    },
  },
}));

const API_URL = "http://api.test";
const ORG_ID = "contact-updated-api-org";
const ITEMS = [
  { contactId: "contact-a", updatedFields: ["emailStatus" as const] },
  { contactId: "contact-b", updatedFields: ["firstName" as const] },
];

type Call = { url: string; init: RequestInit };
let calls: Call[];
let answer: (init: RequestInit) => Promise<Response>;

function makeCtx() {
  return {
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
}

type Ctx = ReturnType<typeof makeCtx>;

function failuresLogged(ctx: Ctx): unknown[] {
  return [...ctx.log.warn.mock.calls, ...ctx.log.error.mock.calls].map(
    ([obj]) => (obj as { failure?: unknown }).failure
  );
}

function emit(ctx: Ctx, items = ITEMS) {
  return emitContactsUpdatedViaApi(
    ctx as unknown as Parameters<typeof emitContactsUpdatedViaApi>[0],
    ORG_ID,
    items
  );
}

describe("emitContactsUpdatedViaApi", () => {
  beforeEach(() => {
    session.token = "contact-updated-api-session-token";
    session.error = null;
    calls = [];
    answer = () => Promise.resolve(Response.json({ accepted: 2 }));
    vi.stubEnv("NEXT_PUBLIC_API_URL", API_URL);
    vi.stubGlobal("fetch", (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return answer(init);
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts the items with the session token and X-Organization-Id", async () => {
    const ctx = makeCtx();

    await emit(ctx);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${API_URL}/v1/contacts/events/updated`);
    expect(calls[0].init.method).toBe("POST");
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("Authorization")).toBe(
      "Bearer contact-updated-api-session-token"
    );
    expect(headers.get("X-Organization-Id")).toBe(ORG_ID);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(JSON.parse(calls[0].init.body as string)).toEqual({
      contacts: ITEMS,
    });
    expect(failuresLogged(ctx)).toEqual([]);
  });

  it("aborts after 5 seconds, logs the timeout and does not throw", async () => {
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValueOnce(
        AbortSignal.abort(
          new DOMException(
            "The operation was aborted due to timeout",
            "TimeoutError"
          )
        )
      );
    answer = (init) =>
      init.signal?.aborted
        ? Promise.reject(init.signal.reason)
        : Promise.resolve(Response.json({ accepted: 2 }));
    const ctx = makeCtx();

    await expect(emit(ctx)).resolves.toBeUndefined();

    expect(timeoutSpy).toHaveBeenCalledWith(5000);
    expect(calls[0].init.signal?.aborted).toBe(true);
    expect(failuresLogged(ctx)).toEqual(["timeout"]);
  });

  it("does nothing but log when NEXT_PUBLIC_API_URL is unset (no default URL)", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const ctx = makeCtx();

    await emit(ctx);

    expect(calls).toHaveLength(0);
    expect(failuresLogged(ctx)).toEqual(["unconfigured"]);
  });

  it("makes no call for an empty list", async () => {
    const ctx = makeCtx();

    await emit(ctx, []);

    expect(calls).toHaveLength(0);
    expect(failuresLogged(ctx)).toEqual([]);
  });

  it("makes no call without a session token", async () => {
    session.token = null;
    const ctx = makeCtx();

    await emit(ctx);

    expect(calls).toHaveLength(0);
    expect(failuresLogged(ctx)).toEqual(["no_session"]);
  });

  it("logs a failed session lookup and does not throw", async () => {
    session.error = new Error("session store down");
    const ctx = makeCtx();

    await expect(emit(ctx)).resolves.toBeUndefined();

    expect(calls).toHaveLength(0);
    expect(failuresLogged(ctx)).toEqual(["session"]);
  });

  it("logs a non-OK answer with its status and does not throw", async () => {
    answer = () =>
      Promise.resolve(Response.json({ error: "nope" }, { status: 403 }));
    const ctx = makeCtx();

    await expect(emit(ctx)).resolves.toBeUndefined();

    expect(failuresLogged(ctx)).toEqual(["status"]);
    expect(ctx.log.error.mock.calls[0][0]).toMatchObject({ status: 403 });
  });

  it("logs a network error and does not throw", async () => {
    answer = () => Promise.reject(new TypeError("fetch failed"));
    const ctx = makeCtx();

    await expect(emit(ctx)).resolves.toBeUndefined();

    expect(failuresLogged(ctx)).toEqual(["network"]);
  });
});
