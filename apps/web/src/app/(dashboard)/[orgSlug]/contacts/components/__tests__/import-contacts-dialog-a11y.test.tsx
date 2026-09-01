/**
 * Import wizard: keyboard reach, step model, and outcome honesty
 * (audit findings C1, L7, M7, M8).
 *
 * C1 is the one that matters most: the upload step's only control was a
 * `<div onClick>` over a `display: none` input, so a keyboard, screen-reader
 * or voice user had no way into bulk import at all. The assertions below fail
 * if either half of that regresses.
 *
 * @vitest-environment jsdom
 */

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validateCSVFile } from "@/lib/csv-parse";

vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }));

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

/** The file input, found the way an assistive technology finds it: by name. */
function uploadControl(): HTMLInputElement {
  return screen.getByLabelText(/choose a csv file/i) as HTMLInputElement;
}

function dropzone(): HTMLElement {
  const label = uploadControl().closest("label");
  if (!label) {
    throw new Error("the dropzone is not a <label> wrapping the file input");
  }
  return label;
}

async function uploadCSV(content = "email\nada@example.com\n") {
  await userEvent.upload(uploadControl(), csvFile(content));
}

/** The outcome banner wrapping a headline, by its own box rather than a testid. */
function banner(headline: string | RegExp): HTMLElement {
  const el = screen.getByText(headline).closest('[class*="rounded-md"]');
  if (!el) {
    throw new Error("outcome headline is not inside a banner");
  }
  return el as HTMLElement;
}

function partialBanner(): HTMLElement {
  return banner(/^Imported /);
}

async function reachResults(
  result: unknown,
  rows = "email\nada@example.com\n"
) {
  importContacts.mockResolvedValue(result);
  render(<ImportContactsDialog {...baseProps} />);
  await uploadCSV(rows);
  await userEvent.click(
    await screen.findByRole("button", { name: /continue/i })
  );
  await userEvent.click(
    await screen.findByRole("button", { name: /^import$/i })
  );
}

beforeEach(() => {
  importContacts.mockReset();
  baseProps.onImportComplete.mockClear();
});

afterEach(cleanup);

describe("upload step keyboard access (C1)", () => {
  it("exposes a focusable file input with an accessible name", () => {
    render(<ImportContactsDialog {...baseProps} />);

    const control = uploadControl();

    // A <div role-less onClick> has no accessible name, so getByLabelText
    // above would already have thrown - but be explicit about what this is.
    expect(control.tagName).toBe("INPUT");
    expect(control).toHaveAttribute("type", "file");
    expect(control).toHaveAttribute("accept", ".csv");

    // The visible dropzone must be the label for that input, which is what
    // gives Enter/Space activation without any key handling of our own.
    expect(dropzone().tagName).toBe("LABEL");
    expect(dropzone().getAttribute("for")).toBe(control.id);

    // Visually hidden by clipping, never `display: none` - `hidden` is exactly
    // what took the only focusable element out of the tab order.
    expect(control.className).not.toMatch(/\bhidden\b/);
    expect(control).toHaveClass("sr-only");

    control.focus();
    expect(control).toHaveFocus();
  });
});

describe("drag and drop (L7)", () => {
  it("accepts a dropped CSV instead of only looking like it would", async () => {
    render(<ImportContactsDialog {...baseProps} />);

    fireEvent.drop(dropzone(), {
      dataTransfer: { files: [csvFile("email\nada@example.com\n")] },
    });

    expect(
      await screen.findByRole("heading", { name: "Step 2 of 4: Map columns" })
    ).toBeInTheDocument();
  });

  it("rejects a dropped non-CSV with the same error a picked one gives", async () => {
    render(<ImportContactsDialog {...baseProps} />);
    const notCSV = new File(["nope"], "contacts.txt", { type: "text/plain" });

    fireEvent.drop(dropzone(), { dataTransfer: { files: [notCSV] } });

    // Both paths run the file through validateCSVFile, so the operator gets
    // one sentence for one problem however the file arrived.
    const expected = validateCSVFile({ name: notCSV.name, size: notCSV.size });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      String(expected)
    );
    expect(
      screen.queryByRole("heading", { name: /Step 2 of 4/ })
    ).not.toBeInTheDocument();
  });
});

describe("step model (M7)", () => {
  it("states the real position, not just the current caption", async () => {
    render(<ImportContactsDialog {...baseProps} />);

    expect(
      screen.getByRole("heading", { name: "Step 1 of 4: Upload CSV" })
    ).toBeInTheDocument();

    await uploadCSV();
    expect(
      await screen.findByRole("heading", { name: "Step 2 of 4: Map columns" })
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(
      screen.getByRole("heading", { name: "Step 3 of 4: Review" })
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(
      screen.getByRole("heading", { name: "Step 2 of 4: Map columns" })
    ).toBeInTheDocument();
  });

  it("moves focus into the step that replaced the one the user was in", async () => {
    render(<ImportContactsDialog {...baseProps} />);

    await uploadCSV();
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Step 2 of 4: Map columns" })
      ).toHaveFocus()
    );

    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Step 3 of 4: Review" })
      ).toHaveFocus()
    );
    // Focus is never left on <body>, which is where it landed when the
    // focused Continue button unmounted with its step.
    expect(document.activeElement).not.toBe(document.body);
  });

  it("names every column-mapping select after the column it maps", async () => {
    render(<ImportContactsDialog {...baseProps} />);

    await uploadCSV("email,plan\nada@example.com,pro\n");

    expect(
      await screen.findByRole("combobox", { name: "Map CSV column email" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Map CSV column plan" })
    ).toBeInTheDocument();
  });
});

