"use client";

import { useForm } from "@tanstack/react-form";
import type { topicSettings } from "@wraps/db";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@wraps/ui/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@wraps/ui/components/ui/card";
import { Textarea } from "@wraps/ui/components/ui/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@wraps/ui/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@wraps/ui/components/ui/tooltip";
import { ExternalLink, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { ImageUpload } from "@/components/ui/image-upload";
import { Input } from "@/components/ui/input";
import {
  CONTRAST_PAIRS,
  contrastRatio,
  resolveThemeTokens,
  wcagLevel,
} from "@/lib/preference-theme/contrast";
import { buildThemeFromAccent } from "@/lib/preference-theme/ramp";
import { resolvePreferenceCenterTheme } from "@/lib/preference-theme/resolve";
import {
  generatePreferenceCenterPreviewUrl,
  updateTopicSettings,
} from "../actions";
import {
  capturePreferenceCenterDiscarded,
  capturePreferenceCenterPreviewBlocked,
  capturePreferenceCenterPreviewOpened,
  capturePreferenceCenterSaveBlocked,
  capturePreferenceCenterSettingsSaved,
  captureThemeContrastCheckOpened,
  captureThemeEditorControlChanged,
} from "./lib/analytics";
import { ContrastDialog } from "./theme-editor/contrast-dialog";
import { ImportCssDialog } from "./theme-editor/import-css-dialog";
import { Preview } from "./theme-editor/preview";
import type {
  PreviewMode,
  PreviewState,
  PreviewWidth,
} from "./theme-editor/toolbar";
import { Toolbar } from "./theme-editor/toolbar";
import { useThemeDraft } from "./theme-editor/use-theme-draft";

type TopicSettingsType = typeof topicSettings.$inferSelect;

type PreferenceCenterSettingsProps = {
  organizationId: string;
  orgSlug: string;
  settings: TopicSettingsType | null;
  brandColor: string | null;
  orgName: string;
  orgLogo: string | null;
};

type FailingContrast = { light: number; dark: number; total: number };

function countFailingContrastPairs(
  theme: ReturnType<typeof resolvePreferenceCenterTheme>
): FailingContrast {
  const host = typeof document === "undefined" ? null : document.body;
  if (!host) {
    return { light: 0, dark: 0, total: 0 };
  }

  let light = 0;
  let dark = 0;

  for (const mode of ["light", "dark"] as const) {
    const resolved = resolveThemeTokens(theme, mode);
    for (const pair of CONTRAST_PAIRS) {
      const fg = resolved[pair.fg];
      const bg = resolved[pair.bg];
      if (!(fg && bg)) {
        continue;
      }
      const ratio = contrastRatio(fg, bg, host);
      if (ratio === null) {
        continue;
      }
      if (!wcagLevel(ratio).aa) {
        if (mode === "light") {
          light++;
        } else {
          dark++;
        }
      }
    }
  }

  return { light, dark, total: light + dark };
}

export function PreferenceCenterSettings({
  organizationId,
  orgSlug,
  settings,
  brandColor,
  orgName,
  orgLogo,
}: PreferenceCenterSettingsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const initialTheme = useMemo(() => {
    const resolved = resolvePreferenceCenterTheme({
      theme: settings?.preferenceCenterTheme ?? null,
      brandColor,
    });
    // First time opening the editor for this org (no stored theme at all):
    // populate the full ramp from the existing brand color so the editor
    // opens on a complete, coherent theme instead of a half-empty one. Once
    // a theme is stored — even from a CSS import, or just accent edits —
    // leave it exactly as saved; re-deriving here would silently overwrite
    // manual or imported per-token customizations.
    if (!settings?.preferenceCenterTheme && resolved.light.primary) {
      return buildThemeFromAccent(resolved.light.primary, resolved);
    }
    return resolved;
    // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally computed once per settings/brandColor identity, not on every draft edit
  }, [settings, brandColor]);

  const {
    draft,
    isDirty,
    setAccent,
    setRadius,
    setFont,
    setFontsLinked,
    setColorScheme,
    applyParsed,
    reset,
  } = useThemeDraft(initialTheme);

  // Deliberately not a TanStack form field: this component reads
  // form.state.values during render without subscribing, so a form-bound logo
  // would not live-update the preview. Parent state does, and it gives an
  // honest dirty flag.
  const [logo, setLogo] = useState<string | null>(
    settings?.preferenceCenterLogo ?? null
  );
  const logoDirty = logo !== (settings?.preferenceCenterLogo ?? null);

  const [previewState, setPreviewState] = useState<PreviewState>("default");
  const [previewWidth, setPreviewWidth] = useState<PreviewWidth>("desktop");
  const [previewMode, setPreviewMode] = useState<PreviewMode>(() =>
    initialTheme.colorScheme === "dark" ? "dark" : "light"
  );

  const [importCssOpen, setImportCssOpen] = useState(false);
  const [contrastOpen, setContrastOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [saveWarning, setSaveWarning] = useState<FailingContrast | null>(null);

  const previewModeNote = useMemo(() => {
    if (draft.colorScheme === "system" || draft.colorScheme === previewMode) {
      return null;
    }
    return draft.colorScheme === "light"
      ? "Previewing dark. Subscribers always see light."
      : "Previewing light. Subscribers always see dark.";
  }, [draft.colorScheme, previewMode]);

  useEffect(() => {
    if (!(isDirty || logoDirty)) {
      return;
    }
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty, logoDirty]);

  const form = useForm({
    defaultValues: {
      preferenceCenterTitle: settings?.preferenceCenterTitle || "",
      preferenceCenterDescription: settings?.preferenceCenterDescription || "",
    },
  });

  const doSave = () => {
    startTransition(async () => {
      const result = await updateTopicSettings(organizationId, {
        preferenceCenterTitle: form.state.values.preferenceCenterTitle || null,
        preferenceCenterDescription:
          form.state.values.preferenceCenterDescription || null,
        preferenceCenterLogo: logo,
        preferenceCenterTheme: draft,
      });

      if (result.success) {
        capturePreferenceCenterSettingsSaved({
          color_scheme: draft.colorScheme,
          has_logo: Boolean(logo),
        });
        toast.success("Preference center updated");
        router.refresh();
      } else {
        toast.error(result.error || "Failed to save settings");
      }
    });
  };

  const handleSaveClick = () => {
    const failing = countFailingContrastPairs(draft);
    if (failing.total > 0) {
      capturePreferenceCenterSaveBlocked({ failing_pairs: failing.total });
      setSaveWarning(failing);
      return;
    }
    doSave();
  };

  const handlePreview = async () => {
    setIsPreviewLoading(true);
    try {
      const result = await generatePreferenceCenterPreviewUrl(organizationId);
      if (result.success) {
        capturePreferenceCenterPreviewOpened();
        window.open(result.url, "_blank");
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsPreviewLoading(false);
    }
  };

  /**
   * The button underneath is `disabled` while `isDirty`, so a native click
   * on it fires no click event at all - the only feedback was a hover
   * tooltip (audit F16 recorded 4 dead clicks on this control across 2
   * sessions). This handler lives on the wrapping `<span>` instead: because
   * a disabled button gets `pointer-events: none`, clicks land on the span
   * underneath it, so it sees blocked attempts the button itself never
   * would. Captures the attempt AND gives on-click feedback so a click
   * without a preceding hover isn't silent.
   */
  const handlePreviewButtonClick = () => {
    if (isDirty) {
      capturePreferenceCenterPreviewBlocked();
      toast.info("Save your changes to see them on the live page.");
      return;
    }
    handlePreview();
  };

  const previewTitle =
    form.state.values.preferenceCenterTitle || "Email Preferences";
  const previewDescription =
    form.state.values.preferenceCenterDescription ||
    "Manage subscriptions for j***e@example.com";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Preference Center Settings</CardTitle>
          <CardDescription>
            Customize the appearance and content of your subscriber preference
            center. This is where contacts can manage their topic subscriptions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSaveClick();
            }}
          >
            <form.Field name="preferenceCenterTitle">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Page Title</FieldLabel>
                  <FieldContent>
                    <Input
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Email Preferences"
                      value={field.state.value}
                    />
                    <FieldDescription>
                      Title shown at the top of the preference center page
                    </FieldDescription>
                  </FieldContent>
                </Field>
              )}
            </form.Field>

            <form.Field name="preferenceCenterDescription">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                  <FieldContent>
                    <Textarea
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      placeholder="Manage subscriptions for {{masked_email}}"
                      rows={3}
                      value={field.state.value}
                    />
                    <FieldDescription>
                      Introductory text shown below the title. Available
                      variables:{" "}
                      <code className="rounded bg-muted px-1 text-xs">
                        {"{{masked_email}}"}
                      </code>
                      ,{" "}
                      <code className="rounded bg-muted px-1 text-xs">
                        {"{{email}}"}
                      </code>
                      ,{" "}
                      <code className="rounded bg-muted px-1 text-xs">
                        {"{{org_name}}"}
                      </code>
                    </FieldDescription>
                  </FieldContent>
                </Field>
              )}
            </form.Field>

            <Field>
              <FieldLabel>Logo</FieldLabel>
              <FieldContent>
                {/* value is the preference-center logo ONLY, never the
                    orgLogo fallback: ImageUpload sends its value as
                    oldLogoUrl and the API deletes that object on
                    replace/remove. Binding the fallback here would delete the
                    organization's logo out from under the dashboard. */}
                <ImageUpload
                  disabled={isPending}
                  onChange={setLogo}
                  orgSlug={orgSlug}
                  value={logo}
                />
                <FieldDescription>
                  Shown above the title on the preference center and
                  confirmation pages. Leave empty to use your organization logo.
                  PNG, JPEG, or WebP. Max 5MB.
                </FieldDescription>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel>What subscribers see</FieldLabel>
              <FieldContent>
                <ToggleGroup
                  onValueChange={(value) => {
                    if (!value) {
                      return;
                    }
                    captureThemeEditorControlChanged({
                      control: "color_scheme",
                    });
                    setColorScheme(value as "light" | "dark" | "system");
                  }}
                  type="single"
                  value={draft.colorScheme}
                  variant="outline"
                >
                  <ToggleGroupItem value="light">Light</ToggleGroupItem>
                  <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
                  <ToggleGroupItem value="system">Auto</ToggleGroupItem>
                </ToggleGroup>
                <FieldDescription>
                  Auto follows each subscriber's own device setting.
                </FieldDescription>
              </FieldContent>
            </Field>
          </form>
        </CardContent>
      </Card>

      <Toolbar
        draft={draft}
        isDirty={isDirty || logoDirty}
        isSaving={isPending}
        onOpenContrastCheck={() => {
          captureThemeContrastCheckOpened();
          setContrastOpen(true);
        }}
        onOpenImportCss={() => setImportCssOpen(true)}
        onPreviewModeChange={(mode) => {
          captureThemeEditorControlChanged({ control: "preview_mode" });
          setPreviewMode(mode);
        }}
        onPreviewStateChange={(state) => {
          captureThemeEditorControlChanged({ control: "preview_state" });
          setPreviewState(state);
        }}
        onPreviewWidthChange={(width) => {
          captureThemeEditorControlChanged({ control: "preview_width" });
          setPreviewWidth(width);
        }}
        onSave={handleSaveClick}
        previewMode={previewMode}
        previewModeNote={previewModeNote}
        previewState={previewState}
        previewWidth={previewWidth}
        setAccent={(accent) => {
          captureThemeEditorControlChanged({ control: "accent" });
          setAccent(accent);
        }}
        setFont={(slot, id) => {
          captureThemeEditorControlChanged({ control: "font" });
          setFont(slot, id);
        }}
        setFontsLinked={(linked) => {
          captureThemeEditorControlChanged({ control: "fonts_linked" });
          setFontsLinked(linked);
        }}
        setRadius={(value) => {
          captureThemeEditorControlChanged({ control: "radius" });
          setRadius(value);
        }}
      />

      <Preview
        description={previewDescription}
        logo={logo ?? orgLogo}
        orgName={orgName}
        previewMode={previewMode}
        previewState={previewState}
        previewWidth={previewWidth}
        theme={draft}
        title={previewTitle}
      />

      <div className="flex gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            {/* onClick lives here, not on the Button: a disabled button
                fires no click event at all, but `pointer-events: none` on
                the disabled child means clicks land on this span instead -
                see handlePreviewButtonClick. Mouse/pointer-only by design:
                a disabled button is never keyboard-focusable, so there is no
                keyboard path onto this span for the blocked-click case this
                exists to catch - a key handler here would be dead code. The
                enabled case is a real <button> underneath, which already
                gets native keyboard activation. */}
            {/** biome-ignore lint/a11y/noStaticElementInteractions: see comment above - the interactive child handles keyboard, this span only catches otherwise-invisible mouse clicks on its disabled sibling */}
            {/** biome-ignore lint/a11y/useKeyWithClickEvents: mouse/pointer-only click target, see comment above */}
            {/** biome-ignore lint/a11y/noNoninteractiveElementInteractions: mouse/pointer-only click target, see comment above */}
            <span onClick={handlePreviewButtonClick}>
              <Button
                disabled={isPreviewLoading || isDirty}
                type="button"
                variant="outline"
              >
                {isPreviewLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="mr-2 h-4 w-4" />
                )}
                Open live preview
              </Button>
            </span>
          </TooltipTrigger>
          {isDirty && (
            <TooltipContent>
              Save your changes to see them on the live page.
            </TooltipContent>
          )}
        </Tooltip>

        <Button
          disabled={!isDirty}
          onClick={() => setDiscardConfirmOpen(true)}
          type="button"
          variant="outline"
        >
          Discard
        </Button>
      </div>

      <ImportCssDialog
        currentTheme={draft}
        onApply={applyParsed}
        onOpenChange={setImportCssOpen}
        open={importCssOpen}
      />

      <ContrastDialog
        onOpenChange={setContrastOpen}
        open={contrastOpen}
        previewMode={previewMode}
        theme={draft}
      />

      <AlertDialog
        onOpenChange={setDiscardConfirmOpen}
        open={discardConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This resets the theme editor back to the last saved version. Your
              unsaved changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                capturePreferenceCenterDiscarded();
                reset();
                setLogo(settings?.preferenceCenterLogo ?? null);
                setDiscardConfirmOpen(false);
              }}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(open) => !open && setSaveWarning(null)}
        open={saveWarning !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Some colors may be hard to read</AlertDialogTitle>
            <AlertDialogDescription>
              {saveWarning?.total} color{" "}
              {saveWarning?.total === 1 ? "pair" : "pairs"} fall below WCAG AA
              contrast
              {saveWarning && saveWarning.light > 0 && saveWarning.dark > 0
                ? ` (${saveWarning.light} in light mode, ${saveWarning.dark} in dark mode)`
                : saveWarning && saveWarning.dark > 0
                  ? " in dark mode"
                  : saveWarning && saveWarning.light > 0
                    ? " in light mode"
                    : ""}
              . Subscribers with low vision may not be able to read this page,
              and it's a page they didn't choose to visit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setContrastOpen(true);
              }}
            >
              Review contrast
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setSaveWarning(null);
                doSave();
              }}
            >
              Save anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
