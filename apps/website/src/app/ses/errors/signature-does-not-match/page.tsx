import {
  SesErrorArticle,
  sesErrorMetadata,
} from "@/components/ses-error-article";
import { sesErrorBySlug } from "@/lib/ses-errors";

const error = sesErrorBySlug("signature-does-not-match");

export const metadata = sesErrorMetadata(error);

export default function Page() {
  return <SesErrorArticle error={error} />;
}
