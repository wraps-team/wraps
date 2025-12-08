import { TemplatesList } from "@/components/template-editor/templates-list";

type PageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function TemplatesPage({ params }: PageProps) {
  const { orgSlug } = await params;

  return (
    <div className="px-4 lg:px-6">
      <div className="mb-6">
        <h1 className="font-semibold text-2xl">Email Templates</h1>
        <p className="text-muted-foreground">
          Create and manage your email templates
        </p>
      </div>
      <TemplatesList orgSlug={orgSlug} />
    </div>
  );
}
