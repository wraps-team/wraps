"use client";

import { useForm } from "@tanstack/react-form";
import { toSesVariableName } from "@wraps/template-render/mustache-case";
import { Alert, AlertDescription } from "@wraps/ui/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@wraps/ui/components/ui/dialog";
import { Separator } from "@wraps/ui/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@wraps/ui/components/ui/tabs";
import { Textarea } from "@wraps/ui/components/ui/textarea";
import { AlertCircle, Loader2, Mail, Send, User } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useSession } from "@/lib/auth-client";
import { isLongFormVariable, renderForPreview } from "@/lib/handlebars";

type TemplateVariable = { name: string; fallback?: string };

type SendTestModalProps = {
  orgSlug: string;
  templateId: string;
  isOpen: boolean;
  onClose: () => void;
  defaultFrom?: string | null;
  defaultFromName?: string | null;
  /**
   * Compiled template HTML. When provided, the preview is rendered with
   * `renderForPreview` so `{{#if}}` blocks and `{{var}}` substitutions
   * match what recipients will actually see at send time.
   */
  compiledHtml?: string | null;
  /**
   * Variables declared by the code template's compiler. Used to render
   * inputs in the form and seed the preview substitution. Each entry's
   * `fallback` (if any) seeds the input's default value.
   */
  templateVariables?: TemplateVariable[];
  /**
   * Default test data values curated alongside the template (e.g. exported
   * from the React Email source). Pre-populates form inputs so users do not
   * have to retype values they already curated for preview.
   */
  templateTestData?: Record<string, unknown>;
};

// System variables auto-injected by the server for marketing templates
const SYSTEM_VARIABLES = new Set(["unsubscribeUrl", "preferencesUrl"]);

// Extract variable names from template content (e.g., {{variableName}})
function extractVariables(content: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const matches = new Set<string>();

  for (const match of content.matchAll(regex)) {
    if (!SYSTEM_VARIABLES.has(match[1])) {
      matches.add(match[1]);
    }
  }

  return Array.from(matches);
}

