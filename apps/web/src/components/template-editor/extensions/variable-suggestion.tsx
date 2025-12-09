"use client";

import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { Braces, X } from "lucide-react";
import type React from "react";
import {
  createRef,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export type VariableItem = {
  name: string;
  label: string;
  type: "text" | "number" | "boolean" | "date" | "url" | "email";
  description?: string;
};

type SuggestionRef = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

type SuggestionListProps = {
  items: VariableItem[];
  command: (item: VariableItem) => void;
  clientRect: (() => DOMRect | null) | null;
  onCloseRef: React.MutableRefObject<(() => void) | null>;
};

const SuggestionList = forwardRef<SuggestionRef, SuggestionListProps>(
  ({ items, command, clientRect, onCloseRef }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) {
        command(item);
      }
    };

    const handleClose = () => {
      onCloseRef.current?.();
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
          return true;
        }

        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
          return true;
        }

        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }

        return false;
      },
    }));

    useEffect(() => {
      setSelectedIndex(0);
    }, []);

    const rect = clientRect?.();
    if (!rect) {
      return null;
    }

    return createPortal(
      <div
        className="z-50 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        style={{
          position: "fixed",
          top: rect.bottom + 8,
          left: rect.left,
          minWidth: 280,
        }}
      >
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="font-medium text-sm">Insert Variable</span>
          <Button
            className="h-6 w-6 p-0"
            onClick={handleClose}
            size="sm"
            type="button"
            variant="ghost"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        </div>
        <Command>
          <CommandInput className="h-9" placeholder="Search variables..." />
          <CommandList>
            <CommandEmpty>No variables found.</CommandEmpty>
            <CommandGroup>
              {items.map((item, index) => (
                <CommandItem
                  className={cn(
                    "flex cursor-pointer items-center gap-2",
                    index === selectedIndex && "bg-accent"
                  )}
                  key={item.name}
                  onSelect={() => selectItem(index)}
                >
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-100 dark:bg-blue-900">
                    <Braces className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{item.label}</span>
                    <span className="font-mono text-muted-foreground text-xs">
                      {`{{${item.name}}}`}
                    </span>
                  </div>
                  <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-muted-foreground text-xs">
                    {item.type}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
        <div className="border-t px-3 py-2">
          <p className="text-muted-foreground text-xs">
            Press <kbd className="rounded bg-muted px-1 font-mono">Esc</kbd> to
            close
          </p>
        </div>
      </div>,
      document.body
    );
  }
);

SuggestionList.displayName = "SuggestionList";

// Default variables - these can be overridden via extension options
const defaultVariables: VariableItem[] = [
  { name: "firstName", label: "First Name", type: "text" },
  { name: "lastName", label: "Last Name", type: "text" },
  { name: "email", label: "Email Address", type: "email" },
  { name: "companyName", label: "Company Name", type: "text" },
  { name: "unsubscribeUrl", label: "Unsubscribe URL", type: "url" },
  { name: "preferencesUrl", label: "Preferences URL", type: "url" },
];

type VariableSuggestionOptions = {
  variables?: VariableItem[];
  onVariablesLoad?: () => Promise<VariableItem[]>;
};

export const VariableSuggestion = Extension.create<VariableSuggestionOptions>({
  name: "variableSuggestion",

  addOptions() {
    return {
      variables: defaultVariables,
      onVariablesLoad: undefined,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    const editor = this.editor;

    return [
      Suggestion<VariableItem>({
        editor,
        char: "{{",
        allowSpaces: false,

        items: async ({ query }) => {
          // Load variables from callback if provided
          let variables = options.variables || defaultVariables;
          if (options.onVariablesLoad) {
            try {
              variables = await options.onVariablesLoad();
            } catch {
              // Fall back to default variables
            }
          }

          return variables.filter(
            (item) =>
              item.name.toLowerCase().includes(query.toLowerCase()) ||
              item.label.toLowerCase().includes(query.toLowerCase())
          );
        },

        render: () => {
          let popup: HTMLDivElement | null = null;
          let root: ReturnType<
            typeof import("react-dom/client").createRoot
          > | null = null;
          let componentRef: SuggestionRef | null = null;

          // Use a ref object so the close function is always up-to-date
          const onCloseRef = createRef<
            (() => void) | null
          >() as React.MutableRefObject<(() => void) | null>;

          const closePopup = () => {
            root?.unmount();
            popup?.remove();
            popup = null;
            root = null;
          };

          // Keep the ref updated with the latest closePopup
          onCloseRef.current = closePopup;

          return {
            onStart: (props) => {
              popup = document.createElement("div");
              document.body.appendChild(popup);

              import("react-dom/client").then(({ createRoot }) => {
                root = createRoot(popup!);
                root.render(
                  <SuggestionList
                    clientRect={props.clientRect ?? null}
                    command={props.command}
                    items={props.items}
                    onCloseRef={onCloseRef}
                    ref={(ref) => {
                      componentRef = ref;
                    }}
                  />
                );
              });
            },

            onUpdate: (props) => {
              if (popup && root) {
                root.render(
                  <SuggestionList
                    clientRect={props.clientRect ?? null}
                    command={props.command}
                    items={props.items}
                    onCloseRef={onCloseRef}
                    ref={(ref) => {
                      componentRef = ref;
                    }}
                  />
                );
              }
            },

            onKeyDown: (props) => {
              if (props.event.key === "Escape") {
                closePopup();
                return true;
              }
              return componentRef?.onKeyDown(props) ?? false;
            },

            onExit: () => {
              closePopup();
            },
          };
        },

        command: ({ editor, range, props }) => {
          const item = props;

          // Delete the trigger characters and insert the variable node
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: "variable",
              attrs: {
                name: item.name,
                label: item.label,
                fallback: "",
                format: null,
              },
            })
            .run();
        },
      }),
    ];
  },
});
