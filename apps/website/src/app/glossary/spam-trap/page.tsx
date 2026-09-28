import {
  GlossaryArticle,
  glossaryMetadata,
} from "@/components/glossary-article";
import { glossaryTermBySlug } from "@/lib/glossary";

const term = glossaryTermBySlug("spam-trap");

export const metadata = glossaryMetadata(term);

export default function Page() {
  return <GlossaryArticle term={term} />;
}
