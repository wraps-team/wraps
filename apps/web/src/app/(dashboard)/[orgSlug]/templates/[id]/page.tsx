import { TemplateEditor } from "@/components/template-editor/template-editor";

type PageProps = {
  params: Promise<{
    orgSlug: string;
    id: string;
  }>;
};

export default async function TemplateEditorPage({ params }: PageProps) {
  const { orgSlug, id } = await params;

  // Negative margins cancel out the dashboard layout padding
  // Key forces remount when navigating between templates (TipTap editor caching issue)
  return (
    <TemplateEditor
      className="-my-4 md:-my-6"
      key={id}
      orgSlug={orgSlug}
      templateId={id}
    />
  );
}
