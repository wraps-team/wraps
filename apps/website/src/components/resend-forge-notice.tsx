import { Info } from "lucide-react";
import { RESEND_FORGE } from "@/config/resend-forge";

/**
 * Dated callout for pages whose Resend copy was revised after Resend Forge.
 * Server component: no state, so it can sit in any page or article.
 */
export function ResendForgeNotice({
  className = "",
  variant = "banner",
}: {
  className?: string;
  /** "inline" is a one-line tag for list rows and cards. */
  variant?: "banner" | "inline";
}) {
  if (variant === "inline") {
    return (
      // A span, not a link: this tag sits inside card links on index pages.
      <span
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-foreground text-xs ${className}`}
      >
        <Info aria-hidden="true" className="h-3 w-3 text-primary" />
        <time dateTime={RESEND_FORGE.updatedIso}>
          {RESEND_FORGE.updatedLabel}
        </time>
        <span className="text-muted-foreground">· Resend Forge</span>
      </span>
    );
  }

  return (
    <aside
      aria-label="Resend update"
      className={`rounded-lg border-primary border-l-4 bg-primary/10 p-5 ${className}`}
    >
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="font-medium">
            <time dateTime={RESEND_FORGE.updatedIso}>
              {RESEND_FORGE.updatedLabel}
            </time>
            : Resend now has its own mail engine
          </p>
          <p className="mt-2 text-foreground/80 leading-relaxed">
            Resend has historically sent through Amazon SES. On{" "}
            {RESEND_FORGE.announcedLabel} it announced{" "}
            <a
              className="text-primary underline"
              href={RESEND_FORGE.postUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Resend Forge
            </a>
            , an MTA it built itself and runs on its own IP blocks, which
            domains can opt into. We have revised this page to match. The
            ownership point is unchanged: the IPs, the reputation and the
            delivery history sit with Resend, not with you.
          </p>
        </div>
      </div>
    </aside>
  );
}
