"use client";

import { useTheme } from "next-themes";
import * as React from "react";
import { CopyButton } from "@/components/ui/shadcn-io/copy-button";
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  type TabsProps,
  TabsTrigger,
  useTabs,
} from "@/components/ui/shadcn-io/tabs";
import { cn } from "@/lib/utils";

type CodeTabsProps = {
  codes: Record<string, string>;
  lang?: string;
  themes?: {
    light: string;
    dark: string;
  };
  copyButton?: boolean;
  /** Called when copy is attempted. Return false to prevent copy action. */
  onCopy?: (content: string) => undefined | boolean;
} & Omit<TabsProps, "children">;

function CodeTabsContent({
  codes,
  lang = "bash",
  themes = {
    light: "github-light",
    dark: "github-dark",
  },
  copyButton = true,
  onCopy,
}: {
  codes: Record<string, string>;
  lang?: string;
  themes?: { light: string; dark: string };
  copyButton?: boolean;
  onCopy?: (content: string) => undefined | boolean;
}) {
  const { resolvedTheme } = useTheme();
  const { activeValue } = useTabs();

  const [highlightedCodes, setHighlightedCodes] =
    React.useState<Record<string, string>>(codes); // Start with raw codes for instant rendering

  React.useEffect(() => {
    async function loadHighlightedCode() {
      try {
        const { codeToHtml } = await import("shiki");
        const newHighlightedCodes: Record<string, string> = {};

        for (const [command, val] of Object.entries(codes)) {
          const highlighted = await codeToHtml(val, {
            lang,
            themes: {
              light: themes.light,
              dark: themes.dark,
            },
            defaultColor: resolvedTheme === "dark" ? "dark" : "light",
          });

          newHighlightedCodes[command] = highlighted;
        }

        setHighlightedCodes(newHighlightedCodes);
      } catch (error) {
        console.error("Error highlighting codes", error);
      }
    }
    loadHighlightedCode();
  }, [resolvedTheme, lang, themes.light, themes.dark, codes]);

  return (
    <>
      <TabsList
        activeClassName="rounded-none shadow-none bg-transparent after:content-[''] after:absolute after:inset-x-0 after:h-0.5 after:bottom-0 dark:after:bg-white after:bg-black after:rounded-t-full"
        className="relative h-10 w-full justify-between rounded-none border-border/75 border-b bg-muted px-4 py-0 text-current dark:border-border/50"
        data-slot="install-tabs-list"
      >
        <div className="flex h-full gap-x-3">
          {Object.keys(codes).map((code) => (
            <TabsTrigger
              className="px-0 text-muted-foreground data-[state=active]:text-current"
              key={code}
              value={code}
            >
              {code}
            </TabsTrigger>
          ))}
        </div>

        {copyButton && (
          <CopyButton
            className="-me-2 bg-transparent hover:bg-black/5 dark:hover:bg-white/10"
            content={codes[activeValue]}
            onCopy={onCopy}
            size="sm"
            variant="ghost"
          />
        )}
      </TabsList>
      <TabsContents data-slot="install-tabs-contents">
        {Object.entries(codes).map(([code, rawCode]) => (
          <TabsContent
            className="flex w-full items-center overflow-auto p-4 text-sm"
            data-slot="install-tabs-content"
            key={code}
            value={code}
          >
            <div className="w-full [&>pre]:m-0 [&>pre]:border-none [&>pre]:bg-transparent! [&>pre]:p-0 [&>pre]:text-[13px] [&>pre]:leading-relaxed [&_.shiki]:bg-transparent! [&_code]:bg-transparent! [&_code]:text-[13px] [&_code]:leading-relaxed">
              {highlightedCodes[code] !== rawCode ? (
                <div
                  dangerouslySetInnerHTML={{ __html: highlightedCodes[code] }}
                />
              ) : (
                <pre>
                  <code>{rawCode}</code>
                </pre>
              )}
            </div>
          </TabsContent>
        ))}
      </TabsContents>
    </>
  );
}

function CodeTabs({
  codes,
  lang = "bash",
  themes = {
    light: "github-light",
    dark: "github-dark",
  },
  className,
  defaultValue,
  value,
  onValueChange,
  copyButton = true,
  onCopy,
  ...props
}: CodeTabsProps) {
  const firstKey = React.useMemo(() => Object.keys(codes)[0] ?? "", [codes]);

  // Handle controlled vs uncontrolled properly
  const tabsProps =
    value !== undefined
      ? { value, onValueChange }
      : { defaultValue: defaultValue ?? firstKey };

  return (
    <Tabs
      className={cn(
        "w-full gap-0 overflow-hidden rounded-xl border bg-muted/50",
        className
      )}
      data-slot="install-tabs"
      {...tabsProps}
      {...(props as any)}
    >
      <CodeTabsContent
        codes={codes}
        copyButton={copyButton}
        lang={lang}
        onCopy={onCopy}
        themes={themes}
      />
    </Tabs>
  );
}

export { CodeTabs, type CodeTabsProps };
