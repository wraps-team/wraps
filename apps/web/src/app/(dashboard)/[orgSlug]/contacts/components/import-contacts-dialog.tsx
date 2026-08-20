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
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { useCallback, useRef, useState, useTransition } from "react";
import {
  type ImportContactInput,
  importContacts,
} from "@/actions/import-contacts";
import { Button } from "@/components/ui/button";
import type { ImportContactsResult } from "@/lib/contacts";
import {
  autoMapColumns,
  type ColumnMapping,
  type ContactField,
  FIELD_LABELS,
} from "@/lib/csv-column-mapping";
import { downloadCSV, toCSV } from "@/lib/csv-export";
import {
  describeParseFailure,
  MAX_CSV_ROWS,
  type ParseCSVResult,
  parseCSV,
  validateCSVFile,
} from "@/lib/csv-parse";
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
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setCsvData(null);
    setColumnMappings({});
    setDuplicateStrategy("skip");
    setSelectedTopicIds([]);
    setResult(null);
    setUploadError(null);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        reset();
      }
      onOpenChange(open);
    },
    [onOpenChange, reset]
  );

  // ─── Step 1: Upload ─────────────────────────────────────────────────────

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }

      setUploadError(null);

      const fileError = validateCSVFile(file);
      if (fileError) {
        setUploadError(fileError);
        e.target.value = "";
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

      // Reset input so same file can be re-selected
      e.target.value = "";
    },
    []
  );

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

  const previewRows = mappedContacts.slice(0, 5);

  const handleImport = useCallback(() => {
    captureContactsImportSubmitted({
      contact_count: mappedContacts.length,
      duplicate_strategy: duplicateStrategy,
      topic_count: selectedTopicIds.length,
      was_truncated: csvData?.truncated ?? false,
    });
    startTransition(async () => {
      const res = await importContacts(organizationId, {
        contacts: mappedContacts,
        topicIds: selectedTopicIds.length > 0 ? selectedTopicIds : undefined,
        duplicateStrategy,
      });
      setResult(res);
      setStep("results");
      if (res.success) {
        captureContactsImportCompleted({
          contact_count: mappedContacts.length,
          created: res.created,
          failed: res.errors.length,
          skipped: res.skipped,
          updated: res.updated,
        });
        onImportComplete();
      } else {
        captureContactsImportFailed({ contact_count: mappedContacts.length });
      }
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
            {step === "results" && "Import complete."}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <div
              className="flex w-full cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors hover:border-primary/50 hover:bg-muted/50"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium text-sm">
                  Click to upload a CSV file
                </p>
                <p className="text-muted-foreground text-xs">
                  .csv files up to 10,000 rows and 10 MB
                </p>
              </div>
            </div>
            <input
              accept=".csv"
              className="hidden"
              onChange={handleFileSelect}
              ref={fileInputRef}
              type="file"
            />
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
                          <SelectTrigger className="h-8 text-xs">
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
                    {previewRows.map((row, i) => (
                      <TableRow key={i}>
                        {Object.entries(columnMappings)
                          .filter(([, v]) => v !== "skip")
                          .map(([header, mapping]) => {
                            const value =
                              mapping === "property"
                                ? row.properties?.[header]
                                : row[mapping as keyof ImportContactInput];
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
                    Importing...
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
              <>
                <div className="flex items-center gap-2 rounded-md bg-success/10 p-3 text-success">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium text-sm">
                    Import completed successfully
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.created > 0 && (
                    <Badge className="bg-success/15 text-success">
                      {result.created} created
                    </Badge>
                  )}
                  {result.updated > 0 && (
                    <Badge className="bg-info/15 text-info">
                      {result.updated} updated
                    </Badge>
                  )}
                  {result.skipped > 0 && (
                    <Badge variant="secondary">{result.skipped} skipped</Badge>
                  )}
                  {result.errors.length > 0 && (
                    <Badge variant="destructive">
                      {result.errors.length} error
                      {result.errors.length === 1 ? "" : "s"}
                    </Badge>
                  )}
                </div>

                {result.errors.length > 0 && (
                  <div className="max-h-[150px] space-y-1 overflow-y-auto rounded-md border p-3">
                    {result.errors.map((err, i) => (
                      <p className="text-destructive text-xs" key={i}>
                        Row {err.row}: {err.error}
                      </p>
                    ))}
                  </div>
                )}
              </>
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
