import type { ReactNode } from "react";

/**
 * The /topics page heading. Every page state renders it, so assistive tech
 * and tab-switching always have a page identity (audit F19). `action` sits on
 * the heading's row and wraps under it on narrow screens.
 */
export function TopicsHeading({ action }: { action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-4 lg:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-bold text-2xl tracking-tight">Topics</h1>
        <p className="text-muted-foreground">
          Manage subscription topics for your audience
        </p>
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
