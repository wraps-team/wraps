/**
 * Preference center theme editor instrumentation (audit finding F16, wave 3).
 *
 * The memo recorded 4 dead clicks on a "Preference Center" control across 2
 * sessions, with a live hypothesis that the target was the "Open live
 * preview" button: it is `disabled` while `isDirty`, and its explanatory
 * tooltip only renders on hover, so a click before ever hovering produced no
 * feedback at all. This confirms the hypothesis still holds against the
 * current component and asserts the fix - the click now surfaces a toast and
 * a `preference_center_preview_blocked` capture even without a preceding
 * hover - plus the settings-saved, save-blocked, and discard events.
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
import type { topicSettings } from "@wraps/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

globalThis.ResizeObserver ??= class {
  observe() {
    // no layout in jsdom
  }
  unobserve() {
    // no-op
  }
  disconnect() {
    // no-op
  }
} as unknown as typeof ResizeObserver;

function stubPointerEvents() {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
}

const capture = vi.fn();
vi.mock("posthog-js", () => ({
  default: { capture: (...args: unknown[]) => capture(...args) },
}));

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));

const toastInfo = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    info: (...args: unknown[]) => toastInfo(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const updateTopicSettings = vi.fn();
const generatePreferenceCenterPreviewUrl = vi.fn();
// Resolved relative to THIS file, not to preference-center-settings.tsx's own
// "../actions" import - this file sits one level deeper, under __tests__/.
vi.mock("../../actions", () => ({
  updateTopicSettings: (...args: unknown[]) => updateTopicSettings(...args),
  generatePreferenceCenterPreviewUrl: (...args: unknown[]) =>
    generatePreferenceCenterPreviewUrl(...args),
}));

// `lib/preference-theme/fonts.ts` calls `next/font/google` at module scope,
// which only works inside a Next build/test transform (see
// `use-theme-draft.ts`'s own note on this) - both the toolbar and the
// preview panel import it at runtime (not type-only), so plain Vitest can't
// evaluate the real module. A minimal stand-in sidesteps that without
// touching either component.
vi.mock("@/lib/preference-theme/fonts", () => {
  const PREFERENCE_FONTS = [
    { id: "inter", label: "Inter", category: "sans", fontFamily: "Inter" },
    {
      id: "lora",
      label: "Lora",
      category: "serif",
      fontFamily: "Lora",
    },
  ];
  return {
    PREFERENCE_FONTS,
    DEFAULT_BODY_FONT_ID: "inter",
    getPreferenceFont: (id: string | null | undefined) =>
      PREFERENCE_FONTS.find((f) => f.id === id) ?? null,
  };
});

// The uploader only makes network calls on a real file-input change, which
// these tests never trigger - render it for real rather than stub it out.

// `contrastRatio` normalizes colors via a 1x1 <canvas>, which jsdom has no
// 2D context for - it always returns null here, so the real module can never
// report a failing pair under Vitest (the ContrastDialog's own "couldn't be
// measured in this browser" fallback is this exact situation). Keep every
// other export real; only stand in for contrastRatio, defaulting to an
// always-AA-safe ratio so tests that save without touching contrast still
// exercise the real (non-blocked) save path.
const contrastRatio = vi.fn(
  (_fg: string, _bg: string, _host: HTMLElement) => 21
);
vi.mock("@/lib/preference-theme/contrast", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/preference-theme/contrast")>();
  return {
    ...actual,
    contrastRatio: (...args: Parameters<typeof actual.contrastRatio>) =>
      contrastRatio(...args),
  };
});

import { PreferenceCenterSettings } from "../preference-center-settings";

type TopicSettingsType = typeof topicSettings.$inferSelect;

const baseProps = {
  organizationId: "org-1",
  orgSlug: "acme",
  settings: null as TopicSettingsType | null,
  brandColor: "#4f46e5",
  orgName: "Acme",
  orgLogo: null,
};

beforeEach(() => {
  stubPointerEvents();
  capture.mockClear();
  push.mockClear();
  refresh.mockClear();
  toastInfo.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
  updateTopicSettings.mockReset();
  generatePreferenceCenterPreviewUrl.mockReset();
  contrastRatio.mockReset().mockReturnValue(21);
});

afterEach(cleanup);

/**
 * `isDirty` tracks the theme draft (`useThemeDraft`), not the title/
 * description text fields on their own separate TanStack form - typing in
 * "Page Title" alone never flips it. The "What subscribers see" toggle is
 * the simplest real edit that does.
 */
async function dirtyTheDraft() {
  // A type="single" Radix ToggleGroup exposes role="radio" on its items
  // (`role: "radiogroup"` on the root), not role="button".
  await userEvent.click(screen.getByRole("radio", { name: "Dark" }));
}

