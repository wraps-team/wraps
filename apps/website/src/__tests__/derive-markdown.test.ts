import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DERIVE_MARKER_HEADER,
  deriveMarkdownFromHtml,
  fetchDerivedMarkdown,
} from "@/lib/derive-markdown";

/** Enough prose to clear MIN_USEFUL_CHARS without the fixtures being unreadable. */
const PROSE =
  "Wraps deploys SES, EventBridge, SQS, Lambda and DynamoDB into your own AWS account. ".repeat(
    4
  );

function page(body: string, title = "Suppression Lists | Wraps"): string {
  return `<html><head><title>${title}</title></head><body>${body}</body></html>`;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("deriveMarkdownFromHtml", () => {
  it("takes the title from <title>, minus the site suffix", () => {
    const markdown = deriveMarkdownFromHtml(
      page(`<main><p>${PROSE}</p></main>`),
      "/docs/guides/suppression-lists"
    );

    expect(markdown).toMatch(/^# Suppression Lists\n/);
    expect(markdown).not.toContain("| Wraps");
  });

  it("names the canonical URL so an agent can get back to the HTML", () => {
    const markdown = deriveMarkdownFromHtml(
      page(`<main><p>${PROSE}</p></main>`),
      "/byoc"
    );

    expect(markdown).toContain("Source: https://wraps.dev/byoc");
  });

  it("converts only <main> when the page has one", () => {
    const markdown = deriveMarkdownFromHtml(
      page(
        `<div>Sidebar junk that is not the page</div><main><p>${PROSE}</p></main>`
      ),
      "/byoc"
    );

    expect(markdown).not.toContain("Sidebar junk");
    expect(markdown).toContain("own AWS account");
  });

  it("drops chrome on the pages that render no <main>", () => {
    const markdown = deriveMarkdownFromHtml(
      page(
        `<nav>Pricing Docs Blog</nav><h1>Bring your own cloud</h1><p>${PROSE}</p><footer>All rights reserved</footer>`
      ),
      "/byoc"
    );

    expect(markdown).toContain("Bring your own cloud");
    expect(markdown).not.toContain("Pricing Docs Blog");
    expect(markdown).not.toContain("All rights reserved");
  });

  it("keeps tables — they are the whole content of the pricing and comparison pages", () => {
    const markdown = deriveMarkdownFromHtml(
      page(
        `<main><table><thead><tr><th>Plan</th><th>Price</th></tr></thead>` +
          `<tbody><tr><td>Free</td><td>$0</td></tr></tbody></table><p>${PROSE}</p></main>`
      ),
      "/pricing"
    );

    expect(markdown).toContain("| Plan | Price |");
    expect(markdown).toContain("| Free | $0 |");
  });

  it("keeps fenced code — the docs are mostly snippets", () => {
    const markdown = deriveMarkdownFromHtml(
      page(
        `<main><pre><code>npx @wraps.dev/cli email init</code></pre><p>${PROSE}</p></main>`
      ),
      "/cli"
    );

    expect(markdown).toContain("```");
    expect(markdown).toContain("npx @wraps.dev/cli email init");
  });

  it("strips the RSC payload and inline scripts rather than converting them", () => {
    const markdown = deriveMarkdownFromHtml(
      page(
        `<main><p>${PROSE}</p><script>self.__next_f.push([1,"secret payload"])</script></main>`
      ),
      "/byoc"
    );

    expect(markdown).not.toContain("secret payload");
    expect(markdown).not.toContain("__next_f");
  });

  it("absolutises site-relative links — this markdown is read off wraps.dev", () => {
    const markdown = deriveMarkdownFromHtml(
      page(
        `<main><p>${PROSE}</p><p><a href="/docs/quickstart/email">Quickstart</a>, ` +
          `<a href="https://app.wraps.dev/auth">Sign up</a>, <a href="#pricing">Pricing</a></p></main>`
      ),
      "/byoc"
    );

    expect(markdown).toContain("(https://wraps.dev/docs/quickstart/email)");
    // Already absolute, and an in-page anchor: both left alone.
    expect(markdown).toContain("(https://app.wraps.dev/auth)");
    expect(markdown).toContain("(#pricing)");
  });

  it("returns undefined for a shell that rendered no prose", () => {
    expect(
      deriveMarkdownFromHtml(page("<main><div></div></main>"), "/byoc")
    ).toBeUndefined();
  });
});

describe("fetchDerivedMarkdown", () => {
  it("marks its own request so middleware can let the render through", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(page(`<main><p>${PROSE}</p></main>`), { status: 200 })
      );

    await fetchDerivedMarkdown("/security", "https://wraps.dev");

    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)[DERIVE_MARKER_HEADER]).toBe(
      "1"
    );
  });

  it("returns undefined when the page 404s, so the caller can answer with its own body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Not found", { status: 404 })
    );

    expect(
      await fetchDerivedMarkdown("/not-a-page", "https://wraps.dev")
    ).toBeUndefined();
  });

  it("returns undefined rather than throwing when the render fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    vi.spyOn(console, "warn").mockImplementation(() => {
      // The warning is the point of the branch; keep it out of test output.
    });

    expect(
      await fetchDerivedMarkdown("/dpa", "https://wraps.dev")
    ).toBeUndefined();
  });

  // Each test above uses its own path on purpose: the memo below is process-
  // wide, so a shared path would let one test's result answer another's.
  it("renders a given page once per instance — the memo is what keeps the self-fetch off the hot path", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(page(`<main><p>${PROSE}</p></main>`), { status: 200 })
      );

    const first = await fetchDerivedMarkdown("/inbound", "https://wraps.dev");
    const second = await fetchDerivedMarkdown("/inbound", "https://wraps.dev");

    expect(second).toBe(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
