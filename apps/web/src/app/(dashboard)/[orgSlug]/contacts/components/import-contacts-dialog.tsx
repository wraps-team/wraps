"use client";

import { Badge } from "@wraps/ui/components/ui/badge";
import { Checkbox } from "@wraps/ui/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wraps/ui/components/ui/dialog";
import { Label } from "@wraps/ui/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@wraps/ui/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@wraps/ui/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wraps/ui/components/ui/table";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  type ImportContactInput,
  importContacts,
} from "@/actions/import-contacts";
import { Button } from "@/components/ui/button";
import type { ImportContactsResult, ImportDuplicateRow } from "@/lib/contacts";
import {
  autoMapColumns,
  type ColumnMapping,
  type ContactField,
  FIELD_LABELS,
} from "@/lib/csv-column-mapping";
import { downloadCSV, toCSV } from "@/lib/csv-export";
import {
  describeParseFailure,
  describePayloadTooLarge,
  MAX_CSV_ROWS,
  type ParseCSVResult,
  parseCSV,
  validateCSVFile,
} from "@/lib/csv-parse";
import { chunkForImport, serializedBytes } from "@/lib/import-chunks";
import { splitRepeats } from "@/lib/import-dedupe";
import type { TopicWithMeta } from "@/lib/topics";
import {
  captureContactsImportColumnsMapped,
  captureContactsImportCompleted,
  captureContactsImportFailed,
  captureContactsImportFileParsed,
  captureContactsImportSubmitted,
} from "./lib/analytics";

