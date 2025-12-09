"use client";

import { Braces, X } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { VariableItem } from "./extensions/variable-suggestion";

// Default variables for subject line
const defaultVariables: VariableItem[] = [
  { name: "firstName", label: "First Name", type: "text" },
  { name: "lastName", label: "Last Name", type: "text" },
  { name: "email", label: "Email Address", type: "email" },
  { name: "companyName", label: "Company Name", type: "text" },
];

type VariableInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  variables?: VariableItem[];
  id?: string;
};

export const VariableInput = forwardRef<HTMLInputElement, VariableInputProps>(
  (
    {
      value,
      onChange,
      placeholder,
      className,
      variables = defaultVariables,
      id,
    },
    ref
  ) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [cursorPosition, setCursorPosition] = useState(0);
    const [triggerPosition, setTriggerPosition] = useState<number | null>(null);

    // Forward ref to internal input
    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    // Filter variables based on search
    const filteredVariables = variables.filter(
      (v) =>
        v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.label.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const closePopover = useCallback(() => {
      setIsOpen(false);
      setTriggerPosition(null);
      setSearchQuery("");
    }, []);

    // Handle input change - detect {{ trigger
    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        const cursor = e.target.selectionStart ?? 0;

        onChange(newValue);
        setCursorPosition(cursor);

        // Check if we just typed {{ (look back 2 characters from cursor)
        if (cursor >= 2) {
          const lastTwo = newValue.slice(cursor - 2, cursor);
          if (lastTwo === "{{") {
            setTriggerPosition(cursor - 2);
            setSearchQuery("");
            setIsOpen(true);
            return;
          }
        }

        // If popover is open, update search query
        if (isOpen && triggerPosition !== null) {
          // Extract text between {{ and cursor
          const textAfterTrigger = newValue.slice(triggerPosition + 2, cursor);
          // If user typed }}, close popover
          if (textAfterTrigger.includes("}}")) {
            closePopover();
          } else {
            setSearchQuery(textAfterTrigger);
          }
        }
      },
      [onChange, isOpen, triggerPosition, closePopover]
    );

    // Handle variable selection
    const handleSelectVariable = useCallback(
      (variable: VariableItem) => {
        if (triggerPosition === null) return;

        // Replace from trigger position to current cursor with the variable
        const before = value.slice(0, triggerPosition);
        const after = value.slice(cursorPosition);
        const newValue = `${before}{{${variable.name}}}${after}`;

        onChange(newValue);
        closePopover();

        // Focus input and set cursor after the inserted variable
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            const newCursorPos = triggerPosition + variable.name.length + 4; // +4 for {{ and }}
            inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
          }
        }, 0);
      },
      [value, onChange, triggerPosition, cursorPosition, closePopover]
    );

    // Handle manual variable button click
    const handleVariableButtonClick = useCallback(() => {
      const cursor = inputRef.current?.selectionStart ?? value.length;
      const before = value.slice(0, cursor);
      const after = value.slice(cursor);

      // Insert {{ at cursor position
      const newValue = `${before}{{${after}`;
      onChange(newValue);
      setCursorPosition(cursor + 2);
      setTriggerPosition(cursor);
      setSearchQuery("");
      setIsOpen(true);

      // Focus input
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }, [value, onChange]);

    // Close popover on escape
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && isOpen) {
          e.preventDefault();
          e.stopPropagation();
          closePopover();
        }
      };

      document.addEventListener("keydown", handleKeyDown, true);
      return () => document.removeEventListener("keydown", handleKeyDown, true);
    }, [isOpen, closePopover]);

    // Close popover when clicking outside
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (
          isOpen &&
          popoverRef.current &&
          !popoverRef.current.contains(e.target as Node) &&
          inputRef.current &&
          !inputRef.current.contains(e.target as Node)
        ) {
          closePopover();
        }
      };

      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }, [isOpen, closePopover]);

    return (
      <div className="relative flex flex-1 items-center gap-1">
        <Input
          className={cn("pr-8", className)}
          id={id}
          onChange={handleInputChange}
          placeholder={placeholder}
          ref={inputRef}
          value={value}
        />

        {/* Variable picker popover - manually positioned */}
        {isOpen && (
          <div
            className="absolute top-full left-0 z-50 mt-1 w-72 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
            ref={popoverRef}
          >
            <div className="flex items-center justify-between border-b px-3 py-2">
              <span className="font-medium text-sm">Insert Variable</span>
              <Button
                className="h-6 w-6 p-0"
                onClick={closePopover}
                size="sm"
                type="button"
                variant="ghost"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
            <Command>
              <CommandInput
                className="h-9"
                onValueChange={setSearchQuery}
                placeholder="Search variables..."
                value={searchQuery}
              />
              <CommandList>
                <CommandEmpty>No variables found.</CommandEmpty>
                <CommandGroup>
                  {filteredVariables.map((variable) => (
                    <CommandItem
                      className="flex cursor-pointer items-center gap-2"
                      key={variable.name}
                      onSelect={() => handleSelectVariable(variable)}
                    >
                      <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-100 dark:bg-blue-900">
                        <Braces className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">
                          {variable.label}
                        </span>
                        <span className="font-mono text-muted-foreground text-xs">
                          {`{{${variable.name}}}`}
                        </span>
                      </div>
                      <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
                        {variable.type}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
            <div className="border-t px-3 py-2">
              <p className="text-muted-foreground text-xs">
                Press <kbd className="rounded bg-muted px-1 font-mono">Esc</kbd>{" "}
                to close
              </p>
            </div>
          </div>
        )}

        {/* Variable button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="absolute right-1 h-6 w-6 p-0"
              onClick={handleVariableButtonClick}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Braces className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Insert variable (type {"{{"})</p>
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }
);

VariableInput.displayName = "VariableInput";
