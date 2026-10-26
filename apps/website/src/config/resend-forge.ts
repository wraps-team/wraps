/**
 * Resend announced Forge, its own MTA on Resend-owned IPs, on 2026-10-23.
 * Pages whose Resend copy was revised for it render <ResendForgeNotice />,
 * which reads from here so the date and wording stay in one place.
 */
export const RESEND_FORGE = {
  updatedLabel: "Updated Oct 26, 2026",
  updatedIso: "2026-10-26",
  announcedLabel: "Oct 23, 2026",
  postUrl: "https://resend.com/blog/announcing-resend-forge",
  summary:
    "Resend historically sent through Amazon SES. On Oct 23, 2026 it announced Resend Forge, its own MTA on Resend-owned IP blocks, which domains can opt into. It does not name SES in the announcement and has published no pricing change.",
} as const;