type ImportContactsDialogProps = {
  organizationId: string;
  topics: TopicWithMeta[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete: () => void;
};

type Step = "upload" | "map" | "preview" | "results";

/** The wizard's four steps, in the order they run (audit M7). */
const STEP_ORDER: Step[] = ["upload", "map", "preview", "results"];

const STEP_LABELS: Record<Step, string> = {
  upload: "Upload CSV",
  map: "Map columns",
  preview: "Review",
  results: "Results",
};

const FILE_INPUT_ID = "import-contacts-csv-file";

/**
 * States where the user is, rather than leaving them to infer it (audit M7).
 *
 * The heading is also the focus target for every step change: the content
 * swaps under an unchanged dialog title and the button that had focus
 * unmounts, so without this focus fell to `<body>`. Focusing a heading both
 * moves the keyboard user into the new step and announces it, which is why
 * there is no live region here as well — two announcements are worse than one.
 */
function StepIndicator({
  headingRef,
  step,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  step: Step;
}) {
  const index = STEP_ORDER.indexOf(step);
  return (
    <div className="space-y-2 border-b pb-3">
      <h3
        className="font-medium text-foreground text-sm"
        ref={headingRef}
        tabIndex={-1}
      >
        Step {index + 1} of {STEP_ORDER.length}: {STEP_LABELS[step]}
      </h3>
      {/* Decoration only — the heading above already carries the position. */}
      <ol aria-hidden="true" className="flex items-center gap-1.5">
        {STEP_ORDER.map((s, i) => (
          <li
            className={`h-1 flex-1 rounded-full ${
              i <= index ? "bg-primary" : "bg-muted"
            }`}
            key={s}
          />
        ))}
      </ol>
    </div>
  );
}

/** Says how many rows are being dropped, not just that some are. */
function TruncationNotice({ csvData }: { csvData: ParseCSVResult }) {
  const dropped = csvData.totalRows - csvData.rows.length;
  return (
    <p className="text-warning text-xs" role="alert">
      This file has {csvData.totalRows.toLocaleString()} rows. Wraps imports{" "}
      {MAX_CSV_ROWS.toLocaleString()} at a time, so the last{" "}
      {dropped.toLocaleString()} will be left out. Split the file to import the
      rest.
    </p>
  );
}

/**
 * Headlines the outcome, not the intent (audit M8).
 *
 * This used to render "Import completed successfully" in the success colour
 * and then a destructive "412 errors" badge directly underneath — two
 * contradictory claims about the same import. A partial import now says how
 * many of how many landed, and only an import with no failed rows gets the
 * success treatment.
 */
function ImportOutcome({
  result,
}: {
  result: Extract<ImportContactsResult, { success: true }>;
}) {
  const imported = result.created + result.updated;
  const failed = result.errors.length;
  // Every submitted row lands in exactly one of these buckets, so they sum to
  // what the operator asked us to import.
  const total = imported + result.skipped + failed;
  const isPartial = failed > 0;

  return (
    <>
      <div
        className={
          isPartial
            ? "flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3"
            : "flex items-start gap-2 rounded-md bg-success/10 p-3 text-success"
        }
      >
        {isPartial ? (
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
        )}
        <div className="space-y-1">
          <p className="font-medium text-sm">
            Imported {imported.toLocaleString()} of {total.toLocaleString()}{" "}
            contact{total === 1 ? "" : "s"}
          </p>
          {isPartial && (
            <p className="text-muted-foreground text-xs">
              {failed.toLocaleString()} row{failed === 1 ? "" : "s"} couldn't be
              imported. Fix {failed === 1 ? "it" : "them"} in your file and
              import that file again.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {result.created > 0 && (
          <Badge className="bg-success/15 text-success">
            {result.created.toLocaleString()} created
          </Badge>
        )}
        {result.updated > 0 && (
          <Badge className="bg-info/15 text-info">
            {result.updated.toLocaleString()} updated
          </Badge>
        )}
        {result.skipped > 0 && (
          <Badge variant="secondary">
            {result.skipped.toLocaleString()} skipped
          </Badge>
        )}
        {failed > 0 && (
          <Badge variant="destructive">
            {failed.toLocaleString()} error{failed === 1 ? "" : "s"}
          </Badge>
        )}
      </div>

      {failed > 0 && (
        <div className="max-h-[150px] space-y-1 overflow-y-auto rounded-md border p-3">
          {result.errors.map((err) => (
            // Keyed by the row the failure belongs to (audit L3) — a row fails
            // at most once, so this is stable where the array index was not.
            <p
              className="text-destructive text-xs"
              key={`${err.row}-${err.error}`}
            >
              Row {err.row}: {err.error}
            </p>
          ))}
        </div>
      )}

      {result.duplicates && result.duplicates.length > 0 && (
        <DuplicateRows duplicates={result.duplicates} />
      )}
    </>
  );
}

/** How many repeated rows to list before offering the file instead. */
const DUPLICATES_SHOWN = 20;

/**
 * Names the rows the file repeated, rather than burying them in a count.
 *
 * A repeat is why an import used to fail outright, so the operator has every
 * reason to want to fix it at the source — and "N skipped" tells them nothing
 * about where to look. Past a screenful the list stops being readable, so the
 * rest go out as a CSV they can open next to the original.
 */
function DuplicateRows({ duplicates }: { duplicates: ImportDuplicateRow[] }) {
  const shown = duplicates.slice(0, DUPLICATES_SHOWN);
  const remaining = duplicates.length - shown.length;

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-sm">
          {duplicates.length.toLocaleString()} repeated row
          {duplicates.length === 1 ? "" : "s"} in your file
        </p>
        <Button
          onClick={() =>
            downloadCSV(
              toCSV(duplicates, [
                { header: "Row", accessor: (d) => d.row },
                { header: "Duplicate of row", accessor: (d) => d.firstRow },
                { header: "Field", accessor: (d) => d.field },
                { header: "Value", accessor: (d) => d.value },
              ]),
              "repeated-rows.csv"
            )
          }
          size="sm"
          variant="outline"
        >
          <Download className="mr-2 h-4 w-4" />
          Download
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Each was left out because an earlier row already had the same address or
        number. The first of each was imported.
      </p>
      <div className="max-h-[150px] space-y-1 overflow-y-auto">
        {shown.map((dup) => (
          <p className="text-muted-foreground text-xs" key={dup.row}>
            Row {dup.row}: same {dup.field} as row {dup.firstRow} ({dup.value})
          </p>
        ))}
        {remaining > 0 && (
          <p className="text-muted-foreground text-xs italic">
            and {remaining.toLocaleString()} more — download the list to see
            them all.
          </p>
        )}
      </div>
    </div>
  );
}

export function ImportContactsDialog({
  organizationId,
  topics,
  open,
  onOpenChange,
  onImportComplete,
}: ImportContactsDialogProps) {
  const [step, setStep] = useState<Step>("upload");
  const [csvData, setCsvData] = useState<ParseCSVResult | null>(null);
  const [columnMappings, setColumnMappings] = useState<
    Record<string, ColumnMapping>
  >({});
  const [duplicateStrategy, setDuplicateStrategy] = useState<"skip" | "update">(
    "skip"
  );
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [result, setResult] = useState<ImportContactsResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  // How many of the chunked calls have finished, for files large enough to
  // take more than one. Null when an import isn't running or needs only one.
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const announcedStepRef = useRef<Step | null>(null);

  // Move focus into the step that just replaced the one the user was in
  // (audit M7). Skipped on the first render of a session so the dialog's own
  // opening focus is left alone; when the dialog is closed its content is
  // unmounted and the ref is null, so a reset is a no-op here.
  useEffect(() => {
    if (announcedStepRef.current === step) {
      return;
    }
    const isFirstStep = announcedStepRef.current === null;
    announcedStepRef.current = step;
    if (!isFirstStep) {
      stepHeadingRef.current?.focus();
    }
  }, [step]);

  const reset = useCallback(() => {
    setStep("upload");
    setCsvData(null);
    setColumnMappings({});
    setDuplicateStrategy("skip");
    setSelectedTopicIds([]);
    setResult(null);
    setUploadError(null);
    setIsDraggingFile(false);
    setProgress(null);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        reset();
        announcedStepRef.current = null;
      }
      onOpenChange(open);
    },
    [onOpenChange, reset]
  );

  // ─── Step 1: Upload ─────────────────────────────────────────────────────

  /** One path for a picked file and a dropped one, so both fail identically. */
  const processFile = useCallback((file: File) => {
    setUploadError(null);

    const fileError = validateCSVFile(file);
    if (fileError) {
      setUploadError(fileError);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      setUploadError(
        `Your browser couldn't read "${file.name}". If it's open in another program, close it and try again.`
      );
    };
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text !== "string") {
        setUploadError(`Your browser couldn't read "${file.name}" as text.`);
        return;
      }

      const parsed = parseCSV(text);
      const parseError = describeParseFailure(parsed);
      if (parseError) {
        setUploadError(parseError);
        return;
      }

      setCsvData(parsed);
      setColumnMappings(autoMapColumns(parsed.headers));
      setStep("map");
      captureContactsImportFileParsed({
        row_count: parsed.rows.length,
        total_rows: parsed.totalRows,
        was_truncated: parsed.truncated,
      });
    };
    reader.readAsText(file);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }
      processFile(file);
      // Reset input so same file can be re-selected
      e.target.value = "";
    },
    [processFile]
  );

  // The dropzone is styled as one, so it accepts a drop (audit L7) — dashed
  // borders that do nothing are a promise the surface can't keep.
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setIsDraggingFile(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) {
        return;
      }
      processFile(file);
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDraggingFile(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDraggingFile(false);
  }, []);

  const handleDownloadTemplate = useCallback(() => {
    const headers = [
      "Email",
      "Phone",
      "First Name",
      "Last Name",
      "Company",
      "Job Title",
      "Created At",
    ];
    const csv = toCSV(
      [
        {
          email: "jane@example.com",
          phone: "+15551234567",
          firstName: "Jane",
          lastName: "Doe",
          company: "Acme Inc",
          jobTitle: "Engineer",
          createdAt: "2024-01-15T00:00:00.000Z",
        },
      ],
      headers.map((h, i) => ({
        header: h,
        accessor: (row: Record<string, string>) => Object.values(row)[i] ?? "",
      }))
    );
    downloadCSV(csv, "contacts-import-template.csv");
  }, []);

  // ─── Step 2: Map Columns ────────────────────────────────────────────────

  const updateMapping = useCallback((header: string, value: ColumnMapping) => {
    setColumnMappings((prev) => ({ ...prev, [header]: value }));
  }, []);

  const hasIdentifierMapped = Object.values(columnMappings).some(
    (v) => v === "email" || v === "phone"
  );

  const hasDuplicateFields = (() => {
    const fields = Object.values(columnMappings).filter(
      (v) => v !== "skip" && v !== "property"
    );
    return new Set(fields).size !== fields.length;
  })();

  const canProceedToPreview = hasIdentifierMapped && !hasDuplicateFields;

  // ─── Step 3: Preview & Configure ────────────────────────────────────────

  const toggleTopic = useCallback((topicId: string) => {
    setSelectedTopicIds((prev) =>
      prev.includes(topicId)
        ? prev.filter((id) => id !== topicId)
        : [...prev, topicId]
    );
  }, []);

  const mappedContacts: ImportContactInput[] =
    csvData?.rows.map((row) => {
      const contact: ImportContactInput = {};
      const properties: Record<string, string> = {};

      for (const [header, mapping] of Object.entries(columnMappings)) {
        const value = row[header];
        if (!value || mapping === "skip") {
          continue;
        }

        if (mapping === "property") {
          properties[header] = value;
        } else {
          contact[mapping] = value;
        }
      }

      if (Object.keys(properties).length > 0) {
        contact.properties = properties;
      }

      return contact;
    }) ?? [];

  // Each preview row carries the line it came from in the source file, which is
  // its identity and never moves — unlike its index in this array (audit L3).
  const previewRows = mappedContacts.slice(0, 5).map((contact, index) => ({
    contact,
    line: index + 2,
  }));

  const handleImport = useCallback(() => {
    captureContactsImportSubmitted({
      contact_count: mappedContacts.length,
      duplicate_strategy: duplicateStrategy,
      topic_count: selectedTopicIds.length,
      was_truncated: csvData?.truncated ?? false,
    });

    // Repeats are found here, over the whole file, before anything is sent.
    // The server sees only one chunk per call, so a repeat straddling a chunk
    // boundary would reach it as an ordinary existing contact and be counted
    // as skipped without ever being reported.
    const { kept, duplicates: repeatedRows } = splitRepeats(mappedContacts);

    // Split the send so no single request approaches the Server Action body
    // limit. A chunk that still exceeds it — one row carrying megabytes of
    // custom properties — is caught here, because Next rejects an oversized
    // body before the action runs and nothing downstream could explain it.
    const chunks = chunkForImport(kept);
    const oversized = chunks.find((chunk) => {
      const contacts = chunk.map((k) => k.contact);
      return (
        describePayloadTooLarge(serializedBytes(contacts), chunk.length) !==
        null
      );
    });
    if (oversized) {
      setResult({
        success: false,
        error: describePayloadTooLarge(
          serializedBytes(oversized.map((k) => k.contact)),
          oversized.length
        ) as string,
      });
      setStep("results");
      captureContactsImportFailed({ contact_count: mappedContacts.length });
      return;
    }

    startTransition(async () => {
      const totals = {
        created: 0,
        updated: 0,
        skipped: repeatedRows.length,
        errorCount: 0,
      };
      const errors: Array<{ row: number; error: string }> = [];

      for (let i = 0; i < chunks.length; i++) {
        const isLast = i === chunks.length - 1;
        const chunk = chunks[i];
        setProgress({ done: i, total: chunks.length });

        const res = await importContacts(organizationId, {
          contacts: chunk.map((k) => k.contact),
          topicIds: selectedTopicIds.length > 0 ? selectedTopicIds : undefined,
          duplicateStrategy,
          deferSummary: !isLast,
          priorTotals: i === 0 ? undefined : { ...totals },
        });

        // A failed chunk stops the run. Earlier chunks are already committed,
        // so report what did land rather than implying nothing was imported.
        if (!res.success) {
          setResult({
            success: false,
            error:
              chunks.length > 1
                ? `${res.error} ${totals.created.toLocaleString()} contacts from earlier in the file were imported before this happened.`
                : res.error,
          });
          setStep("results");
          setProgress(null);
          captureContactsImportFailed({
            contact_count: mappedContacts.length,
          });
          return;
        }

        totals.created += res.created;
        totals.updated += res.updated;
        totals.skipped += res.skipped;
        totals.errorCount += res.errors.length;
        // Each call numbers rows from 1 within the list it was handed, and
        // that list has had repeats removed — so a row number only means
        // something once it is mapped back through the chunk it came from.
        errors.push(
          ...res.errors.map((err) => ({
            ...err,
            row: chunk[err.row - 1]?.row ?? err.row,
          }))
        );
      }

      setProgress(null);
      setResult({
        success: true,
        created: totals.created,
        updated: totals.updated,
        skipped: totals.skipped,
        errors,
        duplicates: repeatedRows,
      });
      setStep("results");
      captureContactsImportCompleted({
        contact_count: mappedContacts.length,
        created: totals.created,
        failed: totals.errorCount,
        skipped: totals.skipped,
        updated: totals.updated,
      });
      onImportComplete();
    });
  }, [
    organizationId,
    mappedContacts,
    selectedTopicIds,
    duplicateStrategy,
    csvData,
    onImportComplete,
  ]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="overflow-hidden sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle>Import Contacts</DialogTitle>
          <DialogDescription>
            {step === "upload" && "Upload a CSV file to import contacts."}
            {step === "map" && "Map CSV columns to contact fields."}
            {step === "preview" && "Review and configure your import."}
            {step === "results" && "What the import did."}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator headingRef={stepHeadingRef} step={step} />

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="flex flex-col items-center gap-4 py-8">
            {/*
              A real <label> wrapping a visually-hidden-but-focusable input
              (audit C1). This was a bare <div onClick> over an input with
              `display: none`, so nothing in the step could be focused at all
              and the only way into the product's bulk-import path was a mouse.
              The label gives back focus, Enter/Space activation and an
              accessible name with no key handling of our own.
            */}
            {/** biome-ignore lint/a11y/noNoninteractiveElementInteractions: the drag handlers are an addition to a natively activatable control (the file input this label owns), not a substitute for one - there is nothing here for a keyboard user to miss */}
            <label
              className={`flex w-full cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors hover:border-primary/50 hover:bg-muted/50 focus-within:border-primary focus-within:ring-2 focus-within:ring-ring ${
                isDraggingFile ? "border-primary bg-muted/50" : ""
              }`}
              htmlFor={FILE_INPUT_ID}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium text-sm">
                  Choose a CSV file, or drag one here
                </p>
                <p className="text-muted-foreground text-xs">
                  .csv files up to 10,000 rows and 10 MB
                </p>
              </div>
              {/*
                `sr-only` clips the input instead of removing it from the tab
                order the way `hidden` (display: none) did.
              */}
              <input
                accept=".csv"
                className="sr-only"
                id={FILE_INPUT_ID}
                onChange={handleFileSelect}
                type="file"
              />
            </label>
            {uploadError && (
              <div
                className="flex w-full items-start gap-2 rounded-md bg-destructive/10 p-3 text-destructive"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="text-sm">{uploadError}</span>
              </div>
            )}
            <Button
              className="text-xs"
              onClick={handleDownloadTemplate}
              size="sm"
              variant="ghost"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download template
            </Button>
          </div>
        )}

        {/* Step 2: Map Columns */}
        {step === "map" && csvData && (
          <div className="space-y-4">
            <div className="max-h-[350px] overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">CSV Column</TableHead>
                    <TableHead className="w-[180px]">Map to</TableHead>
                    <TableHead>Preview</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {csvData.headers.map((header) => (
                    <TableRow key={header}>
                      <TableCell className="font-medium text-sm">
                        {header}
                      </TableCell>
                      <TableCell>
                        <Select
                          onValueChange={(v) =>
                            updateMapping(header, v as ColumnMapping)
                          }
                          value={columnMappings[header] ?? "property"}
                        >
                          {/*
                            Named after the column it maps (audit M7): the
                            table header is a visual association only, so
                            without this a screen reader announced the selected
                            value with no idea which column it belonged to.
                          */}
                          <SelectTrigger
                            aria-label={`Map CSV column ${header}`}
                            className="h-8 text-xs"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="skip">Skip</SelectItem>
                            {(
                              Object.entries(FIELD_LABELS) as [
                                ContactField,
                                string,
                              ][]
                            ).map(([field, label]) => (
                              <SelectItem key={field} value={field}>
                                {label}
                              </SelectItem>
                            ))}
                            <SelectItem value="property">
                              Custom Property
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground text-xs">
                        {csvData.rows[0]?.[header] ?? ""}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {!hasIdentifierMapped && (
              <p className="text-destructive text-xs">
                At least one column must be mapped to Email or Phone.
              </p>
            )}
            {hasDuplicateFields && (
              <p className="text-destructive text-xs">
                Each contact field can only be mapped once.
              </p>
            )}

            {csvData.truncated && <TruncationNotice csvData={csvData} />}

            <DialogFooter>
              <Button onClick={() => setStep("upload")} variant="outline">
                Back
              </Button>
              <Button
                disabled={!canProceedToPreview}
                onClick={() => {
                  const mappings = Object.values(columnMappings);
                  const hasEmail = mappings.includes("email");
                  const hasPhone = mappings.includes("phone");
                  let identifierField: "both" | "email" | "phone" = "phone";
                  if (hasEmail && hasPhone) {
                    identifierField = "both";
                  } else if (hasEmail) {
                    identifierField = "email";
                  }
                  captureContactsImportColumnsMapped({
                    identifier_field: identifierField,
                    mapped_field_count: mappings.filter((m) => m !== "skip")
                      .length,
                    property_field_count: mappings.filter(
                      (m) => m === "property"
                    ).length,
                  });
                  setStep("preview");
                }}
              >
                Continue
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 3: Preview & Configure */}
        {step === "preview" && csvData && (
          <div className="min-w-0 space-y-4">
            {/* Preview table */}
            <div className="min-w-0">
              <Label className="mb-2 block text-xs text-muted-foreground">
                Preview (first {Math.min(5, mappedContacts.length)} of{" "}
                {mappedContacts.length} contacts)
              </Label>
              <div className="min-w-0 rounded-md border">
                <Table className="min-w-max">
                  <TableHeader>
                    <TableRow>
                      {Object.entries(columnMappings)
                        .filter(([, v]) => v !== "skip")
                        .map(([header, mapping]) => (
                          <TableHead
                            className="whitespace-nowrap text-xs"
                            key={header}
                          >
                            {mapping === "property"
                              ? header
                              : FIELD_LABELS[mapping as ContactField]}
                          </TableHead>
                        ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map(({ contact, line }) => (
                      <TableRow key={`csv-line-${line}`}>
                        {Object.entries(columnMappings)
                          .filter(([, v]) => v !== "skip")
                          .map(([header, mapping]) => {
                            const value =
                              mapping === "property"
                                ? contact.properties?.[header]
                                : contact[mapping as keyof ImportContactInput];
                            return (
                              <TableCell
                                className="max-w-[180px] truncate whitespace-nowrap text-xs"
                                key={header}
                              >
                                {typeof value === "string" ? value : ""}
                              </TableCell>
                            );
                          })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Duplicate strategy */}
            <div className="space-y-2">
              <Label>Duplicate handling</Label>
              <RadioGroup
                onValueChange={(v) =>
                  setDuplicateStrategy(v as "skip" | "update")
                }
                value={duplicateStrategy}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem id="dup-skip" value="skip" />
                  <Label
                    className="cursor-pointer font-normal"
                    htmlFor="dup-skip"
                  >
                    Skip duplicates
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem id="dup-update" value="update" />
                  <Label
                    className="cursor-pointer font-normal"
                    htmlFor="dup-update"
                  >
                    Update existing contacts
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Topic subscriptions */}
            {topics.length > 0 && (
              <div className="space-y-2">
                <Label>Subscribe to topics</Label>
                <div className="max-h-[120px] space-y-2 overflow-y-auto rounded-md border p-3">
                  {topics.map((topic) => (
                    <div className="flex items-center space-x-2" key={topic.id}>
                      <Checkbox
                        checked={selectedTopicIds.includes(topic.id)}
                        id={`import-topic-${topic.id}`}
                        onCheckedChange={() => toggleTopic(topic.id)}
                      />
                      <Label
                        className="cursor-pointer font-normal"
                        htmlFor={`import-topic-${topic.id}`}
                      >
                        {topic.name}
                        {topic.description && (
                          <span className="ml-1 text-muted-foreground text-xs">
                            - {topic.description}
                          </span>
                        )}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 rounded-md bg-muted/50 p-3">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                Ready to import{" "}
                <span className="font-medium">{mappedContacts.length}</span>{" "}
                contact{mappedContacts.length === 1 ? "" : "s"}
              </span>
            </div>

            {csvData.truncated && <TruncationNotice csvData={csvData} />}

            <DialogFooter>
              <Button onClick={() => setStep("map")} variant="outline">
                Back
              </Button>
              <Button disabled={isPending} onClick={handleImport}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {/* A file large enough to be split takes long enough that
                        a bare spinner reads as a hang. */}
                    {progress && progress.total > 1
                      ? `Importing batch ${progress.done + 1} of ${progress.total}...`
                      : "Importing..."}
                  </>
                ) : (
                  "Import"
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 4: Results */}
        {step === "results" && result && (
          <div className="space-y-4">
            {result.success ? (
              <ImportOutcome result={result} />
            ) : (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <span className="text-sm">{result.error}</span>
              </div>
            )}

            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
