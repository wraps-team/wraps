import { Skeleton } from "@wraps/ui/components/ui/skeleton";

/**
 * Loading state for the template editor.
 *
 * The editor is a two-pane surface (source on one side, preview/chat on the
 * other), so a full-height two-column split reads far better here than a
 * centred spinner or a single stacked block.
 */
export default function TemplateEditorLoading() {
  return (
    <div
      className="grid h-full grid-cols-1 gap-4 p-4 lg:grid-cols-2"
      data-testid="template-editor-loading"
    >
      <Skeleton className="h-full min-h-96 w-full" />
      <Skeleton className="h-full min-h-96 w-full" />
    </div>
  );
}
