/**
 * Every model and field the installed better-auth expects must exist in the
 * Drizzle schema handed to the adapter.
 *
 * The drizzle adapter resolves `modelName` as a key of that schema object and
 * each `fieldName` as a column property. A miss is not a type error or a boot
 * error: it throws on the first query that touches it. better-auth 1.7.1
 * added a required `account.issuer`, every signup and OAuth sign-in threw at
 * runtime, and nothing failed until users did. Any better-auth or plugin bump
 * (SCIM, SSO, passkey, 2FA, organization, stripe, ...) that adds a field lands
 * here first.
 */

import * as authSchema from "@wraps/db/schema/auth";
import * as scimSchema from "@wraps/db/schema/scim-provider";
import * as ssoSchema from "@wraps/db/schema/sso-provider";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@wraps/email", () => ({ getWrapsClient: vi.fn() }));

const drizzleSchema: Record<string, object | undefined> = {
  ...authSchema,
  ...ssoSchema,
  ...scimSchema,
};

type Tables = Record<
  string,
  { modelName: string; fields: Record<string, { fieldName?: string }> }
>;

describe("better-auth schema parity", () => {
  let tables: Tables;

  beforeAll(async () => {
    const { auth } = await import("../index");
    tables = (await auth.$context).tables as Tables;
  }, 60_000);

  it("covers the plugins signup and SCIM depend on", () => {
    const models = Object.values(tables).map((t) => t.modelName);
    expect(models).toEqual(
      expect.arrayContaining(["user", "account", "session", "verification"])
    );
    expect(models).toEqual(expect.arrayContaining(["scimUser", "ssoProvider"]));
  });

  it("has a Drizzle table for every better-auth model", () => {
    const missing = Object.values(tables)
      .map((t) => t.modelName)
      .filter((name) => !drizzleSchema[name]);
    expect(missing).toEqual([]);
  });

  it("has a Drizzle column for every better-auth field", () => {
    const missing = Object.values(tables).flatMap((table) => {
      const drizzleTable = drizzleSchema[table.modelName];
      if (!drizzleTable) {
        return [];
      }
      return Object.entries(table.fields)
        .map(([key, field]) => field.fieldName ?? key)
        .filter((column) => !(column in drizzleTable))
        .map((column) => `${table.modelName}.${column}`);
    });
    expect(missing).toEqual([]);
  });
});
