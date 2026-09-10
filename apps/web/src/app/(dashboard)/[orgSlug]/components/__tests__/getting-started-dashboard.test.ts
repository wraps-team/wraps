import { describe, expect, it } from "vitest";
import { generateQuickCreateUrl } from "../getting-started-dashboard";

// The params live in the URL fragment, not the query string, so
// `new URL(url).searchParams` finds nothing. Strip the fragment marker
// first, matching the idiom used in cli-deploy-connect-step.test.tsx.
function paramsOf(url: string): URLSearchParams {
  return new URL(url.replace("#/", "")).searchParams;
}

describe("generateQuickCreateUrl", () => {
  it("omits param_Domain and param_MailFromSubdomain when no domain is supplied", () => {
    const url = generateQuickCreateUrl("org-1", "secret-1");
    const params = paramsOf(url);

    expect(params.has("param_Domain")).toBe(false);
    expect(params.has("param_MailFromSubdomain")).toBe(false);
    expect(params.get("param_WrapsOrganizationId")).toBe("org-1");
    expect(params.get("param_WrapsWebhookSecret")).toBe("secret-1");
  });

  it("omits param_Domain and param_MailFromSubdomain for a whitespace-only domain", () => {
    const url = generateQuickCreateUrl("org-1", "secret-1", "   ");
    const params = paramsOf(url);

    expect(params.has("param_Domain")).toBe(false);
    expect(params.has("param_MailFromSubdomain")).toBe(false);
  });

  it("includes param_Domain and param_MailFromSubdomain when a domain is supplied", () => {
    const url = generateQuickCreateUrl("org-1", "secret-1", "example.com");
    const params = paramsOf(url);

    expect(params.get("param_Domain")).toBe("example.com");
    expect(params.get("param_MailFromSubdomain")).toBe("mail");
  });

  it("trims surrounding whitespace from the supplied domain", () => {
    const url = generateQuickCreateUrl("org-1", "secret-1", "  example.com  ");
    const params = paramsOf(url);

    expect(params.get("param_Domain")).toBe("example.com");
  });
});
