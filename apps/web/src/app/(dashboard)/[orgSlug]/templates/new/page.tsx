import { NewTemplateForm } from "@/components/template-editor/new-template-form";

type PageProps = {
  params: Promise<{
    orgSlug: string;
  }>;
};

export default async function NewTemplatePage({ params }: PageProps) {
  const { orgSlug } = await params;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 lg:px-6">
      <h1 className="mb-6 font-semibold text-2xl">Create New Template</h1>
      <NewTemplateForm orgSlug={orgSlug} />
    </div>
  );
}
