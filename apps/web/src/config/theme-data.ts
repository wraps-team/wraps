import type { ColorTheme } from "@/types/theme-customizer";
import { shadcnThemePresets } from "@/utils/shadcn-ui-theme-presets";
import { tweakcnPresets } from "@/utils/tweakcn-theme-presets";

// Tweakcn theme presets for the dropdown - convert from tweakcnPresets
export const tweakcnThemes: ColorTheme[] = Object.entries(tweakcnPresets).map(
  ([key, preset]) => ({
    name: preset.label || key,
    value: key,
    preset,
  })
);

// Shadcn theme presets for the dropdown - convert from shadcnThemePresets
export const colorThemes: ColorTheme[] = Object.entries(shadcnThemePresets).map(
  ([key, preset]) => ({
    name: preset.label || key,
    value: key,
    preset,
  })
);
