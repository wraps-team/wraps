/**
 * The notification email, in the Wraps design system: ink neutrals, a 12px
 * card, the orange primary button, the Wraps logo. Replaces the plugin's
 * generic `renderEmail` so notification mail matches the rest of what we send.
 *
 * Email-safe by construction: table layout, inline styles, system font stacks
 * (no webfonts load in mail clients). The `<style>` block only adds dark-mode
 * colors for clients that honor `prefers-color-scheme`; everything else gets
 * the light layout. Pure: no network, no env.
 */

import type { DeliveryContext } from "@byo-oss/notifications";
import { notificationUrl } from "@byo-oss/notifications/mailer";
import { escapeHtml } from "@wraps/email/lib/escape-html";

/** Public, absolute: mail clients cannot resolve app-relative paths. */
const LOGO_BASE_URL = "https://wraps.dev";
const FONT_SANS =
  "'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const FONT_DISPLAY = `'Space Grotesk',${FONT_SANS}`;
const FONT_MONO =
  "'JetBrains Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace";

const PREHEADER_MAX = 110;

function preheader(body: string | null | undefined, title: string): string {
  const text = (body || title).replace(/\s+/g, " ").trim();
  return text.length > PREHEADER_MAX
    ? `${text.slice(0, PREHEADER_MAX - 1)}…`
    : text;
}

export function renderNotificationEmail(ctx: DeliveryContext): {
  subject: string;
  html: string;
  text: string;
} {
  const { title, body } = ctx.notification;
  const url = notificationUrl(ctx);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(title)}</title>
<style>
@media (prefers-color-scheme: dark) {
  .w-bg { background:#09090b !important; }
  .w-card { background:#18181b !important; border-color:#27272a !important; }
  .w-title { color:#fafafa !important; }
  .w-text { color:#a1a1aa !important; }
  .w-muted { color:#71717a !important; }
  .w-btn { background:#fb923c !important; color:#09090b !important; }
  .w-logo-light { display:none !important; }
  .w-logo-dark { display:block !important; }
}
</style>
</head>
<body class="w-bg" style="margin:0;padding:0;background:#fafafa;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#fafafa;">${escapeHtml(preheader(body, title))}</div>
<table role="presentation" class="w-bg" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr>
          <td style="padding:0 4px 20px;">
            <img class="w-logo-light" src="${LOGO_BASE_URL}/wraps-light-logo.png" width="88" height="27" alt="Wraps" style="display:block;border:0;height:27px;width:88px;">
            <img class="w-logo-dark" src="${LOGO_BASE_URL}/wraps-dark-logo.png" width="88" height="27" alt="" style="display:none;border:0;height:27px;width:88px;">
          </td>
        </tr>
        <tr>
          <td class="w-card" style="background:#ffffff;border:1px solid #e4e4e7;border-radius:12px;padding:28px;">
            <h1 class="w-title" style="margin:0 0 12px;font-family:${FONT_DISPLAY};font-size:20px;line-height:1.35;font-weight:600;letter-spacing:-0.01em;color:#18181b;">${escapeHtml(title)}</h1>${
              body
                ? `
            <p class="w-text" style="margin:0 0 24px;font-family:${FONT_SANS};font-size:15px;line-height:1.6;color:#52525b;white-space:pre-line;">${escapeHtml(body)}</p>`
                : ""
            }${
              url
                ? `
            <a class="w-btn" href="${escapeHtml(url)}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#f97316;color:#ffffff;font-family:${FONT_SANS};font-size:14px;font-weight:600;line-height:20px;text-decoration:none;">View in Wraps</a>
            <p class="w-muted" style="margin:20px 0 0;font-family:${FONT_MONO};font-size:12px;line-height:1.5;color:#71717a;word-break:break-all;">${escapeHtml(url)}</p>`
                : ""
            }
          </td>
        </tr>
        <tr>
          <td class="w-muted" style="padding:20px 4px 0;font-family:${FONT_SANS};font-size:12px;line-height:1.5;color:#71717a;">
            You're receiving this because of activity on your Wraps account.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [title, body, url].filter(Boolean).join("\n\n");
  return { subject: title, html, text };
}
