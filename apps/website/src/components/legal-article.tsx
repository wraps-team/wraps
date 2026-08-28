import type { ReactNode } from "react";

/**
 * Typographic wrapper for the long-form legal pages (privacy, terms, DPA).
 *
 * These pages used to carry `prose prose-gray dark:prose-invert`, but
 * @tailwindcss/typography is not installed in this app — so every one of those
 * classes was inert. Headings rendered at body size, lists lost their bullets,
 * and each page was one undifferentiated wall of text. The rules below are
 * applied directly to the element tree instead, which keeps the page bodies
 * as plain semantic HTML.
 */
const CLASSES = [
  "max-w-none text-[15px] text-muted-foreground leading-[1.7]",
  "[&_h1]:mb-4 [&_h1]:font-heading [&_h1]:font-semibold [&_h1]:text-4xl [&_h1]:text-foreground [&_h1]:tracking-tight sm:[&_h1]:text-5xl",
  "[&_h2]:mt-12 [&_h2]:mb-3 [&_h2]:font-heading [&_h2]:font-semibold [&_h2]:text-2xl [&_h2]:text-foreground [&_h2]:tracking-tight",
  "[&_h3]:mt-7 [&_h3]:mb-2 [&_h3]:font-semibold [&_h3]:text-[17px] [&_h3]:text-foreground",
  "[&_p]:mb-4",
  // The markup already carries `className="lead"` on the opening paragraph,
  // which was another dead prose class. Give it something to do.
  "[&_.lead]:text-[17px] [&_.lead]:text-foreground",
  "[&_ul]:mb-5 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6",
  "[&_ol]:mb-5 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6",
  "[&_strong]:font-semibold [&_strong]:text-foreground",
  "[&_a]:text-primary [&_a]:underline",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-foreground",
  "[&_pre]:mb-5 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-[13px] [&_pre]:text-foreground",
  // A <code> inside <pre> must not repeat the inline pill treatment.
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[1em]",
  "[&_table]:mb-6 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-sm",
  "[&_th]:border-border [&_th]:border-b [&_th]:p-3 [&_th]:font-medium [&_th]:text-foreground",
  "[&_td]:border-border [&_td]:border-b [&_td]:p-3 [&_td]:align-top",
].join(" ");

export function LegalArticle({ children }: { children: ReactNode }) {
  return <article className={CLASSES}>{children}</article>;
}
