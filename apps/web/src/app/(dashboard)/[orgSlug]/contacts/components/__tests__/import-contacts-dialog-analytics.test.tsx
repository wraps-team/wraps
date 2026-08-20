/**
 * Import wizard funnel instrumentation (audit finding F16).
 *
 * Production had fired `contacts.imported` exactly once, ever, and nobody
 * knew whether that meant one success or one success out of forty attempts.
 * These assert that every funnel step actually calls `posthog.capture` with
 * the props the funnel needs - a capture call that never runs is worse than
 * none, because it reads as measured.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const capture = vi.fn();
vi.mock("posthog-js", () => ({
  default: { capture: (...args: unknown[]) => capture(...args) },
}));

const importContacts = vi.fn();
vi.mock("@/actions/import-contacts", () => ({
  importContacts: (...args: unknown[]) => importContacts(...args),
}));

import { ImportContactsDialog } from "../import-contacts-dialog";

const baseProps = {
  organizationId: "org-1",
  topics: [],
  open: true,
  onOpenChange: vi.fn(),
  onImportComplete: vi.fn(),
};

function csvFile(content: string) {
  return new File([content], "contacts.csv", { type: "text/csv" });
}

async function uploadCSV(content = "email\nada@example.com\n") {
  const input = document.querySelector('input[type="file"]');
  if (!input) {
    throw new Error("file input not found");
  }
  await userEvent.upload(input as HTMLInputElement, csvFile(content));
}

beforeEach(() => {
  capture.mockClear();
  importContacts.mockReset();
  baseProps.onImportComplete.mockClear();
});

afterEach(cleanup);

describe("import wizard funnel", () => {
  it("captures a row count and truncation flag once the file parses", async () => {
    render(<ImportContactsDialog {...baseProps} />);

    await uploadCSV("email\nada@example.com\nbea@example.com\n");

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("contacts_import_file_parsed", {
        row_count: 2,
        total_rows: 2,
        was_truncated: false,
      });
    });
  });

  it("captures the identifier field and mapped/property counts on Continue", async () => {
    render(<ImportContactsDialog {...baseProps} />);

    await uploadCSV("email,plan\nada@example.com,pro\n");
    await screen.findByRole("button", { name: /continue/i });

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(capture).toHaveBeenCalledWith("contacts_import_columns_mapped", {
      identifier_field: "email",
      mapped_field_count: 2,
      property_field_count: 1,
    });
  });

  it("captures submitted, then completed with the full created/updated/skipped/failed breakdown", async () => {
    importContacts.mockResolvedValue({
      success: true,
      created: 1,
      updated: 0,
      skipped: 0,
      errors: [],
    });

    render(<ImportContactsDialog {...baseProps} />);

    await uploadCSV("email\nada@example.com\n");
    await userEvent.click(
      await screen.findByRole("button", { name: /continue/i })
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /^import$/i })
    );

    expect(capture).toHaveBeenCalledWith("contacts_import_submitted", {
      contact_count: 1,
      duplicate_strategy: "skip",
      topic_count: 0,
      was_truncated: false,
    });

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("contacts_import_completed", {
        contact_count: 1,
        created: 1,
        failed: 0,
        skipped: 0,
        updated: 0,
      });
    });
    // No PII: the contact's email never appears in any capture call.
    for (const call of capture.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("ada@example.com");
    }
  });

  it("captures failed, not completed, when the import action returns success: false", async () => {
    importContacts.mockResolvedValue({
      success: false,
      error: "You've reached your contact limit. Please upgrade your plan.",
    });

    render(<ImportContactsDialog {...baseProps} />);

    await uploadCSV("email\nada@example.com\n");
    await userEvent.click(
      await screen.findByRole("button", { name: /continue/i })
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /^import$/i })
    );

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("contacts_import_failed", {
        contact_count: 1,
      });
    });
    expect(capture).not.toHaveBeenCalledWith(
      "contacts_import_completed",
      expect.anything()
    );
  });
});

// `contacts_import_started` fires from the Import button in
// contacts-table.tsx, not from this component - see
// contacts-table-analytics.test.tsx.