describe("preview button dead click (F16)", () => {
  it("is disabled while dirty, with no click handler that would fire", async () => {
    render(<PreferenceCenterSettings {...baseProps} />);

    await dirtyTheDraft();

    expect(
      screen.getByRole("button", { name: /open live preview/i })
    ).toBeDisabled();
  });

  it("captures preference_center_preview_blocked and shows a toast on a click while dirty - not silent", async () => {
    render(<PreferenceCenterSettings {...baseProps} />);

    await dirtyTheDraft();

    // The button itself is disabled and fires no click event; the fix's
    // handler lives on the wrapping span so the click is caught anyway.
    const button = screen.getByRole("button", {
      name: /open live preview/i,
    });
    // biome-ignore lint/style/noNonNullAssertion: the Button always renders inside its Tooltip span wrapper
    await userEvent.click(button.parentElement!);

    expect(capture).toHaveBeenCalledWith("preference_center_preview_blocked");
    expect(toastInfo).toHaveBeenCalledWith(
      "Save your changes to see them on the live page."
    );
    expect(generatePreferenceCenterPreviewUrl).not.toHaveBeenCalled();
  });

  it("captures preference_center_preview_opened on a successful click while clean", async () => {
    generatePreferenceCenterPreviewUrl.mockResolvedValue({
      success: true,
      url: "https://example.com/preview",
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<PreferenceCenterSettings {...baseProps} />);

    await userEvent.click(
      screen.getByRole("button", { name: /open live preview/i })
    );

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("preference_center_preview_opened");
    });
    expect(capture).not.toHaveBeenCalledWith(
      "preference_center_preview_blocked"
    );
    openSpy.mockRestore();
  });
});

describe("preference_center_settings_saved", () => {
  it("captures color_scheme and has_logo only on a successful save", async () => {
    updateTopicSettings.mockResolvedValue({ success: true });

    render(<PreferenceCenterSettings {...baseProps} />);

    // Save is disabled until the draft is dirty (see dirtyTheDraft).
    await dirtyTheDraft();
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(capture).toHaveBeenCalledWith("preference_center_settings_saved", {
        color_scheme: "dark",
        has_logo: false,
      });
    });
  });
});

describe("preference_center_save_blocked / discard", () => {
  it("captures failing_pairs and blocks the save when contrast fails, without saving", async () => {
    // `contrastRatio` is mocked low for this test only (see the module mock
    // above) - jsdom can't compute it for real (no canvas 2D context), and
    // `buildThemeFromAccent` derives an AA-safe pair from any real accent
    // anyway, so there's no in-app gesture that reliably fails contrast here.
    contrastRatio.mockReturnValue(1);

    render(<PreferenceCenterSettings {...baseProps} />);

    await dirtyTheDraft();
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(
        capture.mock.calls.some(
          (c) => c[0] === "preference_center_save_blocked"
        )
      ).toBe(true);
    });
    expect(
      capture.mock.calls.find(
        (c) => c[0] === "preference_center_save_blocked"
      )?.[1]
    ).toEqual({ failing_pairs: expect.any(Number) });
    expect(updateTopicSettings).not.toHaveBeenCalled();
  });

  it("captures preference_center_discarded when changes are discarded", async () => {
    render(<PreferenceCenterSettings {...baseProps} />);

    await dirtyTheDraft();
    await userEvent.click(screen.getByRole("button", { name: /^discard$/i }));
    await userEvent.click(
      screen.getByRole("button", { name: /^discard changes$/i })
    );

    expect(capture).toHaveBeenCalledWith("preference_center_discarded");
  });
});

describe("theme editor live-preview usage", () => {
  it("captures control: color_scheme when the ToggleGroup changes", async () => {
    render(<PreferenceCenterSettings {...baseProps} />);

    await dirtyTheDraft();

    expect(capture).toHaveBeenCalledWith("theme_editor_control_changed", {
      control: "color_scheme",
    });
  });

  it("captures theme_editor_contrast_check_opened", async () => {
    render(<PreferenceCenterSettings {...baseProps} />);

    await userEvent.click(
      screen.getByRole("button", { name: /check color contrast/i })
    );

    expect(capture).toHaveBeenCalledWith("theme_editor_contrast_check_opened");
  });

  it("captures theme_editor_import_css_applied with the parsed token counts", async () => {
    render(<PreferenceCenterSettings {...baseProps} />);

    await userEvent.click(
      screen.getByRole("button", { name: /^import css$/i })
    );
    // userEvent.type() parses `{`/`}` as special-key syntax - fireEvent sets
    // the raw value directly instead.
    fireEvent.change(screen.getByPlaceholderText(/--primary/i), {
      target: {
        value: ":root { --primary: oklch(0.55 0.2 260); }",
      },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^apply$/i })).toBeEnabled()
    );
    await userEvent.click(screen.getByRole("button", { name: /^apply$/i }));

    expect(capture).toHaveBeenCalledWith("theme_editor_import_css_applied", {
      dark_token_count: 0,
      light_token_count: 1,
    });
  });
});
