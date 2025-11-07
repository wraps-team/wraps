"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ColorPickerProps {
  label: string;
  cssVar: string;
  value: string;
  onChange: (cssVar: string, value: string) => void;
}

export function ColorPicker({
  label,
  cssVar,
  value,
  onChange,
}: ColorPickerProps) {
  const [localValue, setLocalValue] = React.useState(value);

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    setLocalValue(newColor);
    onChange(cssVar, newColor);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    onChange(cssVar, newValue);
  };

  // Get current computed color for display
  const displayColor = React.useMemo(() => {
    if (localValue && localValue.startsWith("#")) {
      return localValue;
    }

    // Try to get computed value from CSS
    const computed = getComputedStyle(document.documentElement)
      .getPropertyValue(cssVar)
      .trim();
    if (computed && computed.startsWith("#")) {
      return computed;
    }

    return "#000000";
  }, [localValue, cssVar]);

  return (
    <div className="space-y-2">
      <Label className="font-medium text-xs" htmlFor={`color-${cssVar}`}>
        {label}
      </Label>
      <div className="flex items-start gap-2">
        <div className="relative">
          <Button
            className="h-8 w-8 cursor-pointer overflow-hidden p-0"
            style={{ backgroundColor: displayColor }}
            type="button"
            variant="outline"
          >
            <input
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              id={`color-${cssVar}`}
              onChange={handleColorChange}
              type="color"
              value={displayColor}
            />
          </Button>
        </div>
        <Input
          className="h-8 flex-1 text-xs"
          onChange={handleTextChange}
          placeholder={`${cssVar} value`}
          type="text"
          value={localValue}
        />
      </div>
    </div>
  );
}
