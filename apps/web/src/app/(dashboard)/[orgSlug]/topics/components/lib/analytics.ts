"use client";

import posthog from "posthog-js";

/**
 * Product instrumentation for the topics tree (audit finding F16, wave 3).
 *
 * `posthog.capture` appeared zero times across topics, double opt-in
 * settings, and the preference-center theme editor before this pass.
 * Conventions match `contacts/components/lib/analytics.ts` (the reference for
 * this wave) and `segments/components/lib/analytics.ts` (its sibling):
 * - Event names and properties are snake_case.
 * - No contact PII. Subscriber emails shown in the subscribers sheet never
 *   leave the browser. Theme colors, radius, and font choices are org design
 *   decisions, not personal data, but are still reported as enums/booleans
 *   where possible rather than raw values.
 * - No server-side capture exists for any topic or preference-center
 *   mutation - `actions/topics.ts` only writes an audit log entry
 *   (`topic.created`, an `AuditLogAction`, not a PostHog event), so nothing
 *   here risks double-counting.
 */

// ─── Topic CRUD ─────────────────────────────────────────────────────────────

export function captureTopicCreated(props: {
  double_opt_in: boolean;
  public: boolean;
}) {
  posthog.capture("topic_created", props);
}

/** `double_opt_in` is the new value only when it was part of this edit -
 * null otherwise, so "was double opt-in touched, and to what" is answerable
 * without the field always being 1 (audit F16's live question: whether
 * operators turn the feature on now that wave 2 surfaces the pending
 * cohort). */
export function captureTopicUpdated(props: {
  double_opt_in: boolean | null;
  fields: string[];
}) {
  posthog.capture("topic_updated", props);
}

export function captureTopicDeleted() {
  posthog.capture("topic_deleted");
}

// ─── Subscribers sheet ──────────────────────────────────────────────────────

export function captureTopicSubscribersOpened(props: {
  source: "menu" | "row";
}) {
  posthog.capture("topic_subscribers_opened", props);
}

export function captureTopicSubscribersFilterChanged(props: {
  from: string;
  to: string;
}) {
  posthog.capture("topic_subscribers_filter_changed", props);
}

export function captureTopicSubscribersPageChanged(props: {
  direction: "next" | "previous";
  page: number;
}) {
  posthog.capture("topic_subscribers_page_changed", props);
}

// ─── Double opt-in confirmation settings ────────────────────────────────────

export function captureDoubleOptInSettingsSaved(props: {
  template_mode: "custom" | "default";
}) {
  posthog.capture("double_opt_in_settings_saved", props);
}

export function captureDoubleOptInTemplateChanged() {
  posthog.capture("double_opt_in_template_changed");
}

// ─── Preference center settings + theme editor ──────────────────────────────

export function capturePreferenceCenterSettingsSaved(props: {
  color_scheme: "dark" | "light" | "system";
  has_logo: boolean;
}) {
  posthog.capture("preference_center_settings_saved", props);
}

/** The contrast-warning gate on save (`countFailingContrastPairs`), fired
 * before the confirm/override dialog is even shown. */
export function capturePreferenceCenterSaveBlocked(props: {
  failing_pairs: number;
}) {
  posthog.capture("preference_center_save_blocked", props);
}

export function capturePreferenceCenterDiscarded() {
  posthog.capture("preference_center_discarded");
}

export function capturePreferenceCenterPreviewOpened() {
  posthog.capture("preference_center_preview_opened");
}

/**
 * The "Open live preview" button is `disabled` while `isDirty`, and its
 * explanatory tooltip only renders on hover - a click on the disabled button
 * itself produces no DOM change and no feedback (audit F16's dead-click
 * hypothesis). This fires from a click handler on the button's wrapping
 * `<span>` (the tooltip already relies on that span to receive pointer
 * events past the disabled child), so a blocked click is now visible even
 * when it was never hovered first. Paired with a toast in the component so
 * the click also gets on-click feedback, not just on-hover.
 */
export function capturePreferenceCenterPreviewBlocked() {
  posthog.capture("preference_center_preview_blocked");
}

/** Live-preview usage: which toolbar control people actually touch while
 * editing the theme. */
export function captureThemeEditorControlChanged(props: {
  control:
    | "accent"
    | "color_scheme"
    | "font"
    | "fonts_linked"
    | "preview_mode"
    | "preview_state"
    | "preview_width"
    | "radius";
}) {
  posthog.capture("theme_editor_control_changed", props);
}

export function captureThemeImportCssApplied(props: {
  dark_token_count: number;
  light_token_count: number;
}) {
  posthog.capture("theme_editor_import_css_applied", props);
}

export function captureThemeContrastCheckOpened() {
  posthog.capture("theme_editor_contrast_check_opened");
}
