/**
 * The branded notification email. Pure rendering: no database, no SES.
 */

import type { DeliveryContext } from "@byo-oss/notifications";
import { describe, expect, it } from "vitest";
import { renderNotificationEmail } from "../notification-email";

function ctx(
  notification: Partial<DeliveryContext["notification"]>,
  { appUrl = "https://app.wraps.dev" }: { appUrl?: string | null } = {}
): DeliveryContext {
  return {
    notification: {
      id: "n1",
      userId: "u1",
      title: "Title",
      ...notification,
    } as DeliveryContext["notification"],
    user: { id: "u1", email: "a@example.com" } as DeliveryContext["user"],
    appUrl: appUrl ?? undefined,
  };
}

describe("renderNotificationEmail", () => {
  it("uses the title as the subject and resolves a relative href against appUrl", () => {
    const out = renderNotificationEmail(
      ctx({ title: "SES sending paused", href: "/acme/settings" })
    );
    expect(out.subject).toBe("SES sending paused");
    expect(out.html).toContain('href="https://app.wraps.dev/acme/settings"');
    expect(out.text).toContain("https://app.wraps.dev/acme/settings");
  });

  it("escapes title and body in html and leaves text unescaped", () => {
    const out = renderNotificationEmail(
      ctx({ title: "<b>x</b> & y", body: `"quoted" <script>` })
    );
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;b&gt;x&lt;/b&gt; &amp; y");
    expect(out.text).toContain("<b>x</b> & y");
  });

  it("renders the Wraps brand: orange button, ink text, absolute logo URLs", () => {
    const { html } = renderNotificationEmail(ctx({ href: "/x" }));
    expect(html).toContain("#f97316");
    expect(html).toContain("#18181b");
    expect(html).toContain("border-radius:12px");
    expect(html).toContain('src="https://wraps.dev/wraps-light-logo.png"');
    expect(html).toContain('src="https://wraps.dev/wraps-dark-logo.png"');
  });

  it("carries dark-mode colors for clients that support them", () => {
    const { html } = renderNotificationEmail(ctx({}));
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain('name="color-scheme"');
  });

  it("omits the body paragraph and button when there is neither body nor a link target", () => {
    const { html, text } = renderNotificationEmail(
      ctx({ title: "Just a title" }, { appUrl: null })
    );
    expect(html).not.toContain("View in Wraps");
    expect(text).toBe("Just a title");
  });

  it("keeps an absolute href as-is", () => {
    const { html } = renderNotificationEmail(
      ctx({ href: "https://status.wraps.dev/incident/1" })
    );
    expect(html).toContain('href="https://status.wraps.dev/incident/1"');
  });

  it("truncates a long body in the preheader only", () => {
    const body = "word ".repeat(80);
    const { html } = renderNotificationEmail(ctx({ body }));
    const pre = html.match(/opacity:0[^>]*>([^<]*)</)?.[1] ?? "";
    expect(pre.length).toBeLessThanOrEqual(110);
    expect(pre.endsWith("…")).toBe(true);
  });
});