describe("import outcome (M8)", () => {
  it("reports a partial import as partial, not as a success", async () => {
    // The counts come from the action's result, not from the file - a small
    // CSV with a large result is the cheapest way to pin the arithmetic.
    await reachResults({
      success: true,
      created: 500,
      updated: 88,
      skipped: 0,
      errors: Array.from({ length: 412 }, (_, i) => ({
        row: i + 1,
        error: "Invalid email: not-an-email",
      })),
    });

    expect(
      await screen.findByText(
        `Imported ${(588).toLocaleString()} of ${(1000).toLocaleString()} contacts`
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/completed successfully/i)
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/412 rows couldn't be imported/i)
    ).toBeInTheDocument();
    expect(screen.getByText("412 errors")).toBeInTheDocument();
    // ...and it must not wear the success treatment while saying so.
    expect(partialBanner().className).toContain("bg-warning");
    expect(partialBanner().className).not.toContain("bg-success");
    expect(
      screen.getByRole("heading", { name: "Step 4 of 4: Results" })
    ).toBeInTheDocument();
  });

  it("counts skipped rows out of the imported total", async () => {
    await reachResults({
      success: true,
      created: 1,
      updated: 0,
      skipped: 3,
      errors: [],
    });

    expect(
      await screen.findByText("Imported 1 of 4 contacts")
    ).toBeInTheDocument();
    expect(screen.getByText("3 skipped")).toBeInTheDocument();
  });

  it("keeps the plain success wording when nothing failed", async () => {
    await reachResults(
      { success: true, created: 2, updated: 0, skipped: 0, errors: [] },
      "email\nada@example.com\nbea@example.com\n"
    );

    expect(
      await screen.findByText("Imported 2 of 2 contacts")
    ).toBeInTheDocument();
    expect(screen.queryByText(/couldn't be imported/i)).not.toBeInTheDocument();
    expect(screen.getByText("2 created")).toBeInTheDocument();
    expect(banner("Imported 2 of 2 contacts").className).toContain(
      "bg-success"
    );
  });

  it("still surfaces a whole-import failure on its own", async () => {
    await reachResults({
      success: false,
      error: "You've reached your contact limit. Please upgrade your plan.",
    });

    expect(
      await screen.findByText(/You've reached your contact limit/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Imported /)).not.toBeInTheDocument();
  });
});

// ─── Repeated rows (WEB-W follow-up) ───────────────────────────────────────
// A repeat inside the file used to abort the whole import. It is now skipped
// rather than fatal, which makes it easy to lose: without naming the rows, the
// operator sees only a "skipped" count and has nothing to search their file
// for.

describe("repeated rows in the source file", () => {
  it("names the repeated row and the row it repeats", async () => {
    await reachResults({
      success: true,
      created: 1,
      updated: 0,
      skipped: 1,
      errors: [],
      duplicates: [
        { row: 2, firstRow: 1, field: "email", value: "ada@example.com" },
      ],
    });

    expect(
      await screen.findByText(/Row 2: same email as row 1/)
    ).toBeInTheDocument();
    expect(screen.getByText(/1 repeated row in your file/)).toBeInTheDocument();
  });

  it("says the first of each repeat was kept, not that rows failed", async () => {
    await reachResults({
      success: true,
      created: 1,
      updated: 0,
      skipped: 1,
      errors: [],
      duplicates: [
        { row: 2, firstRow: 1, field: "phone", value: "+15550000101" },
      ],
    });

    expect(
      await screen.findByText(/The first of each was imported/)
    ).toBeInTheDocument();
    // A repeat is not a failed row, so it must not wear the error treatment.
    expect(screen.queryByText(/couldn't be imported/i)).not.toBeInTheDocument();
  });

  it("offers the full list as a file rather than an unreadable scroll", async () => {
    await reachResults({
      success: true,
      created: 1,
      updated: 0,
      skipped: 30,
      errors: [],
      duplicates: Array.from({ length: 30 }, (_, i) => ({
        row: i + 2,
        firstRow: 1,
        field: "email" as const,
        value: "ada@example.com",
      })),
    });

    expect(
      await screen.findByText(/30 repeated rows in your file/)
    ).toBeInTheDocument();
    expect(screen.getByText(/and 10 more/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /download/i })
    ).toBeInTheDocument();
  });

  it("says nothing about repeats when the file had none", async () => {
    await reachResults({
      success: true,
      created: 2,
      updated: 0,
      skipped: 0,
      errors: [],
      duplicates: [],
    });

    expect(await screen.findByText(/^Imported /)).toBeInTheDocument();
    expect(screen.queryByText(/repeated row/i)).not.toBeInTheDocument();
  });
});
