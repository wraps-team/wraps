export type ThemePreset = {
  label?: string;
  styles: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
};

export type ColorTheme = {
  name: string;
  value: string;
  preset: ThemePreset;
};

export type SidebarVariant = {
  name: string;
  value: "sidebar" | "floating" | "inset";
  description: string;
};

export type SidebarCollapsibleOption = {
  name: string;
  value: "offcanvas" | "icon" | "none";
  description: string;
};

export type SidebarSideOption = {
  name: string;
  value: "left" | "right";
};

export type RadiusOption = {
  name: string;
  value: string;
};

export type BrandColor = {
  name: string;
  cssVar: string;
};

export type ImportedTheme = {
  light: Record<string, string>;
  dark: Record<string, string>;
};
