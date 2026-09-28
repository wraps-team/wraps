import {
  GlossaryArticle,
  glossaryMetadata,
} from "@/components/glossary-article";
import { glossaryTermBySlug } from "@/lib/glossary";

const term = glossaryTermBySlug("ip-warming");

export const metadata = glossaryMetadata(term);

export default function Page() {
  return <GlossaryArticle term={term} />;
}
