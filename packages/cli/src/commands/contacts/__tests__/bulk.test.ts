/**
 * Unit tests for `wraps contacts import|export|validate` (contacts/bulk.ts).
 *
 * Boundaries mocked: the API target resolver, clack output, fetch. Files are
 * real, created under a temp directory from os.tmpdir(). Every --json assertion
 * parses the single console.log envelope.
 */

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { setJsonMode } from "../../../utils/shared/json-output.js";

vi.mock("@clack/prompts");
vi.mock("../../../utils/shared/api-target.js", () => ({
  resolveApiTarget: vi.fn(),
  checkApiTarget: vi.fn(),
}));

import { log, note } from "@clack/prompts";
import {
  checkApiTarget,
  resolveApiTarget,
} from "../../../utils/shared/api-target.js";
import { contactsExport, contactsImport, contactsValidate } from "../bulk.js";

const API_BASE = "http://api.test";
const TOKEN = "wraps_test";

type Envelope = {
  success: boolean;
  command: string;
  data?: Record<string, unknown>;
  error?: { code: string; message: string; suggestion?: string };
};

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "contacts-bulk-test-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function fileWith(name: string, content: string): string {
  const path = join(dir, name);
  writeFileSync(path, content, "utf8");
  return path;
}

function res(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

function onlyEnvelope(spy: ReturnType<typeof vi.spyOn>): Envelope {
  expect(spy).toHaveBeenCalledTimes(1);
  return JSON.parse(String(spy.mock.calls[0][0])) as Envelope;
}

describe("contacts import, export and validate", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock.mockReset();
    process.exitCode = undefined;
    setJsonMode(true);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(resolveApiTarget).mockResolvedValue({} as never);
    vi.mocked(checkApiTarget).mockReturnValue({
      ok: true,
      target: { apiBase: API_BASE, token: TOKEN },
    } as never);
  });

  afterEach(() => {
    process.exitCode = undefined;
    setJsonMode(false);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("import", () => {
    const IMPORT_OK = {
      created: 2,
      updated: 0,
      skipped: 0,
      invalid: 0,
      errors: [],
      duplicates: [],
    };

    it("parses a quoted, BOM-prefixed CSV with blank lines and posts the exact body", async () => {
      const path = fileWith(
        "people.csv",
        "﻿Email,First Name,Last Name,Company,Plan\r\n" +
          'ada@example.com,"Ada ""A""","Lovelace, Jr.",Analytical,pro\r\n' +
          "\r\n" +
          "Grace@Example.com,Grace,,,\r\n"
      );
      fetchMock.mockResolvedValue(res(200, IMPORT_OK));

      await contactsImport({ file: path, json: true });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${API_BASE}/v1/contacts/import`);
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${TOKEN}`
      );
      expect(JSON.parse(String(init.body))).toEqual({
        contacts: [
          {
            email: "ada@example.com",
            firstName: 'Ada "A"',
            lastName: "Lovelace, Jr.",
            company: "Analytical",
            properties: { Plan: "pro" },
          },
          { email: "Grace@Example.com", firstName: "Grace" },
        ],
        duplicateStrategy: "skip",
      });
      const env = onlyEnvelope(logSpy);
      expect(env.success).toBe(true);
      expect(env.command).toBe("contacts.import");
      expect(env.data).toMatchObject({
        dryRun: false,
        rows: 2,
        created: 2,
        updated: 0,
        skipped: 0,
        invalid: 0,
        duplicateStrategy: "skip",
        sesValidation: false,
      });
      expect(process.exitCode).toBeUndefined();
    });

    it("refuses a header with no email or phone column, before any request", async () => {
      const path = fileWith("wrong.csv", "name,city\nAda,London\n");

      await contactsImport({ file: path, json: true });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("VALIDATION_FAILED");
      expect(env.error?.message).toContain(
        "The header row has no email or phone column (found: name, city)"
      );
      expect(env.error?.suggestion).toContain("email,first name,last name");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it("rejects more than 10,000 rows and asks for a split, without a request", async () => {
      const rows = Array.from(
        { length: 10_001 },
        (_, i) => `user${i}@example.com`
      );
      const path = fileWith("big.csv", `email\n${rows.join("\n")}\n`);

      await contactsImport({ file: path, json: true });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("VALIDATION_FAILED");
      expect(env.error?.message).toContain(
        "The file has 10001 contact rows; one import takes at most 10000"
      );
      expect(env.error?.suggestion).toContain("Split the file into parts");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("accepts exactly 10,000 rows in one request", async () => {
      const rows = Array.from(
        { length: 10_000 },
        (_, i) => `user${i}@example.com`
      );
      const path = fileWith("max.csv", `email\n${rows.join("\n")}\n`);
      fetchMock.mockResolvedValue(res(200, { ...IMPORT_OK, created: 10_000 }));

      await contactsImport({ file: path, json: true });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(
        (JSON.parse(String(init.body)) as { contacts: unknown[] }).contacts
      ).toHaveLength(10_000);
      expect(onlyEnvelope(logSpy).data).toMatchObject({
        rows: 10_000,
        created: 10_000,
      });
    });

    it("dry-run counts the rows locally and makes no request and no credential lookup", async () => {
      const path = fileWith(
        "dry.csv",
        "email,phone,company\n" +
          "a@x.com,,\n" +
          ",+15555550100,\n" +
          ",,Acme\n" +
          "bad-address,,\n"
      );

      await contactsImport({
        file: path,
        dryRun: true,
        validate: true,
        awsAccountId: "acct_1",
        json: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(resolveApiTarget).not.toHaveBeenCalled();
      const env = onlyEnvelope(logSpy);
      expect(env.command).toBe("contacts.import");
      expect(env.data).toMatchObject({
        dryRun: true,
        rows: 4,
        withEmail: 1,
        phoneOnly: 1,
        invalidLocally: 2,
        sesValidation: true,
        awsAccountId: "acct_1",
        duplicateStrategy: "skip",
      });
    });

    it("refuses --validate without --yes, naming the SES cost and the re-run command", async () => {
      const path = fileWith("validate.csv", "email\na@x.com\n");

      await contactsImport({
        file: path,
        validate: true,
        awsAccountId: "acct_1",
        json: true,
      });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("CONFIRMATION_REQUIRED");
      expect(env.error?.message).toContain("SES Email Address Insights");
      expect(env.error?.message).toContain("bills per address");
      expect(env.error?.suggestion).toContain("--aws-account-id acct_1 --yes");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses --validate without --aws-account-id, naming the flag", async () => {
      const path = fileWith("noaccount.csv", "email\na@x.com\n");

      await contactsImport({ file: path, validate: true, json: true });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(env.error?.message).toContain("--validate needs --aws-account-id");
      expect(env.error?.suggestion).toContain("--aws-account-id <id>");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses --aws-account-id without --validate, naming the flag it needs", async () => {
      const path = fileWith("stray.csv", "email\na@x.com\n");

      await contactsImport({ file: path, awsAccountId: "acct_1", json: true });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_USAGE");
      expect(env.error?.message).toContain(
        "--aws-account-id only applies with --validate"
      );
      expect(env.error?.suggestion).toContain("--validate");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects an unknown --duplicate-strategy with the accepted values", async () => {
      const path = fileWith("strategy.csv", "email\na@x.com\n");

      await contactsImport({
        file: path,
        duplicateStrategy: "merge",
        json: true,
      });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
      expect(env.error?.message).toContain(
        '--duplicate-strategy must be skip or update, got "merge"'
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("maps a 402 contact-limit response to PLAN_REQUIRED with an upgrade suggestion", async () => {
      const path = fileWith("limit.csv", "email\na@x.com\n");
      fetchMock.mockResolvedValue(
        res(402, {
          error: "You've reached your contact limit. Please upgrade your plan.",
        })
      );

      await contactsImport({ file: path, json: true });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("PLAN_REQUIRED");
      expect(env.error?.message).toContain("contact limit");
      expect(env.error?.suggestion).toContain("Upgrade the plan");
      expect(env.error?.suggestion).toContain("nothing was imported");
    });

    it("maps a 404 for the AWS account to NOT_FOUND with the wraps email health suggestion", async () => {
      const path = fileWith("account404.csv", "email\na@x.com\n");
      fetchMock.mockResolvedValue(res(404, { error: "AWS account not found" }));

      await contactsImport({
        file: path,
        validate: true,
        awsAccountId: "acct_9",
        yes: true,
        json: true,
      });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("NOT_FOUND");
      expect(env.error?.suggestion).toContain("wraps email health");
    });

    it("maps a 429 throttle to RATE_LIMITED and says to re-run with skip", async () => {
      const path = fileWith("throttle.csv", "email\na@x.com\n");
      fetchMock.mockResolvedValue(
        res(429, { error: "SES validation was throttled" })
      );

      await contactsImport({ file: path, json: true });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("RATE_LIMITED");
      expect(env.error?.suggestion).toContain("--duplicate-strategy skip");
    });

    it("maps a 401 to NOT_AUTHENTICATED with the login suggestion", async () => {
      const path = fileWith("unauth.csv", "email\na@x.com\n");
      fetchMock.mockResolvedValue(res(401, { error: "Unauthorized" }));

      await contactsImport({ file: path, json: true });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.suggestion).toContain("wraps auth login");
    });

    it("reports NOT_AUTHENTICATED with no request when no API target is configured", async () => {
      const path = fileWith("notarget.csv", "email\na@x.com\n");
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await contactsImport({ file: path, json: true });

      expect(onlyEnvelope(logSpy).error?.code).toBe("NOT_AUTHENTICATED");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reports NETWORK_ERROR when the request cannot be sent", async () => {
      const path = fileWith("net.csv", "email\na@x.com\n");
      fetchMock.mockRejectedValue(new Error("socket hang up"));

      await contactsImport({ file: path, json: true });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("NETWORK_ERROR");
      expect(env.error?.message).toContain(
        "Could not reach the Wraps API (socket hang up)"
      );
    });

    it("names the path when the file does not exist, with no request", async () => {
      const missing = join(dir, "does-not-exist.csv");

      await contactsImport({ file: missing, json: true });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
      expect(env.error?.message).toContain(`No file at ${missing}`);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("requires --file, naming the flag", async () => {
      await contactsImport({ json: true });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(env.error?.message).toContain("Missing --file");
      expect(env.error?.suggestion).toContain("wraps contacts import --file");
    });

    it("cannot tell the format of an unknown extension and asks for --format", async () => {
      const path = fileWith("contacts.txt", "email\na@x.com\n");

      await contactsImport({ file: path, json: true });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.message).toContain(
        "Cannot tell the format of contacts.txt"
      );
      expect(env.error?.suggestion).toContain("--format csv");
    });

    it("reports a row with more fields than the header, naming the row", async () => {
      const path = fileWith(
        "ragged.csv",
        "email,first name\na@x.com,Ada,extra\n"
      );

      await contactsImport({ file: path, json: true });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.message).toBe(
        "Row 1 has 3 fields but the header has 2"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("accepts a row with trailing empty cells beyond the header (spreadsheet exports)", async () => {
      const path = fileWith(
        "trailing.csv",
        "email,first name\na@x.com,Ada,,\n"
      );
      fetchMock.mockResolvedValue(res(200, { ...IMPORT_OK, created: 1 }));

      await contactsImport({ file: path, json: true });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({
        contacts: [{ email: "a@x.com", firstName: "Ada" }],
        duplicateStrategy: "skip",
      });
    });

    it("parses JSON with nested properties and sends topic ids and the strategy", async () => {
      const path = fileWith(
        "people.json",
        JSON.stringify([
          {
            email: "ada@example.com",
            firstName: "Ada",
            properties: { plan: "pro" },
          },
          { phone: "+15555550100", lastName: 42, Plan: "free" },
        ])
      );
      fetchMock.mockResolvedValue(res(200, { ...IMPORT_OK, created: 2 }));

      await contactsImport({
        file: path,
        topicIds: "t_1, t_2",
        duplicateStrategy: "update",
        json: true,
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({
        contacts: [
          {
            email: "ada@example.com",
            firstName: "Ada",
            properties: { plan: "pro" },
          },
          {
            phone: "+15555550100",
            lastName: "42",
            properties: { Plan: "free" },
          },
        ],
        duplicateStrategy: "update",
        topicIds: ["t_1", "t_2"],
      });
      expect(onlyEnvelope(logSpy).data).toMatchObject({
        rows: 2,
        duplicateStrategy: "update",
        topicIds: ["t_1", "t_2"],
      });
    });

    it("refuses a JSON file that is not an array", async () => {
      const path = fileWith(
        "object.json",
        JSON.stringify({ email: "a@x.com" })
      );

      await contactsImport({ file: path, json: true });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.message).toBe(
        "The JSON file must be an array of contact objects"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("prints the route's counts and per-row errors in --json", async () => {
      const path = fileWith("errors.csv", "email\na@x.com\nnot-an-email\n");
      fetchMock.mockResolvedValue(
        res(200, {
          created: 1,
          updated: 0,
          skipped: 0,
          invalid: 1,
          errors: [{ row: 2, error: "Invalid email: not-an-email" }],
          duplicates: [],
        })
      );

      await contactsImport({ file: path, json: true });

      const env = onlyEnvelope(logSpy);
      expect(env.data).toMatchObject({
        created: 1,
        invalid: 1,
        errors: [{ row: 2, error: "Invalid email: not-an-email" }],
      });
    });

    it("prints the counts line and the first row error in human mode", async () => {
      setJsonMode(false);
      const path = fileWith("human.csv", "email\na@x.com\nnot-an-email\n");
      fetchMock.mockResolvedValue(
        res(200, {
          created: 1,
          updated: 0,
          skipped: 0,
          invalid: 1,
          errors: [{ row: 2, error: "Invalid email: not-an-email" }],
          duplicates: [],
        })
      );

      await contactsImport({ file: path });

      expect(log.success).toHaveBeenCalledWith(
        expect.stringContaining("1 created, 0 updated, 0 skipped, 1 invalid")
      );
      expect(log.warn).toHaveBeenCalledWith(
        expect.stringContaining("row 2: Invalid email: not-an-email")
      );
    });
  });

  describe("export", () => {
    const CONTACTS = [
      { id: "c_1", email: "ada@example.com", topics: [] },
      { id: "c_2", email: "grace@example.com", topics: [] },
    ];

    it("sends the filters as the query string and prints the envelope in --json", async () => {
      fetchMock.mockResolvedValue(
        res(200, { contacts: CONTACTS, total: 2, truncated: false })
      );

      await contactsExport({
        search: "ada",
        emailStatus: "active",
        topicId: "t_1",
        json: true,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `${API_BASE}/v1/contacts/export?search=ada&emailStatus=active&topicId=t_1`
      );
      expect(init.method).toBe("GET");
      const env = onlyEnvelope(logSpy);
      expect(env.command).toBe("contacts.export");
      expect(env.data).toMatchObject({
        format: "json",
        output: null,
        exported: 2,
        total: 2,
        truncated: false,
        hint: null,
      });
      expect((env.data?.contacts as Array<{ id: string }>)[0].id).toBe("c_1");
    });

    it("says the export was truncated and suggests narrowing the filters", async () => {
      fetchMock.mockResolvedValue(
        res(200, {
          contacts: CONTACTS.slice(0, 1),
          total: 60_000,
          truncated: true,
        })
      );

      await contactsExport({ json: true });

      const data = onlyEnvelope(logSpy).data;
      expect(data?.truncated).toBe(true);
      expect(data?.total).toBe(60_000);
      expect(String(data?.hint)).toContain(
        "first 50000 of 60000 matching contacts"
      );
      expect(String(data?.hint)).toContain(
        "--search, --email-status or --topic-id"
      );
    });

    it("refuses csv in --json mode without --output, with no request", async () => {
      await contactsExport({ format: "csv", json: true });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_USAGE");
      expect(env.error?.message).toContain(
        "--format csv in --json mode needs --output <path>"
      );
      expect(env.error?.suggestion).toContain("--output ./contacts.csv");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("writes the CSV to a temp file after a 200 and reports the real total from the header", async () => {
      const csv = "Email,First Name\na@example.com,Ada\nb@example.com,Grace\n";
      const out = join(dir, "export-new.csv");
      rmSync(out, { force: true });
      fetchMock.mockResolvedValue(
        res(200, csv, { "x-export-total": "2", "x-export-truncated": "false" })
      );

      await contactsExport({ format: "csv", output: out, json: true });

      const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${API_BASE}/v1/contacts/export?format=csv`);
      expect(readFileSync(out, "utf8")).toBe(csv);
      const data = onlyEnvelope(logSpy).data;
      expect(data).toMatchObject({
        format: "csv",
        output: out,
        exported: 2,
        total: 2,
        truncated: false,
        overwritten: false,
      });
    });

    it("refuses to overwrite an existing --output without --yes, leaving the file as it was", async () => {
      const out = join(dir, "export-existing.csv");
      writeFileSync(out, "old contents", "utf8");
      fetchMock.mockResolvedValue(
        res(200, "Email\na@example.com\n", {
          "x-export-total": "1",
          "x-export-truncated": "false",
        })
      );

      await contactsExport({ format: "csv", output: out, json: true });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("CONFIRMATION_REQUIRED");
      expect(env.error?.message).toContain(
        `${out} already exists and would be overwritten`
      );
      expect(env.error?.suggestion).toContain(
        "Re-run with --yes to overwrite it"
      );
      expect(readFileSync(out, "utf8")).toBe("old contents");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("overwrites an existing --output when --yes is given", async () => {
      const out = join(dir, "export-yes.csv");
      writeFileSync(out, "old contents", "utf8");
      fetchMock.mockResolvedValue(
        res(200, "Email\na@example.com\n", {
          "x-export-total": "1",
          "x-export-truncated": "false",
        })
      );

      await contactsExport({
        format: "csv",
        output: out,
        yes: true,
        json: true,
      });

      expect(readFileSync(out, "utf8")).toBe("Email\na@example.com\n");
      expect(onlyEnvelope(logSpy).data).toMatchObject({
        overwritten: true,
        exported: 1,
      });
    });

    it("writes a JSON file with the API's shape and reports the output path", async () => {
      const out = join(dir, "export-new.json");
      rmSync(out, { force: true });
      fetchMock.mockResolvedValue(
        res(200, { contacts: CONTACTS, total: 2, truncated: false })
      );

      await contactsExport({ output: out, json: true });

      const written = JSON.parse(readFileSync(out, "utf8")) as Record<
        string,
        unknown
      >;
      expect(written).toEqual({
        contacts: CONTACTS,
        total: 2,
        truncated: false,
      });
      const data = onlyEnvelope(logSpy).data;
      expect(data).toMatchObject({ format: "json", output: out, exported: 2 });
      expect(data).not.toHaveProperty("contacts");
    });

    it("leaves no file behind on a 401", async () => {
      const out = join(dir, "export-401.csv");
      rmSync(out, { force: true });
      fetchMock.mockResolvedValue(res(401, { error: "Unauthorized" }));

      await contactsExport({ format: "csv", output: out, json: true });

      expect(onlyEnvelope(logSpy).error?.code).toBe("NOT_AUTHENTICATED");
      expect(existsSync(out)).toBe(false);
    });

    it("leaves no file behind on a network failure", async () => {
      const out = join(dir, "export-net.csv");
      rmSync(out, { force: true });
      fetchMock.mockRejectedValue(new Error("socket hang up"));

      await contactsExport({ format: "csv", output: out, json: true });

      expect(onlyEnvelope(logSpy).error?.code).toBe("NETWORK_ERROR");
      expect(existsSync(out)).toBe(false);
    });

    it("leaves no file behind when there is no API target", async () => {
      const out = join(dir, "export-notarget.csv");
      rmSync(out, { force: true });
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await contactsExport({ format: "csv", output: out, json: true });

      expect(onlyEnvelope(logSpy).error?.code).toBe("NOT_AUTHENTICATED");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(existsSync(out)).toBe(false);
    });

    it("rejects an email status outside the enum, with no request", async () => {
      await contactsExport({ emailStatus: "vip", json: true });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_VALUE");
      expect(env.error?.message).toContain(
        '--email-status must be one of active, unsubscribed, bounced, complained, suppressed, got "vip"'
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("prints CSV to stdout in human mode without --output", async () => {
      setJsonMode(false);
      const csv = "Email\na@example.com\n";
      const write = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);
      fetchMock.mockResolvedValue(
        res(200, csv, { "x-export-total": "1", "x-export-truncated": "false" })
      );

      await contactsExport({ format: "csv" });

      expect(write).toHaveBeenCalledWith(csv);
      write.mockRestore();
    });
  });

  describe("validate", () => {
    const VERDICTS = { "a@x.com": "HIGH", "b@y.com": "LOW" };

    it("dedupes and trims --emails, posts the exact body, and prints the verdicts in --json", async () => {
      fetchMock.mockResolvedValue(
        res(200, {
          verdicts: VERDICTS,
          validatedCount: 2,
          stoppedEarly: false,
          invalid: [],
        })
      );

      await contactsValidate({
        emails: " a@x.com, b@y.com,A@x.com, ",
        awsAccountId: "acct_1",
        yes: true,
        json: true,
      });

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${API_BASE}/v1/contacts/validate`);
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({
        awsAccountId: "acct_1",
        emails: ["a@x.com", "b@y.com"],
      });
      const env = onlyEnvelope(logSpy);
      expect(env.command).toBe("contacts.validate");
      expect(env.data).toMatchObject({
        dryRun: false,
        requested: 2,
        awsAccountId: "acct_1",
        verdicts: VERDICTS,
        validatedCount: 2,
        stoppedEarly: false,
        invalid: [],
      });
    });

    it("reads --file as a CSV with an email column", async () => {
      const path = fileWith("addresses.csv", "Email\nc@x.com\n\nd@x.com\n");
      fetchMock.mockResolvedValue(
        res(200, {
          verdicts: {},
          validatedCount: 0,
          stoppedEarly: false,
          invalid: [],
        })
      );

      await contactsValidate({
        file: path,
        awsAccountId: "acct_1",
        yes: true,
        json: true,
      });

      const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(String(init.body))).toEqual({
        awsAccountId: "acct_1",
        emails: ["c@x.com", "d@x.com"],
      });
    });

    it("refuses --emails and --file together", async () => {
      await contactsValidate({ emails: "a@x.com", file: "x.txt", json: true });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("INVALID_FLAG_USAGE");
      expect(env.error?.message).toBe("Pass --emails or --file, not both");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("requires --emails or --file, naming both", async () => {
      await contactsValidate({ json: true });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(env.error?.message).toBe("Missing --emails or --file");
    });

    it("rejects more than 100 addresses and asks for a split, with no request", async () => {
      const emails = Array.from({ length: 101 }, (_, i) => `u${i}@x.com`).join(
        ","
      );

      await contactsValidate({
        emails,
        awsAccountId: "acct_1",
        yes: true,
        json: true,
      });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("VALIDATION_FAILED");
      expect(env.error?.message).toBe(
        "101 addresses is more than one validate call takes (100)"
      );
      expect(env.error?.suggestion).toContain("--file <part>");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("dry-run lists the addresses with no request and no --yes", async () => {
      await contactsValidate({
        emails: "a@x.com,b@y.com",
        dryRun: true,
        json: true,
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(resolveApiTarget).not.toHaveBeenCalled();
      expect(onlyEnvelope(logSpy).data).toMatchObject({
        dryRun: true,
        requested: 2,
        wellFormed: 2,
        awsAccountId: null,
        addresses: ["a@x.com", "b@y.com"],
      });
    });

    it("requires --aws-account-id before a real run, naming the flag", async () => {
      await contactsValidate({ emails: "a@x.com", yes: true, json: true });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("MISSING_REQUIRED_FLAG");
      expect(env.error?.message).toBe("Missing --aws-account-id");
      expect(env.error?.suggestion).toContain("--aws-account-id <id>");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses without --yes, naming the SES cost and the exact re-run command", async () => {
      await contactsValidate({
        emails: "a@x.com,b@y.com",
        awsAccountId: "acct_1",
        json: true,
      });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("CONFIRMATION_REQUIRED");
      expect(env.error?.message).toContain(
        "Validating 2 addresses with SES Email Address Insights is billed by AWS per address checked"
      );
      expect(env.error?.suggestion).toContain(
        "--emails a@x.com,b@y.com --aws-account-id acct_1 --yes"
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reports a throttled run as stoppedEarly, in human mode with the verdicts", async () => {
      setJsonMode(false);
      fetchMock.mockResolvedValue(
        res(200, {
          verdicts: { "a@x.com": "HIGH" },
          validatedCount: 1,
          stoppedEarly: true,
          invalid: [],
        })
      );

      await contactsValidate({
        emails: "a@x.com,b@y.com",
        awsAccountId: "acct_1",
        yes: true,
      });

      expect(note).toHaveBeenCalledWith(
        expect.stringContaining("a@x.com"),
        "Checked 1 addresses"
      );
      expect(log.warn).toHaveBeenCalledWith(
        expect.stringContaining("SES throttled the run after 1 addresses")
      );
    });

    it("maps a 404 for the AWS account to NOT_FOUND with the wraps email health suggestion", async () => {
      fetchMock.mockResolvedValue(res(404, { error: "AWS account not found" }));

      await contactsValidate({
        emails: "a@x.com",
        awsAccountId: "acct_9",
        yes: true,
        json: true,
      });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("NOT_FOUND");
      expect(env.error?.suggestion).toContain("wraps email health");
    });

    it("maps a 401 to NOT_AUTHENTICATED with the login suggestion", async () => {
      fetchMock.mockResolvedValue(res(401, { error: "Unauthorized" }));

      await contactsValidate({
        emails: "a@x.com",
        awsAccountId: "acct_1",
        yes: true,
        json: true,
      });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("NOT_AUTHENTICATED");
      expect(env.error?.suggestion).toContain("wraps auth login");
    });

    it("maps a 400 from the credential check to VALIDATION_FAILED with the API's message", async () => {
      fetchMock.mockResolvedValue(
        res(400, { error: "Could not connect to the AWS account" })
      );

      await contactsValidate({
        emails: "a@x.com",
        awsAccountId: "acct_1",
        yes: true,
        json: true,
      });

      const env = onlyEnvelope(logSpy);
      expect(env.error?.code).toBe("VALIDATION_FAILED");
      expect(env.error?.message).toBe("Could not connect to the AWS account");
    });

    it("reports NETWORK_ERROR when the request cannot be sent", async () => {
      fetchMock.mockRejectedValue(new Error("socket hang up"));

      await contactsValidate({
        emails: "a@x.com",
        awsAccountId: "acct_1",
        yes: true,
        json: true,
      });

      expect(onlyEnvelope(logSpy).error?.code).toBe("NETWORK_ERROR");
    });

    it("reports NOT_AUTHENTICATED with no request when no API target is configured", async () => {
      vi.mocked(checkApiTarget).mockReturnValue({
        ok: false,
        reason: "No API token",
        suggestion: "Run: wraps auth login",
      } as never);

      await contactsValidate({
        emails: "a@x.com",
        awsAccountId: "acct_1",
        yes: true,
        json: true,
      });

      expect(onlyEnvelope(logSpy).error?.code).toBe("NOT_AUTHENTICATED");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
