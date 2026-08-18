"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@wraps/ui/components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@wraps/ui/components/ui/collapsible";
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
import { Skeleton } from "@wraps/ui/components/ui/skeleton";
import { Textarea } from "@wraps/ui/components/ui/textarea";
import { AlertCircle, Check, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { extractTemplateVariables } from "@/actions/batch";
import { Input } from "@/components/ui/input";
import type { ExtractedVariable, VariableMapping } from "@/lib/batch";
import { isLongFormVariable } from "@/lib/handlebars";
import { cn } from "@/lib/utils";

type VariableMapperProps = {
  organizationId: string;
  templateId: string;
  mappings: VariableMapping[];
  onChange: (mappings: VariableMapping[]) => void;
  /**
   * Values the broadcast form already collects elsewhere, keyed by the template
   * variable they fill. Asking for these again in the mapper is a duplicate.
   */
  formManagedValues: Record<string, string>;
};

// Contact fields available for mapping
const CONTACT_FIELDS = [
  { value: "firstName", label: "First Name" },
  { value: "lastName", label: "Last Name" },
  { value: "email", label: "Email" },
  { value: "company", label: "Company" },
  { value: "jobTitle", label: "Job Title" },
];

// Template variables the wizard fills from its own fields instead of prompting
// for a second time in the mapper.
const FORM_MANAGED_LABELS: Record<string, string> = {
  subject: "Subject line",
  previewText: "Preview text",
};

export function VariableMapper({
  organizationId,
  templateId,
  mappings,
  onChange,
  formManagedValues,
}: VariableMapperProps) {
  const [variables, setVariables] = useState<ExtractedVariable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  // Fetch variables when templateId changes
  useEffect(() => {
    async function fetchVariables() {
      if (!templateId) {
        setVariables([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const result = await extractTemplateVariables(organizationId, templateId);
      if (result.success) {
        setVariables(result.variables);
      } else {
        setError(result.error);
      }
      setLoading(false);
    }

    fetchVariables();
  }, [organizationId, templateId]);

  // Variables the wizard already has an answer for (subject, preview text)
  const formManagedVariables = useMemo(
    () => variables.filter((v) => v.name in FORM_MANAGED_LABELS),
    [variables]
  );

  // Get custom variables that need mapping
  const customVariables = variables.filter(
    (v) => !(v.isKnown || v.name in FORM_MANAGED_LABELS)
  );
  const knownVariables = variables.filter(
    (v) => v.isKnown && !(v.name in FORM_MANAGED_LABELS)
  );

  // Keep the form-managed variables bound to the fields above rather than
  // asking the user to type the same subject twice.
  useEffect(() => {
    if (formManagedVariables.length === 0) {
      return;
    }
    const rest = mappings.filter(
      (m) => !(m.variableName in FORM_MANAGED_LABELS)
    );
    const managed: VariableMapping[] = formManagedVariables.map((v) => ({
      variableName: v.name,
      source: { type: "static", value: formManagedValues[v.name] ?? "" },
    }));
    const alreadyInSync =
      mappings.length === rest.length + managed.length &&
      managed.every((m) => {
        const current = mappings.find(
          (existing) => existing.variableName === m.variableName
        );
        return (
          current?.source.type === "static" &&
          current.source.value === (m.source as { value: string }).value
        );
      });
    if (!alreadyInSync) {
      onChange([...rest, ...managed]);
    }
  }, [formManagedVariables, formManagedValues, mappings, onChange]);

  // Check if all custom variables are mapped
  const unmappedCount = customVariables.filter((v) => {
    const mapping = mappings.find((m) => m.variableName === v.name);
    if (!mapping) {
      return true;
    }
    if (mapping.source.type === "static" && !mapping.source.value.trim()) {
      return true;
    }
    if (mapping.source.type === "contact" && !mapping.source.field) {
      return true;
    }
    return false;
  }).length;

  // Update a single mapping
  const updateMapping = (
    variableName: string,
    source: VariableMapping["source"]
  ) => {
    const newMappings = mappings.filter((m) => m.variableName !== variableName);
    newMappings.push({ variableName, source });
    onChange(newMappings);
  };

  // Get current mapping for a variable
  const getMapping = (variableName: string): VariableMapping | undefined =>
    mappings.find((m) => m.variableName === variableName);

  if (loading) {
    return (
      <Card className="mt-4">
        <CardHeader className="py-3">
          <CardTitle className="text-base">Template Variables</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert className="mt-4" variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  // No variables in template
  if (variables.length === 0) {
    return null;
  }

  return (
    <Card className="mt-4">
      <Collapsible onOpenChange={setIsExpanded} open={isExpanded}>
        <CardHeader className="py-3">
          <CollapsibleTrigger className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">Template Variables</CardTitle>
              {unmappedCount > 0 && (
                <span className="rounded-full bg-yellow-100 px-2 py-0.5 font-medium text-xs text-yellow-700">
                  {unmappedCount} needs mapping
                </span>
              )}
              {unmappedCount === 0 && customVariables.length > 0 && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-700 text-xs">
                  All mapped
                </span>
              )}
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                isExpanded && "rotate-180"
              )}
            />
          </CollapsibleTrigger>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Filled from the wizard's own fields — not asked for twice */}
            {formManagedVariables.length > 0 && (
              <div>
                <p className="mb-2 font-medium text-muted-foreground text-sm">
                  From this broadcast ({formManagedVariables.length})
                </p>
                <div className="space-y-1">
                  {formManagedVariables.map((v) => (
                    <div
                      className="flex items-center gap-2 text-sm"
                      key={v.name}
                    >
                      <Check className="h-4 w-4 shrink-0 text-green-600" />
                      <span className="font-mono text-xs">{v.name}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="truncate">
                        {formManagedValues[v.name] || (
                          <span className="text-muted-foreground">
                            {FORM_MANAGED_LABELS[v.name]} (empty)
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-muted-foreground text-xs">
                  Edit these in the Subject &amp; Preview card above.
                </p>
              </div>
            )}

            {/* Known variables (auto-mapped) */}
            {knownVariables.length > 0 && (
              <div>
                <p className="mb-2 font-medium text-muted-foreground text-sm">
                  Auto-mapped ({knownVariables.length})
                </p>
                <div className="space-y-1">
                  {knownVariables.map((v) => (
                    <div
                      className="flex items-center gap-2 text-sm"
                      key={v.name}
                    >
                      <Check className="h-4 w-4 text-green-600" />
                      <span className="font-mono text-xs">{v.name}</span>
                      <span className="text-muted-foreground">→</span>
                      <span>{v.label || getCategoryLabel(v.category)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Custom variables (need mapping) */}
            {customVariables.length > 0 && (
              <div>
                <p className="mb-2 font-medium text-muted-foreground text-sm">
                  Needs mapping ({customVariables.length})
                </p>
                <div className="space-y-4">
                  {customVariables.map((v) => (
                    <VariableMapperRow
                      key={v.name}
                      mapping={getMapping(v.name)}
                      onUpdate={(source) => updateMapping(v.name, source)}
                      variable={v}
                    />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function VariableMapperRow({
  variable,
  mapping,
  onUpdate,
}: {
  variable: ExtractedVariable;
  mapping?: VariableMapping;
  onUpdate: (source: VariableMapping["source"]) => void;
}) {
  const sourceType = mapping?.source.type || "static";
  const staticValue =
    mapping?.source.type === "static" ? mapping.source.value : "";
  const contactField =
    mapping?.source.type === "contact" ? mapping.source.field : "";

  const hasError =
    !mapping ||
    (sourceType === "static" && !staticValue.trim()) ||
    (sourceType === "contact" && !contactField);

  const isLongForm = isLongFormVariable(variable.name, staticValue);

  return (
    <div
      className={cn(
        "rounded-lg border p-3",
        hasError ? "border-warning/30 bg-warning/10" : "border-border"
      )}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="font-medium font-mono text-sm">{variable.name}</span>
        {variable.fallback && (
          <span className="text-muted-foreground text-xs">
            (fallback: "{variable.fallback}")
          </span>
        )}
      </div>

      <RadioGroup
        className="space-y-2"
        onValueChange={(value: "static" | "contact") => {
          if (value === "static") {
            onUpdate({ type: "static", value: staticValue });
          } else {
            onUpdate({ type: "contact", field: contactField });
          }
        }}
        value={sourceType}
      >
        {/* Static value option */}
        <div className="flex items-start space-x-2">
          <RadioGroupItem id={`${variable.name}-static`} value="static" />
          <div className="flex-1 space-y-1">
            <Label
              className="cursor-pointer text-sm"
              htmlFor={`${variable.name}-static`}
            >
              Static value
            </Label>
            {sourceType === "static" &&
              (isLongForm ? (
                <Textarea
                  className="min-h-24 text-sm"
                  onChange={(e) =>
                    onUpdate({ type: "static", value: e.target.value })
                  }
                  placeholder="Enter value..."
                  rows={5}
                  value={staticValue}
                />
              ) : (
                <Input
                  className="h-8"
                  onChange={(e) =>
                    onUpdate({ type: "static", value: e.target.value })
                  }
                  placeholder="Enter value..."
                  value={staticValue}
                />
              ))}
          </div>
        </div>

        {/* Contact field option */}
        <div className="flex items-start space-x-2">
          <RadioGroupItem id={`${variable.name}-contact`} value="contact" />
          <div className="flex-1 space-y-1">
            <Label
              className="cursor-pointer text-sm"
              htmlFor={`${variable.name}-contact`}
            >
              Contact field
            </Label>
            {sourceType === "contact" && (
              <Select
                onValueChange={(value) =>
                  onUpdate({ type: "contact", field: value })
                }
                value={contactField}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Select field..." />
                </SelectTrigger>
                <SelectContent>
                  {CONTACT_FIELDS.map((field) => (
                    <SelectItem key={field.value} value={field.value}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </RadioGroup>
    </div>
  );
}

function getCategoryLabel(category: ExtractedVariable["category"]): string {
  switch (category) {
    case "contact":
      return "Contact Field";
    case "organization":
      return "Organization";
    case "system":
      return "System";
    case "custom":
      return "Custom";
    default:
      return category;
  }
}
