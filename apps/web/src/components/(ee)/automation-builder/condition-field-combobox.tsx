"use client";

import { Check, ChevronsUpDown, Pencil } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { usePropertyKeys } from "@/hooks/use-property-keys";
import { CONDITION_FIELD_GROUPS, getFieldLabel } from "@/lib/condition-fields";
import { cn } from "@/lib/utils";

type ConditionFieldComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  organizationId: string;
};

export function ConditionFieldCombobox({
  value,
  onChange,
  organizationId,
}: ConditionFieldComboboxProps) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const listboxId = useId();

  const { data: propertyKeys = [] } = usePropertyKeys(organizationId);

  if (customMode) {
    return (
      <div className="flex gap-2">
        <Input
          autoFocus
          className="flex-1"
          onChange={(e) => setCustomValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && customValue.trim()) {
              onChange(customValue.trim());
              setCustomMode(false);
              setCustomValue("");
            }
            if (e.key === "Escape") {
              setCustomMode(false);
              setCustomValue("");
            }
          }}
          placeholder="e.g., properties.plan"
          value={customValue}
        />
        <Button
          disabled={!customValue.trim()}
          onClick={() => {
            onChange(customValue.trim());
            setCustomMode(false);
            setCustomValue("");
          }}
          size="sm"
          variant="outline"
        >
          Set
        </Button>
      </div>
    );
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-controls={listboxId}
          aria-expanded={open}
          className="w-full justify-between font-normal"
          role="combobox"
          variant="outline"
        >
          <span className={cn(!value && "text-muted-foreground")}>
            {value ? getFieldLabel(value) : "Select field..."}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command>
          <CommandInput placeholder="Search fields..." />
          <CommandList id={listboxId}>
            <CommandEmpty>No fields found.</CommandEmpty>

            {CONDITION_FIELD_GROUPS.map((group) => (
              <CommandGroup heading={group.label} key={group.label}>
                {group.fields.map((field) => (
                  <CommandItem
                    key={field.value}
                    onSelect={() => {
                      onChange(field.value);
                      setOpen(false);
                    }}
                    value={field.value}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === field.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {field.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

            {propertyKeys.length > 0 && (
              <CommandGroup heading="Custom Properties">
                {propertyKeys.map((key) => {
                  const fieldValue = `properties.${key}`;
                  return (
                    <CommandItem
                      key={fieldValue}
                      onSelect={() => {
                        onChange(fieldValue);
                        setOpen(false);
                      }}
                      value={fieldValue}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === fieldValue ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {key}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  setOpen(false);
                  setCustomMode(true);
                }}
                value="__custom__"
              >
                <Pencil className="mr-2 h-4 w-4" />
                Custom...
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