export function SendTestModal({
  orgSlug,
  templateId,
  isOpen,
  onClose,
  defaultFrom,
  defaultFromName,
  compiledHtml,
  templateVariables,
  templateTestData,
}: SendTestModalProps) {
  const { data: session } = useSession();
  const [isSending, setIsSending] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"form" | "preview">("form");

  // Get user's email for "Send to Self" feature
  const userEmail = session?.user?.email;

  // Source of truth for the template body. Contains raw `{{var}}`
  // placeholders that get substituted at preview/send time.
  const templateContent = compiledHtml ?? "";

  // Prefer the compiler's variable list (which has canonical fallbacks
  // attached); fall back to regex extraction for templates compiled before
  // the compiler started emitting one.
  const variables = useMemo(() => {
    if (templateVariables && templateVariables.length > 0) {
      return templateVariables.map((v) => v.name);
    }
    return extractVariables(templateContent);
  }, [templateContent, templateVariables]);

  // TanStack Form reads a dotted `name` as a deep path: a field named
  // "contact.firstName" writes to values.contact.firstName, while the rest of
  // this component reads the flat key values["contact.firstName"] — which
  // never leaves its default. Typing into a dotted variable therefore reached
  // neither the preview nor the send. Key the form by the SES-flattened name
  // (contactFirstName), which is single-level by construction and is also the
  // name the transformed template references. The authoring name stays on the
  // label so the user still sees {{contact.firstName}}.
  const variableFields = useMemo(
    () =>
      variables.map((name) => ({ name, fieldName: toSesVariableName(name) })),
    [variables]
  );

  // Map of variable name → default value for seeding form inputs.
  // Priority: explicit testData > variable fallback > empty string.
  // Non-primitive testData values (objects/arrays from jsonb) are
  // JSON.stringified rather than coerced via String() so they don't
  // render as the literal "[object Object]" in form inputs.
  const variableDefaults = useMemo(() => {
    const defaults: Record<string, string> = {};
    if (templateVariables) {
      for (const v of templateVariables) {
        if (v.fallback !== undefined) {
          defaults[v.name] = v.fallback;
        }
      }
    }
    if (templateTestData) {
      for (const [key, value] of Object.entries(templateTestData)) {
        if (value === undefined || value === null) {
          continue;
        }
        if (typeof value === "object") {
          defaults[key] = JSON.stringify(value);
        } else {
          defaults[key] = String(value);
        }
      }
    }
    return defaults;
  }, [templateVariables, templateTestData]);

  // Seed by the authoring name first, then the flattened one: a template's
  // curated testData export may key either form.
  const defaultFor = useCallback(
    (f: { name: string; fieldName: string }) =>
      variableDefaults[f.name] ?? variableDefaults[f.fieldName] ?? "",
    [variableDefaults]
  );

  // Build dynamic schema based on variables
  const formSchema = useMemo(() => {
    const shape: Record<string, z.ZodDefault<z.ZodString>> = {};
    for (const f of variableFields) {
      shape[f.fieldName] = z.string().default("");
    }

    return z.object({
      from: z.string().email("Please enter a valid sender email address"),
      to: z.string().email("Please enter a valid email address"),
      subject: z.string().min(1, "Subject is required"),
      ...shape,
    });
  }, [variableFields]);

  type FormValues = z.infer<typeof formSchema>;

  const form = useForm({
    defaultValues: {
      from: defaultFrom || "",
      to: "",
      subject: "",
      ...Object.fromEntries(
        variableFields.map((f) => [f.fieldName, defaultFor(f)])
      ),
    } as FormValues,
    validators: {
      onSubmit: formSchema,
    },
    onSubmit: async ({ value }) => {
      setIsSending(true);

      try {
        // Keyed by fieldName (the SES-flattened name) — that is where the
        // form actually stored the value, and it is the name the transformed
        // template references on the server.
        const testData: Record<string, string> = {};
        for (const f of variableFields) {
          testData[f.fieldName] = String(
            value[f.fieldName as keyof FormValues] ?? ""
          );
        }

        const response = await fetch(
          `/api/${orgSlug}/emails/templates/${templateId}/send-test`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recipients: [value.to],
              subject: value.subject,
              from: value.from,
              testData,
            }),
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to send test email");
        }

        if (data.success) {
          toast.success("Test email sent!", {
            description: `Email sent to ${value.to}`,
          });
          if (data.warnings?.length > 0) {
            for (const warning of data.warnings) {
              toast.warning(warning);
            }
          }
          onClose();
        } else if (data.failed > 0) {
          const failedDetails = data.details?.failed?.[0];
          throw new Error(failedDetails?.error || "Failed to send test email");
        }
      } catch (error) {
        toast.error("Failed to send test email", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        setIsSending(false);
      }
    },
  });

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      form.reset({
        from: defaultFrom || "",
        to: "",
        subject: "",
        ...Object.fromEntries(
          variableFields.map((f) => [f.fieldName, defaultFor(f)])
        ),
      } as FormValues);
      setPreviewHtml(null);
      setActiveTab("form");
    }
  }, [isOpen, form, variableFields, defaultFor, defaultFrom]);

  // Fill recipient with user's email
  const handleSendToSelf = useCallback(() => {
    if (userEmail) {
      form.setFieldValue("to", userEmail);
    }
  }, [form, userEmail]);

  // Generate preview HTML with variables replaced, through the canonical
  // `renderForPreview` so `{{#if}}` blocks, `{{var|fallback}}` syntax and
  // dotted paths resolve exactly as they will at send time.
  //
  // With no compiled HTML there is nothing to render, so the preview stays
  // empty and the "fill in the form" alert shows. The tab switch happens
  // either way — the button is always enabled, and a click that changed
  // nothing on screen read as broken.
  const generatePreview = useCallback(() => {
    const values = form.state.values;

    if (compiledHtml != null && compiledHtml.length > 0) {
      // Form values on top of the template's curated testData / fallbacks
      // for any field the user didn't override.
      const data: Record<string, string> = { ...variableDefaults };
      for (const f of variableFields) {
        const value = values[f.fieldName as keyof FormValues];
        if (value !== undefined && value !== "") {
          data[f.fieldName] = String(value);
        }
      }
      setPreviewHtml(renderForPreview(compiledHtml, data));
    }
    setActiveTab("preview");
  }, [form, compiledHtml, variableFields, variableDefaults]);

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={isOpen}>
      {/* Capped at the viewport with the panels scrolling inside: a template
          with many variables renders a form taller than the screen, and the
          base DialogContent is a centered fixed box with no overflow — the
          bottom of the form (and the Send button) becomes unreachable. */}
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Send Test Email
          </DialogTitle>
          <DialogDescription>
            Send a test email to preview how your template will look in an
            inbox.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          className="flex min-h-0 flex-1 flex-col"
          onValueChange={(v) => setActiveTab(v as "form" | "preview")}
          value={activeTab}
        >
          <TabsList className="grid w-full shrink-0 grid-cols-2">
            <TabsTrigger value="form">Details</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          <TabsContent
            className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1"
            value="form"
          >
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
            >
              <form.Field name="from">
                {(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;
                  const errors = field.state.meta.errors.map((error) => ({
                    message: String(error),
                  }));
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>From</FieldLabel>
                      <FieldContent>
                        <Input
                          aria-invalid={isInvalid}
                          id={field.name}
                          name={field.name}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="hello@yourdomain.com"
                          type="email"
                          value={field.state.value}
                        />
                        {isInvalid && <FieldError errors={errors} />}
                      </FieldContent>
                    </Field>
                  );
                }}
              </form.Field>

              <form.Field name="to">
                {(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;
                  const errors = field.state.meta.errors.map((error) => ({
                    message: String(error),
                  }));
                  return (
                    <Field data-invalid={isInvalid}>
                      <div className="flex items-center justify-between">
                        <FieldLabel htmlFor={field.name}>To</FieldLabel>
                        {userEmail && (
                          <Button
                            className="h-auto p-0 text-xs"
                            onClick={handleSendToSelf}
                            type="button"
                            variant="link"
                          >
                            <User className="mr-1 h-3 w-3" />
                            Send to myself
                          </Button>
                        )}
                      </div>
                      <FieldContent>
                        <Input
                          aria-invalid={isInvalid}
                          id={field.name}
                          name={field.name}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="test@example.com"
                          type="email"
                          value={field.state.value}
                        />
                        {isInvalid && <FieldError errors={errors} />}
                      </FieldContent>
                    </Field>
                  );
                }}
              </form.Field>

              <form.Field name="subject">
                {(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;
                  const errors = field.state.meta.errors.map((error) => ({
                    message: String(error),
                  }));
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Subject Line</FieldLabel>
                      <FieldContent>
                        <Input
                          aria-invalid={isInvalid}
                          id={field.name}
                          name={field.name}
                          onBlur={field.handleBlur}
                          onChange={(e) => field.handleChange(e.target.value)}
                          placeholder="Welcome to our service!"
                          value={field.state.value}
                        />
                        {isInvalid && <FieldError errors={errors} />}
                      </FieldContent>
                    </Field>
                  );
                }}
              </form.Field>

              {variables.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h4 className="mb-3 font-medium text-sm">
                      Template Variables
                    </h4>
                    <p className="mb-4 text-muted-foreground text-xs">
                      Fill in values for the variables used in your template.
                    </p>
                    <div className="space-y-3">
                      {variableFields.map((f) => (
                        <form.Field
                          key={f.name}
                          name={f.fieldName as keyof FormValues}
                        >
                          {(field) => {
                            const isInvalid =
                              field.state.meta.isTouched &&
                              !field.state.meta.isValid;
                            const errors = field.state.meta.errors.map(
                              (error) => ({
                                message: String(error),
                              })
                            );
                            return (
                              <Field data-invalid={isInvalid}>
                                <FieldLabel
                                  className="font-mono text-xs"
                                  htmlFor={field.name}
                                >
                                  {`{{${f.name}}}`}
                                </FieldLabel>
                                <FieldContent>
                                  {isLongFormVariable(
                                    f.name,
                                    String(field.state.value ?? "")
                                  ) ? (
                                    <Textarea
                                      aria-invalid={isInvalid}
                                      id={field.name}
                                      name={field.name}
                                      onBlur={field.handleBlur}
                                      onChange={(e) =>
                                        field.handleChange(e.target.value)
                                      }
                                      placeholder={`Value for ${f.name}`}
                                      rows={5}
                                      value={String(field.state.value ?? "")}
                                    />
                                  ) : (
                                    <Input
                                      aria-invalid={isInvalid}
                                      id={field.name}
                                      name={field.name}
                                      onBlur={field.handleBlur}
                                      onChange={(e) =>
                                        field.handleChange(e.target.value)
                                      }
                                      placeholder={`Value for ${f.name}`}
                                      value={String(field.state.value ?? "")}
                                    />
                                  )}
                                  {isInvalid && <FieldError errors={errors} />}
                                </FieldContent>
                              </Field>
                            );
                          }}
                        </form.Field>
                      ))}
                    </div>
                  </div>
                </>
              )}

              <DialogFooter className="gap-2 pt-4">
                <Button
                  onClick={generatePreview}
                  type="button"
                  variant="outline"
                >
                  Preview
                </Button>
                <Button disabled={isSending} type="submit">
                  {isSending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send Test Email
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent
            className="mt-4 min-h-0 flex-1 overflow-y-auto"
            value="preview"
          >
            {previewHtml ? (
              // Isolated in a sandboxed iframe rather than injected into the
              // dashboard DOM: the renderer substitutes variable values
              // verbatim to match SES, so this markup is not trusted. The
              // iframe also stops email CSS from leaking into the app.
              <iframe
                className="h-[400px] w-full rounded-md border bg-background"
                sandbox=""
                srcDoc={previewHtml}
                title="Test email preview"
              />
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Fill in the form details and click "Preview" to see how your
                  email will look.
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter className="gap-2 pt-4">
              <Button
                onClick={() => setActiveTab("form")}
                type="button"
                variant="outline"
              >
                Back to Form
              </Button>
              <Button disabled={isSending} onClick={() => form.handleSubmit()}>
                {isSending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Send Test Email
                  </>
                )}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
